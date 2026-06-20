#!/usr/bin/env python3
"""End-to-end QA test suite for ShepherdsCore Cloud auth flow.

Uses subprocess+curl for all HTTP calls (avoids Python 3.9/LibreSSL issues).
User creation uses the Supabase Admin API (service role) so email domain
validation is skipped and no confirmation email is required.
"""

import json
import base64
import time
import sys
import subprocess
import hmac
import hashlib

# ── Config ───────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://fjlaxflqzkctuonevpiw.supabase.co"
SERVICE_KEY  = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
                ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqbGF4ZmxxemtjdHVvbmV2cGl3Iiwicm9sZSI6"
                "InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjA5MTI1MCwiZXhwIjoyMDkxNjY3MjUwfQ"
                ".4rA3zpnlIjKGY0itUYal95qFzmJqtPRoiJivjpMaKN0")
JWT_SECRET   = "87136379-1A16-47AF-B6AE-97AA0C683B94"
BACKEND      = "http://localhost:8000"
FRONTEND     = "http://localhost:5173"

TEST_EMAIL    = f"qa_test_{int(time.time())}@shepherdscore.io"
TEST_PASSWORD = "QaTestPass123!"

RESULTS = []
state   = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def section(title):
    print(f"\n{'─'*60}")
    print(f"  {title}")
    print('─'*60)


def record(num, name, passed, detail=""):
    tag = "✅ PASS" if passed else "❌ FAIL"
    print(f"{tag}  [{num:02d}] {name}")
    for line in str(detail).split("\n"):
        if line:
            print(f"       {line}")
    RESULTS.append((num, name, passed, detail))


def curl(*args, json_body=None, headers=None, method=None):
    cmd = ["curl", "-s", "-w", "\n__STATUS__:%{http_code}", "--max-time", "20"]
    if method:
        cmd += ["-X", method]
    if json_body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(json_body)]
    for k, v in (headers or {}).items():
        cmd += ["-H", f"{k}: {v}"]
    cmd += list(args)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    raw = result.stdout
    if "__STATUS__:" in raw:
        body_part, status_part = raw.rsplit("\n__STATUS__:", 1)
        return int(status_part.strip()), body_part.strip()
    return 0, raw


def parse_json(text):
    try:
        return json.loads(text)
    except Exception:
        return {}


def decode_jwt_payload(token: str) -> dict:
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.b64decode(payload))


def admin_headers():
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}


# ── Test 1: Backend health ────────────────────────────────────────────────────
section("1 · Backend health")
try:
    status, body = curl(f"{BACKEND}/health")
    ok = status == 200 and parse_json(body).get("status") == "ok"
    record(1, 'GET /health → {"status":"ok"}', ok, f"HTTP {status}  body={body[:120]}")
except Exception as e:
    record(1, "GET /health", False, str(e))


# ── Test 2: Create user via admin API + POST /churches ────────────────────────
section("2 · Signup flow (happy path)")
try:
    # Create user via admin API — bypasses email domain/confirmation requirements
    status, body = curl(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers=admin_headers(),
        json_body={"email": TEST_EMAIL, "password": TEST_PASSWORD, "email_confirm": True},
        method="POST",
    )
    data = parse_json(body)
    user_id = data.get("id")
    state["user_id"] = user_id
    print(f"       admin create HTTP {status}  user_id={user_id}")

    if user_id:
        # Login to get access token
        ls, lb = curl(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": SERVICE_KEY},
            json_body={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        )
        ld = parse_json(lb)
        signup_token = ld.get("access_token")
        state["signup_token"] = signup_token

        # POST /churches — no auth header needed (youthful-neumann design)
        cs, cb = curl(
            f"{BACKEND}/churches",
            json_body={"church_name": "QA Test Church", "pastor_name": "QA Pastor", "user_id": user_id},
            method="POST",
        )
        cd = parse_json(cb)
        church_id = cd.get("church_id")
        state["church_id"] = church_id
        ok = cs in (200, 201) and bool(church_id)
        record(2, "Admin create user + POST /churches", ok,
               f"create HTTP {status}  church HTTP {cs}  church_id={church_id}  body={cb[:200]}")
    else:
        record(2, "Admin create user + POST /churches", False,
               f"admin create HTTP {status}  body={body[:200]}")
except Exception as e:
    record(2, "Admin create user + POST /churches", False, str(e))


# ── Test 3: Login JWT contains church_id ──────────────────────────────────────
section("3 · JWT contains church_id after login")
try:
    status, body = curl(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": SERVICE_KEY},
        json_body={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    data = parse_json(body)
    token = data.get("access_token")
    state["access_token"] = token

    if token:
        pl = decode_jwt_payload(token)
        jwt_church_id = pl.get("app_metadata", {}).get("church_id")
        ok = bool(jwt_church_id) and str(jwt_church_id) == str(state.get("church_id", ""))
        record(3, "JWT app_metadata.church_id matches church created in step 2", ok,
               f"jwt_church_id={jwt_church_id}  expected={state.get('church_id')}")
    else:
        record(3, "JWT app_metadata.church_id matches", False,
               f"HTTP {status}  body={body[:200]}")
except Exception as e:
    record(3, "JWT app_metadata.church_id matches", False, str(e))

token = state.get("access_token", "")


# ── Test 4: Protected endpoint — valid JWT ────────────────────────────────────
section("4 · Protected endpoint — valid JWT")
try:
    status, body = curl(
        f"{BACKEND}/members",
        headers={"Authorization": f"Bearer {token}"},
    )
    ok = status == 200
    record(4, "GET /members (valid JWT) → 200", ok, f"HTTP {status}  body={body[:200]}")
except Exception as e:
    record(4, "GET /members (valid JWT) → 200", False, str(e))


# ── Test 5: No JWT ────────────────────────────────────────────────────────────
section("5 · Protected endpoint — no JWT")
try:
    status, body = curl(f"{BACKEND}/members")
    ok = status in (401, 403)
    record(5, "GET /members (no auth) → 401/403", ok, f"HTTP {status}")
except Exception as e:
    record(5, "GET /members (no auth) → 401/403", False, str(e))


# ── Test 6: Invalid JWT ───────────────────────────────────────────────────────
section("6 · Protected endpoint — invalid JWT")
try:
    status, body = curl(
        f"{BACKEND}/members",
        headers={"Authorization": "Bearer invalid.token.here"},
    )
    ok = status in (401, 403)
    record(6, "GET /members (invalid JWT) → 401/403", ok, f"HTTP {status}  body={body[:80]}")
except Exception as e:
    record(6, "GET /members (invalid JWT) → 401/403", False, str(e))


# ── Test 7: Create member ─────────────────────────────────────────────────────
section("7 · Create a member")
try:
    status, body = curl(
        f"{BACKEND}/members",
        headers={"Authorization": f"Bearer {token}"},
        json_body={"first_name": "Test", "last_name": "Member", "email": "member@test.com"},
        method="POST",
    )
    data = parse_json(body)
    member_id = data.get("id")
    state["member_id"] = member_id
    ok = status in (200, 201) and bool(member_id)
    record(7, "POST /members → 201 with UUID id", ok, f"HTTP {status}  body={body[:200]}")
except Exception as e:
    record(7, "POST /members → 201 with UUID id", False, str(e))


# ── Test 8: Read back member ──────────────────────────────────────────────────
section("8 · Read back the member")
try:
    status, body = curl(
        f"{BACKEND}/members",
        headers={"Authorization": f"Bearer {token}"},
    )
    data = parse_json(body)
    members = data if isinstance(data, list) else (data.get("members") or data.get("data") or [])
    found = any(
        str(m.get("id")) == str(state.get("member_id", "__none__"))
        or (m.get("first_name") == "Test" and m.get("last_name") == "Member")
        for m in members
    )
    ok = status == 200 and found
    record(8, "GET /members — created member in list", ok,
           f"HTTP {status}  count={len(members)}  found={found}")
except Exception as e:
    record(8, "GET /members — created member in list", False, str(e))


# ── Test 9: Frontend serves HTML ──────────────────────────────────────────────
section("9 · Frontend serves HTML")
try:
    status, body = curl(FRONTEND)
    ok = status == 200 and "html" in body[:200].lower()
    record(9, "GET http://localhost:5173 → HTML 200", ok,
           f"HTTP {status}  first80={body[:80].strip()!r}")
except Exception as e:
    record(9, "GET http://localhost:5173 → HTML 200", False, str(e))


# ── Test 10: Cleanup ──────────────────────────────────────────────────────────
section("10 · Cleanup")
cleanup_ok = True
uid = state.get("user_id")

if uid:
    status, body = curl(
        f"{SUPABASE_URL}/auth/v1/admin/users/{uid}",
        headers=admin_headers(),
        method="DELETE",
    )
    user_deleted = status in (200, 204)
    print(f"       delete user HTTP {status}  uid={uid}")
    if not user_deleted:
        print(f"       body={body[:120]}")
        cleanup_ok = False
else:
    print("       no user_id to delete")

record(10, "Cleanup — test user deleted", cleanup_ok,
       f"user_id={uid}  church_id={state.get('church_id')}")


# ── Summary ───────────────────────────────────────────────────────────────────
section("SUMMARY")
passed = sum(1 for _, _, p, _ in RESULTS if p)
total  = len(RESULTS)
for num, name, ok, _ in RESULTS:
    tag = "✅" if ok else "❌"
    print(f"  {tag} [{num:02d}] {name}")

print(f"\n  Result: {passed}/{total} passed")
if passed < total:
    sys.exit(1)
