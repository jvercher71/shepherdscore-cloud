"""
ShepherdsCore Cloud — FastAPI backend
Multi-tenant church management API backed by Supabase (PostgreSQL + RLS)
"""

from contextlib import asynccontextmanager
from typing import Annotated, Optional
from datetime import datetime, timezone
from decimal import Decimal
from collections import defaultdict
import base64
import json
import logging

import httpx
from fastapi import FastAPI, Depends, HTTPException, Security, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
from supabase import create_client, Client
from groq import Groq
import stripe as stripe_lib

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    groq_api_key: str = ""
    stripe_secret_key: str = ""
    stripe_price_id: str = "price_1TMdpmQ1M88c4OEyX5BeLKjT"
    stripe_webhook_secret: str = ""
    resend_api_key: str = ""
    email_from: str = "ShepherdsCore <noreply@shepherdscore.com>"
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()  # type: ignore[call-arg]


# ---------------------------------------------------------------------------
# Groq AI client
# ---------------------------------------------------------------------------

def get_groq() -> Groq:
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="AI features unavailable — GROQ_API_KEY not configured")
    return Groq(api_key=settings.groq_api_key)


def ai_chat(system_prompt: str, user_prompt: str, max_tokens: int = 2048) -> str:
    """Send a chat completion to Groq (Llama 3) and return the text response."""
    client = get_groq()
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return resp.choices[0].message.content or ""


# ---------------------------------------------------------------------------
# Per-request Supabase client authenticated as the requesting user.
# Uses the anon key (apikey header) + user JWT (Authorization header) so
# Postgres RLS policies apply — no service role key needed.
# ---------------------------------------------------------------------------

def make_db(token: str) -> Client:
    """Create a Supabase client scoped to the user's JWT."""
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    client.postgrest.auth(token)
    return client


# ---------------------------------------------------------------------------
# JWT auth middleware
# ---------------------------------------------------------------------------

bearer_scheme = HTTPBearer()

class AuthContext(BaseModel):
    user_id: str
    email: str
    church_id: str
    token: str
    role: str = "Admin"

    model_config = {"arbitrary_types_allowed": True}


def _fetch_supabase_user(token: str) -> dict:
    """Call Supabase /auth/v1/user with the user's JWT. Uses anon key as the API key."""
    resp = httpx.get(
        f"{settings.supabase_url}/auth/v1/user",
        headers={"Authorization": f"Bearer {token}", "apikey": settings.supabase_anon_key},
        timeout=5.0,
    )
    if not resp.is_success:
        raise ValueError(resp.json().get("msg", "Unauthorized"))
    return resp.json()


def verify_token(credentials: Annotated[HTTPAuthorizationCredentials, Security(bearer_scheme)]) -> AuthContext:
    token = credentials.credentials
    try:
        user_data = _fetch_supabase_user(token)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

    user_id: str = user_data["id"]
    email: str = user_data.get("email", "")
    church_id: str = (user_data.get("app_metadata") or {}).get("church_id", "")

    if not user_id or not church_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="church_id not found in token. Complete church onboarding first.",
        )

    # Look up role from church_staff table (if exists)
    role = "Admin"  # default for church creator
    try:
        db = make_db(token)
        staff_row = db.table("church_staff").select("role, active").eq("church_id", church_id).eq("user_id", user_id).execute().data
        if staff_row:
            if not staff_row[0].get("active", True):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account has been deactivated.")
            role = staff_row[0].get("role", "Admin")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Failed to fetch staff role for {user_id}: {e}")
        # table may not exist yet, default to Admin

    return AuthContext(user_id=user_id, email=email, church_id=church_id, token=token, role=role)


def get_db(auth: Annotated[AuthContext, Depends(verify_token)]) -> Client:
    return make_db(auth.token)


AuthDep = Annotated[AuthContext, Depends(verify_token)]
DBDep = Annotated[Client, Depends(get_db)]


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield

app = FastAPI(title="ShepherdsCore Cloud API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------------------------------------------------------------------------
# Rate limiting (in-memory, per-IP)
# ---------------------------------------------------------------------------

import time as _time
from collections import defaultdict as _dd
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_rate_store: dict[str, list[float]] = _dd(list)
_RATE_LIMIT = 120          # requests per window
_RATE_WINDOW = 60.0        # seconds
_AI_RATE_LIMIT = 20        # AI endpoints per window
_AI_RATE_WINDOW = 60.0


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        now = _time.monotonic()

        # Use stricter limit for AI endpoints
        is_ai = path.startswith("/ai/") or path.startswith("/api/ai/")
        key = f"ai:{client_ip}" if is_ai else f"api:{client_ip}"
        limit = _AI_RATE_LIMIT if is_ai else _RATE_LIMIT
        window = _AI_RATE_WINDOW if is_ai else _RATE_WINDOW

        # Clean old entries
        _rate_store[key] = [t for t in _rate_store[key] if now - t < window]

        if len(_rate_store[key]) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again shortly."},
            )

        _rate_store[key].append(now)
        return await call_next(request)


app.add_middleware(RateLimitMiddleware)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def sb_select(sb: Client, table: str, church_id: str, columns: str = "*"):
    """Fetch all rows from a table scoped to church_id."""
    resp = sb.table(table).select(columns).eq("church_id", church_id).execute()
    return resp.data


def sb_get(sb: Client, table: str, church_id: str, row_id: str, columns: str = "*"):
    resp = sb.table(table).select(columns).eq("church_id", church_id).eq("id", row_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"{table} not found")
    return resp.data


def sb_insert(sb: Client, table: str, data: dict):
    resp = sb.table(table).insert(data).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Insert failed")
    return resp.data[0]


def sb_update(sb: Client, table: str, church_id: str, row_id: str, data: dict):
    resp = sb.table(table).update(data).eq("church_id", church_id).eq("id", row_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"{table} not found")
    return resp.data[0]


def sb_delete(sb: Client, table: str, church_id: str, row_id: str):
    sb.table(table).delete().eq("church_id", church_id).eq("id", row_id).execute()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Church onboarding (called right after signup, before church_id is in JWT)
# ---------------------------------------------------------------------------

class ChurchIn(BaseModel):
    church_name: str
    pastor_name: str = ""
    user_id: str = ""


@app.post("/churches")
def create_church(
    body: ChurchIn,
    credentials: Annotated[HTTPAuthorizationCredentials, Security(bearer_scheme)],
):
    """Create a church for a newly-registered user.
    Uses the user's JWT directly so the INSERT triggers stamp_church_id_on_create()
    which updates app_metadata in the DB — no service role key needed."""
    token = credentials.credentials
    try:
        user_data = _fetch_supabase_user(token)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

    user_id: str = user_data["id"] or body.user_id
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id required")

    db = make_db(token)
    church = sb_insert(db, "churches", {
        "name": body.church_name,
        "pastor_name": body.pastor_name,
    })
    return {"church_id": church["id"]}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.get("/dashboard/stats")
def dashboard_stats(auth: AuthDep, sb: DBDep):
    cid = auth.church_id

    total_members = len(sb.table("members").select("id").eq("church_id", cid).execute().data)

    today = datetime.now(timezone.utc).date()
    month_start = today.replace(day=1).isoformat()
    giving_rows = sb.table("giving").select("amount").eq("church_id", cid).gte("date", month_start).execute().data
    total_giving_this_month = sum(r["amount"] for r in giving_rows)

    upcoming_events = len(
        sb.table("events").select("id").eq("church_id", cid).gte("date", today.isoformat()).execute().data
    )
    total_groups = len(sb.table("groups").select("id").eq("church_id", cid).execute().data)

    return {
        "total_members": total_members,
        "total_giving_this_month": total_giving_this_month,
        "upcoming_events": upcoming_events,
        "total_groups": total_groups,
    }


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

class MemberIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    preferred_name: str = Field(default="", max_length=100)
    email: str = Field(default="", max_length=255)
    phone: str = Field(default="", max_length=30)
    cell_phone: str = Field(default="", max_length=30)
    address: str = Field(default="", max_length=500)
    city: str = Field(default="", max_length=100)
    state: str = Field(default="", max_length=50)
    zip: str = Field(default="", max_length=20)
    birthday: Optional[str] = None
    join_date: Optional[str] = None
    joined_by: str = Field(default="", max_length=100)
    status: str = Field(default="Active", max_length=50)
    notes: str = Field(default="", max_length=5000)
    photo_url: str = ""
    family_id: Optional[str] = None


class MemberUpdateIn(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    cell_phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    birthday: Optional[str] = None
    join_date: Optional[str] = None
    joined_by: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    family_id: Optional[str] = None


@app.get("/members")
def list_members(auth: AuthDep, sb: DBDep, skip: int = Query(0, ge=0), limit: int = Query(500, ge=1, le=1000)):
    return sb.table("members").select("*").eq("church_id", auth.church_id).range(skip, skip + limit - 1).execute().data


@app.post("/members", status_code=201)
def create_member(body: MemberIn, auth: AuthDep, sb: DBDep):
    return sb_insert(sb, "members", {**body.model_dump(), "church_id": auth.church_id})


@app.get("/members/{member_id}")
def get_member(member_id: str, auth: AuthDep, sb: DBDep):
    return sb_get(sb, "members", auth.church_id, member_id)


@app.put("/members/{member_id}")
def update_member(member_id: str, body: MemberUpdateIn, auth: AuthDep, sb: DBDep):
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    return sb_update(sb, "members", auth.church_id, member_id, data)


@app.delete("/members/{member_id}", status_code=204)
def delete_member(member_id: str, auth: AuthDep, sb: DBDep):
    sb_delete(sb, "members", auth.church_id, member_id)


# CSV member import
class CSVImportIn(BaseModel):
    csv_text: str = Field(max_length=500000)  # ~5MB of CSV text


@app.post("/members/import-csv")
def import_members_csv(body: CSVImportIn, auth: AuthDep, sb: DBDep):
    """Import members from CSV text. Expected columns: first_name, last_name, and any optional fields."""
    import csv
    import io

    reader = csv.DictReader(io.StringIO(body.csv_text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    # Normalize headers (lowercase, strip spaces)
    field_map = {f.strip().lower().replace(' ', '_'): f for f in reader.fieldnames}

    # Required
    if 'first_name' not in field_map and 'firstname' not in field_map:
        raise HTTPException(status_code=400, detail="CSV must have a 'first_name' column")
    if 'last_name' not in field_map and 'lastname' not in field_map:
        raise HTTPException(status_code=400, detail="CSV must have a 'last_name' column")

    VALID_FIELDS = {
        'first_name', 'firstname', 'last_name', 'lastname', 'preferred_name',
        'email', 'phone', 'cell_phone', 'address', 'city', 'state', 'zip',
        'birthday', 'join_date', 'joined_by', 'status', 'notes',
    }

    imported = 0
    skipped = 0
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):  # start=2 because row 1 is header
        # Map to normalized field names
        record: dict = {}
        for norm_key, orig_key in field_map.items():
            val = (row.get(orig_key) or "").strip()
            if norm_key == 'firstname':
                record['first_name'] = val
            elif norm_key == 'lastname':
                record['last_name'] = val
            elif norm_key in VALID_FIELDS:
                record[norm_key] = val

        first = record.get('first_name', '').strip()
        last = record.get('last_name', '').strip()
        if not first or not last:
            skipped += 1
            errors.append(f"Row {i}: missing first or last name")
            continue

        # Set defaults
        record.setdefault('status', 'Active')
        record['church_id'] = auth.church_id

        # Null out empty dates
        for date_field in ('birthday', 'join_date'):
            if date_field in record and not record[date_field]:
                record[date_field] = None

        try:
            sb_insert(sb, "members", record)
            imported += 1
        except Exception as e:
            skipped += 1
            errors.append(f"Row {i}: {str(e)[:80]}")

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors[:20],  # cap error list
        "message": f"Imported {imported} members" + (f", skipped {skipped}" if skipped else ""),
    }


# CSV member export
@app.get("/members/export-csv")
def export_members_csv(auth: AuthDep, sb: DBDep):
    """Export all members as CSV text."""
    import csv
    import io

    members = sb.table("members").select("*").eq("church_id", auth.church_id).order("last_name").execute().data
    if not members:
        return {"csv": "", "count": 0}

    output = io.StringIO()
    fields = ['first_name', 'last_name', 'preferred_name', 'email', 'phone', 'cell_phone',
              'address', 'city', 'state', 'zip', 'birthday', 'join_date', 'joined_by', 'status', 'notes']
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    for m in members:
        writer.writerow(m)

    return {"csv": output.getvalue(), "count": len(members)}


# ---------------------------------------------------------------------------
# Families
# ---------------------------------------------------------------------------

class FamilyIn(BaseModel):
    family_name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


@app.get("/families")
def list_families(auth: AuthDep, sb: DBDep):
    rows = sb_select(sb, "families", auth.church_id)
    for row in rows:
        count_resp = sb.table("members").select("id", count="exact").eq("family_id", row["id"]).execute()
        row["member_count"] = count_resp.count or 0
    return rows


@app.get("/families/{family_id}")
def get_family(family_id: str, auth: AuthDep, sb: DBDep):
    return sb_get(sb, "families", auth.church_id, family_id)


@app.post("/families", status_code=201)
def create_family(body: FamilyIn, auth: AuthDep, sb: DBDep):
    return sb_insert(sb, "families", {**body.model_dump(), "church_id": auth.church_id})


@app.put("/families/{family_id}")
def update_family(family_id: str, body: FamilyIn, auth: AuthDep, sb: DBDep):
    return sb_update(sb, "families", auth.church_id, family_id, body.model_dump())


@app.delete("/families/{family_id}", status_code=204)
def delete_family(family_id: str, auth: AuthDep, sb: DBDep):
    sb_delete(sb, "families", auth.church_id, family_id)


# ---------------------------------------------------------------------------
# Giving
# ---------------------------------------------------------------------------

class GivingIn(BaseModel):
    member_id: Optional[str] = None
    amount: float = Field(ge=0)
    category: str = Field(default="General Offering", max_length=100)
    date: str  # ISO date string YYYY-MM-DD
    method: str = Field(default="", max_length=50)
    notes: str = Field(default="", max_length=1000)


@app.get("/giving")
def list_giving(auth: AuthDep, sb: DBDep, skip: int = Query(0, ge=0), limit: int = Query(500, ge=1, le=2000)):
    return sb.table("giving").select("*").eq("church_id", auth.church_id).order("date", desc=True).range(skip, skip + limit - 1).execute().data


@app.post("/giving", status_code=201)
def create_giving(body: GivingIn, auth: AuthDep, sb: DBDep):
    return sb_insert(sb, "giving", {**body.model_dump(), "church_id": auth.church_id})


@app.get("/giving/{record_id}")
def get_giving(record_id: str, auth: AuthDep, sb: DBDep):
    return sb_get(sb, "giving", auth.church_id, record_id)


@app.put("/giving/{record_id}")
def update_giving(record_id: str, body: GivingIn, auth: AuthDep, sb: DBDep):
    return sb_update(sb, "giving", auth.church_id, record_id, body.model_dump())


@app.delete("/giving/{record_id}", status_code=204)
def delete_giving(record_id: str, auth: AuthDep, sb: DBDep):
    sb_delete(sb, "giving", auth.church_id, record_id)


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

class EventIn(BaseModel):
    name: str
    date: str  # ISO date
    event_time: str = ""
    event_type: str = "Sunday Service"
    description: str = ""


@app.get("/events")
def list_events(auth: AuthDep, sb: DBDep, skip: int = Query(0, ge=0), limit: int = Query(500, ge=1, le=1000)):
    return sb.table("events").select("*").eq("church_id", auth.church_id).order("date", desc=True).range(skip, skip + limit - 1).execute().data


@app.post("/events", status_code=201)
def create_event(body: EventIn, auth: AuthDep, sb: DBDep):
    return sb_insert(sb, "events", {**body.model_dump(), "church_id": auth.church_id})


@app.get("/events/{event_id}")
def get_event(event_id: str, auth: AuthDep, sb: DBDep):
    return sb_get(sb, "events", auth.church_id, event_id)


@app.put("/events/{event_id}")
def update_event(event_id: str, body: EventIn, auth: AuthDep, sb: DBDep):
    return sb_update(sb, "events", auth.church_id, event_id, body.model_dump())


@app.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: str, auth: AuthDep, sb: DBDep):
    sb_delete(sb, "events", auth.church_id, event_id)


# Event attendance
@app.get("/events/{event_id}/attendance")
def list_attendance(event_id: str, auth: AuthDep, sb: DBDep):
    # verify event belongs to this church
    sb_get(sb, "events", auth.church_id, event_id)
    rows = sb.table("event_attendance").select("member_id").eq("event_id", event_id).execute().data
    return [r["member_id"] for r in rows]


class AttendanceIn(BaseModel):
    member_id: str


@app.post("/events/{event_id}/attendance", status_code=201)
def check_in(event_id: str, body: AttendanceIn, auth: AuthDep, sb: DBDep):
    sb_get(sb, "events", auth.church_id, event_id)
    return sb_insert(sb, "event_attendance", {"event_id": event_id, "member_id": body.member_id})


@app.delete("/events/{event_id}/attendance/{member_id}", status_code=204)
def check_out(event_id: str, member_id: str, auth: AuthDep, sb: DBDep):
    sb_get(sb, "events", auth.church_id, event_id)
    sb.table("event_attendance").delete().eq("event_id", event_id).eq("member_id", member_id).execute()


# Group membership list
@app.get("/groups/{group_id}/members")
def list_group_members(group_id: str, auth: AuthDep, sb: DBDep):
    sb_get(sb, "groups", auth.church_id, group_id)
    rows = sb.table("group_members").select("member_id").eq("group_id", group_id).execute().data
    return [r["member_id"] for r in rows]


# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------

class GroupIn(BaseModel):
    name: str
    description: str = ""


@app.get("/groups")
def list_groups(auth: AuthDep, sb: DBDep):
    rows = sb_select(sb, "groups", auth.church_id)
    # attach member count
    for row in rows:
        count_resp = sb.table("group_members").select("id", count="exact").eq("group_id", row["id"]).execute()
        row["member_count"] = count_resp.count or 0
    return rows


@app.post("/groups", status_code=201)
def create_group(body: GroupIn, auth: AuthDep, sb: DBDep):
    return sb_insert(sb, "groups", {**body.model_dump(), "church_id": auth.church_id})


@app.get("/groups/{group_id}")
def get_group(group_id: str, auth: AuthDep, sb: DBDep):
    return sb_get(sb, "groups", auth.church_id, group_id)


@app.put("/groups/{group_id}")
def update_group(group_id: str, body: GroupIn, auth: AuthDep, sb: DBDep):
    return sb_update(sb, "groups", auth.church_id, group_id, body.model_dump())


@app.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: str, auth: AuthDep, sb: DBDep):
    sb_delete(sb, "groups", auth.church_id, group_id)


# Group membership
class GroupMemberIn(BaseModel):
    member_id: str


@app.post("/groups/{group_id}/members", status_code=201)
def add_group_member(group_id: str, body: GroupMemberIn, auth: AuthDep, sb: DBDep):
    # verify group belongs to church
    sb_get(sb, "groups", auth.church_id, group_id)
    return sb_insert(sb, "group_members", {"group_id": group_id, "member_id": body.member_id})


@app.delete("/groups/{group_id}/members/{member_id}", status_code=204)
def remove_group_member(group_id: str, member_id: str, auth: AuthDep, sb: DBDep):
    sb_get(sb, "groups", auth.church_id, group_id)
    sb.table("group_members").delete().eq("group_id", group_id).eq("member_id", member_id).execute()


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@app.get("/reports/giving")
def report_giving(year: int = Query(ge=1900, le=2100), month: int = Query(ge=1, le=12), auth: AuthContext = Depends(verify_token), sb: Client = Depends(get_db)):
    start = f"{year}-{month:02d}-01"
    # End: first day of next month
    if month == 12:
        end = f"{year + 1}-01-01"
    else:
        end = f"{year}-{month + 1:02d}-01"

    rows = (
        sb.table("giving")
        .select("category, amount")
        .eq("church_id", auth.church_id)
        .gte("date", start)
        .lt("date", end)
        .execute()
        .data
    )

    # Aggregate by category
    agg: dict[str, dict] = {}
    for r in rows:
        cat = r["category"]
        if cat not in agg:
            agg[cat] = {"category": cat, "total": 0.0, "count": 0}
        agg[cat]["total"] += r["amount"]
        agg[cat]["count"] += 1

    return sorted(agg.values(), key=lambda x: x["total"], reverse=True)


@app.get("/reports/members")
def report_members(year: int = Query(ge=1900, le=2100), month: int = Query(ge=1, le=12), auth: AuthContext = Depends(verify_token), sb: Client = Depends(get_db)):
    cid = auth.church_id
    total = len(sb.table("members").select("id").eq("church_id", cid).execute().data)
    month_start = f"{year}-{month:02d}-01"
    if month == 12:
        month_end = f"{year + 1}-01-01"
    else:
        month_end = f"{year}-{month + 1:02d}-01"
    added = len(
        sb.table("members")
        .select("id")
        .eq("church_id", cid)
        .gte("created_at", month_start)
        .lt("created_at", month_end)
        .execute()
        .data
    )
    return {"total": total, "added_this_month": added}


@app.get("/reports/annual-giving")
def report_annual_giving(year: int, auth: AuthDep, sb: DBDep):
    """Per-member giving totals for the entire year — used for tax letters."""
    cid = auth.church_id
    start = f"{year}-01-01"
    end = f"{year + 1}-01-01"

    rows = (
        sb.table("giving")
        .select("member_id, amount")
        .eq("church_id", cid)
        .gte("date", start)
        .lt("date", end)
        .execute()
        .data
    )

    # Load members for name lookup
    member_rows = sb.table("members").select("id, first_name, last_name").eq("church_id", cid).execute().data
    member_map = {m["id"]: m for m in member_rows}

    agg: dict = {}
    for r in rows:
        mid = r["member_id"] or "anonymous"
        if mid not in agg:
            if mid == "anonymous":
                agg[mid] = {"member_id": None, "first_name": "Anonymous", "last_name": "", "total": 0.0, "transactions": 0}
            else:
                m = member_map.get(mid, {})
                agg[mid] = {"member_id": mid, "first_name": m.get("first_name", ""), "last_name": m.get("last_name", ""), "total": 0.0, "transactions": 0}
        agg[mid]["total"] += r["amount"]
        agg[mid]["transactions"] += 1

    return sorted(agg.values(), key=lambda x: (x["last_name"], x["first_name"]))


# ---------------------------------------------------------------------------
# Settings (church info)
# ---------------------------------------------------------------------------

class ChurchSettingsIn(BaseModel):
    name: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""
    pastor_name: str = ""
    logo_url: str = ""


@app.get("/settings")
def get_settings(auth: AuthDep, sb: DBDep):
    resp = sb.table("churches").select("*").eq("id", auth.church_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Church not found")
    return resp.data


@app.put("/settings")
def update_settings(body: ChurchSettingsIn, auth: AuthDep, sb: DBDep):
    resp = sb.table("churches").update(body.model_dump()).eq("id", auth.church_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Church not found")
    return resp.data[0]


# ---------------------------------------------------------------------------
# Church logo upload
# ---------------------------------------------------------------------------

class LogoUploadIn(BaseModel):
    logo_base64: str
    filename: str = "logo.png"


@app.post("/settings/logo")
def upload_church_logo(body: LogoUploadIn, auth: AuthDep, sb: DBDep):
    """Upload church logo via base64 to Supabase Storage."""
    raw = body.logo_base64
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        logo_bytes = base64.b64decode(raw, validate=True)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid base64 image data")
    if len(logo_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be less than 5MB")

    ext = body.filename.rsplit(".", 1)[-1].lower() if "." in body.filename else "png"
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        raise HTTPException(status_code=400, detail="Invalid image type. Use JPG, PNG, GIF, or WEBP")
    storage_path = f"{auth.church_id}/logo.{ext}"

    content_type = f"image/{'jpeg' if ext in ('jpg','jpeg') else ext}"

    # Delete existing file first
    try:
        httpx.delete(
            f"{settings.supabase_url}/storage/v1/object/church-logos/{storage_path}",
            headers={"Authorization": f"Bearer {auth.token}", "apikey": settings.supabase_anon_key},
            timeout=10.0,
        )
    except Exception:
        pass

    resp = httpx.post(
        f"{settings.supabase_url}/storage/v1/object/church-logos/{storage_path}",
        headers={
            "Authorization": f"Bearer {auth.token}",
            "apikey": settings.supabase_anon_key,
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        content=logo_bytes,
        timeout=30.0,
    )
    if not resp.is_success:
        logger.error(f"Logo upload failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=500, detail="Logo upload failed. Please try again.")

    public_url = f"{settings.supabase_url}/storage/v1/object/public/church-logos/{storage_path}?t={int(datetime.now(timezone.utc).timestamp())}"
    sb.table("churches").update({"logo_url": public_url}).eq("id", auth.church_id).execute()
    return {"logo_url": public_url}


# ---------------------------------------------------------------------------
# Password reset (via Supabase Auth)
# ---------------------------------------------------------------------------

class PasswordResetIn(BaseModel):
    email: str


@app.post("/auth/reset-password")
def request_password_reset(body: PasswordResetIn):
    """Send a password reset email via Supabase Auth."""
    resp = httpx.post(
        f"{settings.supabase_url}/auth/v1/recover",
        headers={"apikey": settings.supabase_anon_key, "Content-Type": "application/json"},
        json={"email": body.email},
        timeout=10.0,
    )
    # Always return success to avoid email enumeration
    return {"message": "If an account exists with that email, a password reset link has been sent."}


# ---------------------------------------------------------------------------
# Email notifications (via Resend API or skip if not configured)
# ---------------------------------------------------------------------------

def send_email(to: str, subject: str, html: str) -> bool:
    """Send an email via Resend API. Returns False if not configured or fails."""
    if not settings.resend_api_key:
        logger.info(f"Email skipped (no RESEND_API_KEY): to={to} subject={subject}")
        return False
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}", "Content-Type": "application/json"},
            json={"from": settings.email_from, "to": [to], "subject": subject, "html": html},
            timeout=10.0,
        )
        if resp.is_success:
            logger.info(f"Email sent: to={to} subject={subject}")
            return True
        logger.warning(f"Email failed: {resp.status_code} {resp.text[:200]}")
        return False
    except Exception as e:
        logger.warning(f"Email error: {e}")
        return False


class SendEmailIn(BaseModel):
    to: str = Field(max_length=255)
    subject: str = Field(max_length=500)
    body: str = Field(max_length=10000)


@app.post("/email/send")
def send_custom_email(body_in: SendEmailIn, auth: AuthDep, sb: DBDep):
    """Send a custom email (admin/staff only)."""
    if auth.role == "View-Only":
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    church = sb.table("churches").select("name").eq("id", auth.church_id).single().execute().data
    church_name = church.get("name", "ShepherdsCore") if church else "ShepherdsCore"

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a1a2e; padding: 20px; text-align: center;">
        <h2 style="color: #0066CC; margin: 0;">{church_name}</h2>
      </div>
      <div style="padding: 24px; line-height: 1.6;">
        {body_in.body.replace(chr(10), '<br>')}
      </div>
      <div style="padding: 16px; text-align: center; font-size: 12px; color: #999;">
        Sent via ShepherdsCore Cloud
      </div>
    </div>
    """
    success = send_email(body_in.to, body_in.subject, html)
    if not success and not settings.resend_api_key:
        return {"sent": False, "message": "Email not configured. Add RESEND_API_KEY to enable."}
    return {"sent": success, "message": "Email sent" if success else "Failed to send email"}


@app.post("/email/giving-receipt")
def send_giving_receipt(auth: AuthDep, sb: DBDep, member_id: str = Query(...), giving_id: str = Query(...)):
    """Send a giving receipt email to a member."""
    member = sb_get(sb, "members", auth.church_id, member_id)
    if not member.get("email"):
        raise HTTPException(status_code=400, detail="Member has no email address")

    giving = sb_get(sb, "giving", auth.church_id, giving_id)
    church = sb.table("churches").select("name, address").eq("id", auth.church_id).single().execute().data
    church_name = church.get("name", "Our Church") if church else "Our Church"

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a1a2e; padding: 20px; text-align: center;">
        <h2 style="color: #0066CC; margin: 0;">{church_name}</h2>
      </div>
      <div style="padding: 24px; line-height: 1.6;">
        <p>Dear {member.get('preferred_name') or member['first_name']},</p>
        <p>Thank you for your generous contribution. This is your giving receipt:</p>
        <div style="background: #f8f9fa; border-radius: 8px; padding: 16px 20px; margin: 16px 0;">
          <table style="width: 100%; font-size: 14px;">
            <tr><td style="color: #666;">Date</td><td style="text-align: right; font-weight: 600;">{giving['date']}</td></tr>
            <tr><td style="color: #666;">Category</td><td style="text-align: right; font-weight: 600;">{giving['category']}</td></tr>
            <tr><td style="color: #666;">Method</td><td style="text-align: right; font-weight: 600;">{giving.get('method', 'N/A') or 'N/A'}</td></tr>
            <tr><td style="color: #666; border-top: 1px solid #ddd; padding-top: 8px;">Amount</td>
                <td style="text-align: right; font-weight: 700; color: #22C55E; border-top: 1px solid #ddd; padding-top: 8px; font-size: 18px;">${giving['amount']:.2f}</td></tr>
          </table>
        </div>
        <p style="font-size: 12px; color: #999;">No goods or services were provided in exchange for this contribution.</p>
      </div>
      <div style="padding: 16px; text-align: center; font-size: 12px; color: #999;">
        {church_name} &bull; Sent via ShepherdsCore Cloud
      </div>
    </div>
    """
    success = send_email(member["email"], f"Giving Receipt — {church_name}", html)
    return {"sent": success}


# ---------------------------------------------------------------------------
# Stripe Billing
# ---------------------------------------------------------------------------

def _get_stripe():
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Billing not configured")
    stripe_lib.api_key = settings.stripe_secret_key.strip()
    return stripe_lib


@app.get("/billing/status")
def billing_status(auth: AuthDep, sb: DBDep):
    """Get current subscription status for this church."""
    church = sb.table("churches").select("subscription_status, stripe_customer_id, created_at").eq("id", auth.church_id).single().execute().data
    if not church:
        raise HTTPException(status_code=404, detail="Church not found")

    status = church.get("subscription_status", "trial")
    created = church.get("created_at", "")

    # Calculate trial days remaining
    trial_days_left = 0
    if status == "trial" and created:
        from datetime import timedelta
        try:
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            trial_end = created_dt + timedelta(days=14)
            remaining = (trial_end - datetime.now(timezone.utc)).days
            trial_days_left = max(0, remaining)
        except Exception:
            trial_days_left = 0

    return {
        "status": status,
        "trial_days_left": trial_days_left,
        "has_customer": bool(church.get("stripe_customer_id")),
    }


@app.post("/billing/checkout")
def create_checkout(auth: AuthDep, sb: DBDep):
    """Create a Stripe Checkout session for subscription with 14-day trial."""
    stripe = _get_stripe()

    try:
        church = sb.table("churches").select("id, name, stripe_customer_id").eq("id", auth.church_id).single().execute().data
    except Exception:
        church = sb.table("churches").select("id, name").eq("id", auth.church_id).single().execute().data

    try:
        # Create or reuse Stripe customer
        customer_id = church.get("stripe_customer_id") if church else None
        if not customer_id:
            customer = stripe.Customer.create(
                email=auth.email,
                name=church.get("name", "") if church else "",
                metadata={"church_id": auth.church_id},
            )
            customer_id = customer.id
            try:
                sb.table("churches").update({"stripe_customer_id": customer_id}).eq("id", auth.church_id).execute()
            except Exception as e:
                logger.warning(f"Could not save stripe_customer_id: {e}")

        origin = settings.cors_origins.split(",")[0].strip()
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
            subscription_data={"trial_period_days": 14},
            success_url=f"{origin}/billing?billing=success",
            cancel_url=f"{origin}/billing?billing=cancel",
            metadata={"church_id": auth.church_id},
        )

        return {"checkout_url": session.url}
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail=f"Billing error: {str(e)}")


@app.post("/billing/portal")
def create_portal(auth: AuthDep, sb: DBDep):
    """Create a Stripe Customer Portal session for managing subscription."""
    stripe = _get_stripe()

    church = sb.table("churches").select("stripe_customer_id").eq("id", auth.church_id).single().execute().data
    customer_id = church.get("stripe_customer_id") if church else None
    if not customer_id:
        raise HTTPException(status_code=400, detail="No billing account. Subscribe first.")

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=settings.cors_origins.split(",")[0].strip() + "/settings",
    )

    return {"portal_url": session.url}


@app.post("/billing/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events to update subscription status."""
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")

    stripe = _get_stripe()

    if settings.stripe_webhook_secret:
        try:
            event = stripe.Webhook.construct_event(body, sig, settings.stripe_webhook_secret)
        except Exception as e:
            logger.warning(f"Webhook signature failed: {e}")
            raise HTTPException(status_code=400, detail="Invalid signature")
    else:
        event = stripe.Event.construct_from(json.loads(body), stripe.api_key)

    event_type = event.get("type", "")
    data = event.get("data", {}).get("object", {})
    logger.info(f"Stripe webhook: {event_type}")

    # Get church_id from customer metadata
    customer_id = data.get("customer", "")
    church_id = None
    if customer_id:
        try:
            customer = stripe.Customer.retrieve(customer_id)
            church_id = customer.get("metadata", {}).get("church_id")
        except Exception:
            pass

    if not church_id:
        return {"received": True}

    # Create an admin-level Supabase client for webhook updates
    db = create_client(settings.supabase_url, settings.supabase_anon_key)

    status_map = {
        "customer.subscription.created": "active",
        "customer.subscription.updated": None,  # check sub status
        "customer.subscription.deleted": "canceled",
        "customer.subscription.trial_will_end": None,  # info only
        "invoice.payment_succeeded": "active",
        "invoice.payment_failed": "past_due",
    }

    new_status = status_map.get(event_type)

    if event_type == "customer.subscription.updated":
        sub_status = data.get("status", "")
        if sub_status == "active":
            new_status = "active"
        elif sub_status == "trialing":
            new_status = "trial"
        elif sub_status == "past_due":
            new_status = "past_due"
        elif sub_status in ("canceled", "unpaid"):
            new_status = "canceled"

    if new_status:
        db.table("churches").update({"subscription_status": new_status}).eq("id", church_id).execute()
        logger.info(f"Updated church {church_id} subscription to {new_status}")

    return {"received": True}


# ---------------------------------------------------------------------------
# Staff / User Management
# ---------------------------------------------------------------------------

def _require_admin(auth: AuthContext):
    if auth.role != "Admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


@app.get("/staff")
def list_staff(auth: AuthDep, sb: DBDep):
    """List all staff members for this church."""
    return sb.table("church_staff").select("*").eq("church_id", auth.church_id).order("created_at").execute().data


@app.get("/staff/me")
def get_my_role(auth: AuthDep):
    """Return the current user's role."""
    return {"user_id": auth.user_id, "email": auth.email, "role": auth.role}


class InviteStaffIn(BaseModel):
    email: str
    display_name: str
    role: str = "Staff"  # Admin | Staff | View-Only


@app.post("/staff/invite", status_code=201)
def invite_staff(body: InviteStaffIn, auth: AuthDep, sb: DBDep):
    """Invite a new staff member. They must already have a Supabase auth account
    (signed up) with the same church_id — or the admin adds them manually."""
    _require_admin(auth)

    role = body.role.strip()
    if role not in ("Admin", "Staff", "View-Only"):
        raise HTTPException(status_code=400, detail="Invalid role. Use Admin, Staff, or View-Only")

    # Check if already exists
    existing = sb.table("church_staff").select("id").eq("church_id", auth.church_id).eq("email", body.email.strip().lower()).execute().data
    if existing:
        raise HTTPException(status_code=400, detail="This email is already on your staff list")

    # Generate a placeholder user_id — will be updated when they actually sign up/login
    import uuid
    placeholder_uid = str(uuid.uuid4())

    return sb_insert(sb, "church_staff", {
        "church_id": auth.church_id,
        "user_id": placeholder_uid,
        "email": body.email.strip().lower(),
        "display_name": body.display_name.strip(),
        "role": role,
        "active": True,
    })


class UpdateStaffIn(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


@app.put("/staff/{staff_id}")
def update_staff(staff_id: str, body: UpdateStaffIn, auth: AuthDep, sb: DBDep):
    """Update a staff member's role, name, or active status. Admin only."""
    _require_admin(auth)
    data = body.model_dump(exclude_unset=True)
    if "role" in data and data["role"] not in ("Admin", "Staff", "View-Only"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    return sb_update(sb, "church_staff", auth.church_id, staff_id, data)


@app.delete("/staff/{staff_id}", status_code=204)
def remove_staff(staff_id: str, auth: AuthDep, sb: DBDep):
    """Remove a staff member. Admin only."""
    _require_admin(auth)
    sb_delete(sb, "church_staff", auth.church_id, staff_id)


@app.post("/staff/setup-owner")
def setup_owner(auth: AuthDep, sb: DBDep):
    """Auto-create the church owner's staff record if it doesn't exist.
    Called on first load to ensure the creator is registered as Admin."""
    existing = sb.table("church_staff").select("id").eq("church_id", auth.church_id).eq("user_id", auth.user_id).execute().data
    if existing:
        return existing[0]
    return sb_insert(sb, "church_staff", {
        "church_id": auth.church_id,
        "user_id": auth.user_id,
        "email": auth.email,
        "display_name": auth.email.split("@")[0],
        "role": "Admin",
        "active": True,
    })


# ---------------------------------------------------------------------------
# Smart Search (AI-powered cross-data search)
# ---------------------------------------------------------------------------

class SmartSearchIn(BaseModel):
    query: str = Field(max_length=500)


@app.post("/ai/smart-search")
def ai_smart_search(body: SmartSearchIn, auth: AuthDep, sb: DBDep):
    """Search across all church data using AI to understand intent."""
    cid = auth.church_id
    q = body.query.strip()
    if not q:
        return {"results": []}

    # Gather data summaries for the AI
    members = sb.table("members").select("id, first_name, last_name, preferred_name, email, phone, status").eq("church_id", cid).execute().data
    giving = sb.table("giving").select("member_id, amount, category, date, method").eq("church_id", cid).order("date", desc=True).limit(50).execute().data
    events = sb.table("events").select("id, name, date, event_type").eq("church_id", cid).order("date", desc=True).limit(20).execute().data
    groups = sb.table("groups").select("id, name").eq("church_id", cid).execute().data

    member_map = {m["id"]: f"{m.get('preferred_name') or m['first_name']} {m['last_name']}" for m in members}

    data_context = f"""Church data available for searching:

MEMBERS ({len(members)}):
{chr(10).join(f"- {m.get('preferred_name') or m['first_name']} {m['last_name']} | {m.get('email','')} | {m.get('phone','')} | Status: {m.get('status','')}" for m in members[:50])}

RECENT GIVING ({len(giving)} records):
{chr(10).join(f"- {member_map.get(g['member_id'],'Anonymous')}: ${g['amount']} to {g['category']} on {g['date']} via {g.get('method','N/A')}" for g in giving[:30])}

EVENTS ({len(events)}):
{chr(10).join(f"- {e['name']} ({e.get('event_type','')}) on {e['date']}" for e in events[:20])}

GROUPS ({len(groups)}):
{chr(10).join(f"- {g['name']}" for g in groups)}
"""

    system_prompt = """You are a smart search assistant for a church management system.
The user is searching across church data. Based on their query, find and return relevant results.

Return JSON array of results, each with:
{"category": "Member|Giving|Event|Group|Help", "title": "...", "subtitle": "...", "detail": "..."}

For help queries (how to, what is, etc.), provide helpful instructions.
Keep results relevant and concise. Max 10 results.
Return ONLY the JSON array, no other text."""

    result = ai_chat(system_prompt, f"Search query: {q}\n\nData:\n{data_context}", max_tokens=1500)

    try:
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            cleaned = cleaned.rsplit("```", 1)[0]
        parsed = json.loads(cleaned)
        return {"results": parsed}
    except (json.JSONDecodeError, IndexError):
        return {"results": [{"category": "Search", "title": "Results", "subtitle": result[:200], "detail": ""}]}


# ---------------------------------------------------------------------------
# Photo upload (base64 → Supabase Storage)
# ---------------------------------------------------------------------------

class PhotoUploadIn(BaseModel):
    member_id: str
    photo_base64: str  # data:image/...;base64,... or raw base64
    filename: str = "photo.jpg"


@app.post("/members/{member_id}/photo")
def upload_member_photo(member_id: str, body: PhotoUploadIn, auth: AuthDep, sb: DBDep):
    """Upload a member photo via base64, store in Supabase Storage, update photo_url."""
    sb_get(sb, "members", auth.church_id, member_id)

    # Strip data URL prefix if present
    raw = body.photo_base64
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        photo_bytes = base64.b64decode(raw, validate=True)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid base64 image data")
    if len(photo_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be less than 5MB")

    ext = body.filename.rsplit(".", 1)[-1].lower() if "." in body.filename else "jpg"
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        ext = "jpg"
    content_type = f"image/{'jpeg' if ext in ('jpg','jpeg') else ext}"
    storage_path = f"{auth.church_id}/{member_id}.{ext}"

    # Upload via httpx for reliability
    # Try to delete existing file first
    try:
        httpx.delete(
            f"{settings.supabase_url}/storage/v1/object/member-photos/{storage_path}",
            headers={"Authorization": f"Bearer {auth.token}", "apikey": settings.supabase_anon_key},
            timeout=10.0,
        )
    except Exception:
        pass

    resp = httpx.post(
        f"{settings.supabase_url}/storage/v1/object/member-photos/{storage_path}",
        headers={
            "Authorization": f"Bearer {auth.token}",
            "apikey": settings.supabase_anon_key,
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        content=photo_bytes,
        timeout=30.0,
    )
    if not resp.is_success:
        logger.error(f"Photo upload failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=500, detail="Photo upload failed. Please try again.")

    public_url = f"{settings.supabase_url}/storage/v1/object/public/member-photos/{storage_path}?t={int(datetime.now(timezone.utc).timestamp())}"
    sb_update(sb, "members", auth.church_id, member_id, {"photo_url": public_url})
    return {"photo_url": public_url}


# ---------------------------------------------------------------------------
# Custom giving categories
# ---------------------------------------------------------------------------

class CategoryIn(BaseModel):
    name: str


@app.get("/categories")
def list_categories(auth: AuthDep, sb: DBDep):
    rows = sb_select(sb, "categories", auth.church_id)
    return [r["name"] for r in sorted(rows, key=lambda x: x["name"])]


@app.post("/categories", status_code=201)
def create_category(body: CategoryIn, auth: AuthDep, sb: DBDep):
    return sb_insert(sb, "categories", {"name": body.name.strip(), "church_id": auth.church_id})


@app.delete("/categories/{name}", status_code=204)
def delete_category(name: str, auth: AuthDep, sb: DBDep):
    sb.table("categories").delete().eq("church_id", auth.church_id).eq("name", name).execute()


# ---------------------------------------------------------------------------
# Enhanced reports
# ---------------------------------------------------------------------------

@app.get("/reports/giving-detail")
def report_giving_detail(auth: AuthDep, sb: DBDep, year: int, month: Optional[int] = None, day: Optional[int] = None):
    """Giving detail report — filterable by year, month, or specific day."""
    cid = auth.church_id

    if day and month:
        start = f"{year}-{month:02d}-{day:02d}"
        end = f"{year}-{month:02d}-{day:02d}"
        rows = sb.table("giving").select("member_id, amount, category, method, date, notes").eq("church_id", cid).eq("date", start).execute().data
    elif month:
        start = f"{year}-{month:02d}-01"
        end = f"{year + 1}-01-01" if month == 12 else f"{year}-{month + 1:02d}-01"
        rows = sb.table("giving").select("member_id, amount, category, method, date, notes").eq("church_id", cid).gte("date", start).lt("date", end).execute().data
    else:
        start = f"{year}-01-01"
        end = f"{year + 1}-01-01"
        rows = sb.table("giving").select("member_id, amount, category, method, date, notes").eq("church_id", cid).gte("date", start).lt("date", end).execute().data

    # Attach member names
    member_rows = sb.table("members").select("id, first_name, last_name, preferred_name").eq("church_id", cid).execute().data
    member_map = {m["id"]: f"{m.get('preferred_name') or m['first_name']} {m['last_name']}" for m in member_rows}

    for r in rows:
        r["member_name"] = member_map.get(r["member_id"], "Anonymous") if r["member_id"] else "Anonymous"

    grand_total = sum(r["amount"] for r in rows)

    # Aggregate by category
    cat_agg: dict[str, dict] = {}
    for r in rows:
        cat = r["category"]
        if cat not in cat_agg:
            cat_agg[cat] = {"category": cat, "total": 0.0, "count": 0}
        cat_agg[cat]["total"] += r["amount"]
        cat_agg[cat]["count"] += 1

    return {
        "records": sorted(rows, key=lambda x: x["date"]),
        "by_category": sorted(cat_agg.values(), key=lambda x: x["total"], reverse=True),
        "grand_total": grand_total,
        "record_count": len(rows),
    }


# ---------------------------------------------------------------------------
# AI — Pastoral Insights
# ---------------------------------------------------------------------------

@app.get("/ai/pastoral-insights")
def pastoral_insights(auth: AuthDep, sb: DBDep):
    """Analyze member engagement data and return AI-generated pastoral insights."""
    cid = auth.church_id
    today = datetime.now(timezone.utc).date()

    # Gather all the data the AI needs to analyze
    members = sb.table("members").select("id, first_name, last_name, email, family_id, created_at").eq("church_id", cid).execute().data
    events = sb.table("events").select("id, name, date").eq("church_id", cid).order("date", desc=True).limit(30).execute().data
    giving_90d = sb.table("giving").select("member_id, amount, date, category").eq("church_id", cid).gte("date", str(today.replace(day=1) if today.month > 3 else today.replace(year=today.year - 1, month=today.month + 9, day=1))).execute().data
    groups = sb.table("groups").select("id, name").eq("church_id", cid).execute().data

    # Attendance across recent events
    event_ids = [e["id"] for e in events]
    attendance_rows = []
    for eid in event_ids[:20]:
        rows = sb.table("event_attendance").select("member_id").eq("event_id", eid).execute().data
        for r in rows:
            attendance_rows.append({"event_id": eid, "member_id": r["member_id"]})

    # Group memberships
    group_membership = []
    for g in groups:
        rows = sb.table("group_members").select("member_id").eq("group_id", g["id"]).execute().data
        for r in rows:
            group_membership.append({"group_id": g["id"], "group_name": g["name"], "member_id": r["member_id"]})

    # Build member lookup
    member_map = {m["id"]: f"{m['first_name']} {m['last_name']}" for m in members}

    # Build attendance per member
    attendance_by_member: dict[str, int] = defaultdict(int)
    for a in attendance_rows:
        attendance_by_member[a["member_id"]] += 1

    # Build giving per member
    giving_by_member: dict[str, float] = defaultdict(float)
    for g in giving_90d:
        if g["member_id"]:
            giving_by_member[g["member_id"]] += g["amount"]

    # Members in groups
    members_in_groups = set(gm["member_id"] for gm in group_membership)

    # Build data summary for AI
    data_summary = f"""Church data snapshot (as of {today.isoformat()}):

Total members: {len(members)}
Recent events (last 30): {len(events)}
Total groups: {len(groups)}

MEMBER ENGAGEMENT (last ~90 days):
"""
    for m in members:
        mid = m["id"]
        name = member_map[mid]
        att_count = attendance_by_member.get(mid, 0)
        give_total = giving_by_member.get(mid, 0)
        in_group = mid in members_in_groups
        joined = m["created_at"][:10] if m.get("created_at") else "unknown"
        data_summary += f"- {name}: joined {joined}, attended {att_count}/{len(events[:20])} recent events, gave ${give_total:.0f} (90d), in a group: {'yes' if in_group else 'NO'}\n"

    system_prompt = """You are a pastoral care AI assistant for a church management system.
Analyze the member engagement data and provide actionable pastoral insights.
Focus on:
1. Members who may need outreach (declining attendance, stopped giving, not connected to any group)
2. New members who haven't been integrated yet (no group, low attendance)
3. Positive trends worth celebrating
4. Specific, actionable recommendations for the pastoral team

Format your response as JSON with this structure:
{
  "needs_attention": [{"name": "...", "reason": "...", "suggestion": "..."}],
  "new_member_followup": [{"name": "...", "joined": "...", "status": "...", "suggestion": "..."}],
  "positive_highlights": ["..."],
  "recommendations": ["..."],
  "summary": "A 2-3 sentence executive summary of the church's overall engagement health."
}

Be specific with names. Keep suggestions practical and pastoral in tone. If there are no members, still return valid JSON with empty arrays and a helpful summary."""

    result = ai_chat(system_prompt, data_summary, max_tokens=3000)

    # Try to parse as JSON, fall back to raw text
    try:
        # Strip markdown code fences if present
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            cleaned = cleaned.rsplit("```", 1)[0]
        parsed = json.loads(cleaned)
        return {"insights": parsed, "raw": None}
    except (json.JSONDecodeError, IndexError):
        return {"insights": None, "raw": result}


# ---------------------------------------------------------------------------
# AI — Report Summary
# ---------------------------------------------------------------------------

class ReportSummaryIn(BaseModel):
    report_type: str  # "monthly_giving", "members", "annual_giving"
    year: int
    month: Optional[int] = None


@app.post("/ai/report-summary")
def ai_report_summary(body: ReportSummaryIn, auth: AuthDep, sb: DBDep):
    """Generate a natural language summary of a report."""
    cid = auth.church_id

    if body.report_type == "monthly_giving":
        if not body.month:
            raise HTTPException(status_code=400, detail="month required for monthly_giving report")
        start = f"{body.year}-{body.month:02d}-01"
        end = f"{body.year + 1}-01-01" if body.month == 12 else f"{body.year}-{body.month + 1:02d}-01"
        rows = sb.table("giving").select("category, amount").eq("church_id", cid).gte("date", start).lt("date", end).execute().data
        agg: dict[str, dict] = {}
        for r in rows:
            cat = r["category"]
            if cat not in agg:
                agg[cat] = {"category": cat, "total": 0.0, "count": 0}
            agg[cat]["total"] += r["amount"]
            agg[cat]["count"] += 1
        grand_total = sum(a["total"] for a in agg.values())

        # Get previous month for comparison
        prev_month = body.month - 1 if body.month > 1 else 12
        prev_year = body.year if body.month > 1 else body.year - 1
        prev_start = f"{prev_year}-{prev_month:02d}-01"
        prev_end = start
        prev_rows = sb.table("giving").select("amount").eq("church_id", cid).gte("date", prev_start).lt("date", prev_end).execute().data
        prev_total = sum(r["amount"] for r in prev_rows)

        data_text = f"""Monthly Giving Report — {body.year}-{body.month:02d}:
Grand total: ${grand_total:.2f}
Previous month total: ${prev_total:.2f}
By category: {', '.join(f'{a["category"]}: ${a["total"]:.2f} ({a["count"]} transactions)' for a in sorted(agg.values(), key=lambda x: x["total"], reverse=True))}
Total transactions: {sum(a["count"] for a in agg.values())}"""

    elif body.report_type == "members":
        if not body.month:
            raise HTTPException(status_code=400, detail="month required for members report")
        total = len(sb.table("members").select("id").eq("church_id", cid).execute().data)
        month_start = f"{body.year}-{body.month:02d}-01"
        month_end = f"{body.year + 1}-01-01" if body.month == 12 else f"{body.year}-{body.month + 1:02d}-01"
        added = len(sb.table("members").select("id").eq("church_id", cid).gte("created_at", month_start).lt("created_at", month_end).execute().data)
        data_text = f"""Member Report — {body.year}-{body.month:02d}:
Total members: {total}
New members this month: {added}"""

    elif body.report_type == "annual_giving":
        start = f"{body.year}-01-01"
        end = f"{body.year + 1}-01-01"
        rows = sb.table("giving").select("member_id, amount").eq("church_id", cid).gte("date", start).lt("date", end).execute().data
        total = sum(r["amount"] for r in rows)
        unique_donors = len(set(r["member_id"] for r in rows if r["member_id"]))
        data_text = f"""Annual Giving Report — {body.year}:
Total given: ${total:.2f}
Unique donors: {unique_donors}
Total transactions: {len(rows)}"""
    else:
        raise HTTPException(status_code=400, detail="Invalid report_type")

    system_prompt = """You are a financial and membership analyst for a church.
Given the report data, write a clear, concise natural language summary (3-5 sentences).
Highlight trends, comparisons to prior periods when available, and note anything noteworthy.
Keep it professional but warm — this is for church leadership.
Do NOT use markdown formatting. Write plain text paragraphs."""

    summary = ai_chat(system_prompt, data_text, max_tokens=500)
    return {"summary": summary}


# ---------------------------------------------------------------------------
# AI — Communication Drafts
# ---------------------------------------------------------------------------

class CommDraftIn(BaseModel):
    draft_type: str = Field(max_length=50)
    context: str = Field(max_length=2000)
    tone: str = Field(default="warm", max_length=20)


@app.post("/ai/communication-draft")
def ai_communication_draft(body: CommDraftIn, auth: AuthDep, sb: DBDep):
    """Generate a communication draft (announcement, email, etc.)."""
    # Get church info for personalization
    church = sb.table("churches").select("name, pastor_name").eq("id", auth.church_id).single().execute().data

    church_name = church.get("name", "Our Church") if church else "Our Church"
    pastor_name = church.get("pastor_name", "") if church else ""

    type_instructions = {
        "announcement": "Write a church announcement suitable for a Sunday bulletin or website post.",
        "event_promo": "Write a promotional message for a church event. Include a call to action.",
        "welcome_email": "Write a warm welcome email for a new church member.",
        "thank_you": "Write a thank you note for a church donor/volunteer.",
        "newsletter": "Write a church newsletter section or update.",
    }

    instruction = type_instructions.get(body.draft_type, "Write a church communication.")

    system_prompt = f"""You are a communications assistant for {church_name}.
{instruction}
Tone: {body.tone}
Pastor/Leader name: {pastor_name or 'Church Leadership'}

Write the complete draft ready to use. Include a subject line if it's an email.
Do NOT use markdown formatting — write plain text that can be copied directly.
Keep it concise but complete."""

    draft = ai_chat(system_prompt, f"Details: {body.context}", max_tokens=1500)
    return {"draft": draft, "draft_type": body.draft_type}


# ---------------------------------------------------------------------------
# AI — Sermon Prep
# ---------------------------------------------------------------------------

class SermonPrepIn(BaseModel):
    topic: str = ""
    scripture: str = ""
    notes: str = ""
    style: str = "expository"  # "expository", "topical", "narrative", "devotional"


@app.post("/ai/sermon-prep")
def ai_sermon_prep(body: SermonPrepIn, auth: AuthDep, sb: DBDep):
    """Generate a sermon outline based on scripture, topic, and style."""
    if not body.topic and not body.scripture:
        raise HTTPException(status_code=400, detail="Provide at least a topic or scripture reference")

    church = sb.table("churches").select("name").eq("id", auth.church_id).single().execute().data
    church_name = church.get("name", "the church") if church else "the church"

    user_prompt_parts = []
    if body.scripture:
        user_prompt_parts.append(f"Scripture passage: {body.scripture}")
    if body.topic:
        user_prompt_parts.append(f"Topic/Theme: {body.topic}")
    if body.notes:
        user_prompt_parts.append(f"Additional notes: {body.notes}")

    system_prompt = f"""You are a sermon preparation assistant for {church_name}.
Create a detailed sermon outline in the {body.style} style.

Your outline should include:
1. Title — a compelling sermon title
2. Introduction — hook, context, and thesis statement
3. Main Points (3-4) — each with sub-points, supporting scripture, and illustrations
4. Application — practical takeaways for the congregation
5. Conclusion — summary and call to action/response
6. Discussion Questions — 3-4 questions for small groups

Format as clean plain text with clear headings and indentation.
Be theologically sound, practical, and applicable to modern church life.
Include relevant cross-references to other scripture passages."""

    outline = ai_chat(system_prompt, "\n".join(user_prompt_parts), max_tokens=3000)
    return {"outline": outline, "style": body.style}


# ---------------------------------------------------------------------------
# Standalone Attendance (headcount-based, like desktop app)
# ---------------------------------------------------------------------------

class StandaloneAttendanceIn(BaseModel):
    service_type: str = "Sunday Service"
    date: str  # ISO date
    headcount: int = 0
    notes: str = ""
    event_id: Optional[str] = None


@app.get("/attendance")
def list_attendance_records(auth: AuthDep, sb: DBDep):
    return sb.table("attendance").select("*").eq("church_id", auth.church_id).order("date", desc=True).execute().data


@app.post("/attendance", status_code=201)
def create_attendance_record(body: StandaloneAttendanceIn, auth: AuthDep, sb: DBDep):
    return sb_insert(sb, "attendance", {**body.model_dump(), "church_id": auth.church_id})


@app.put("/attendance/{record_id}")
def update_attendance_record(record_id: str, body: StandaloneAttendanceIn, auth: AuthDep, sb: DBDep):
    return sb_update(sb, "attendance", auth.church_id, record_id, body.model_dump())


@app.delete("/attendance/{record_id}", status_code=204)
def delete_attendance_record(record_id: str, auth: AuthDep, sb: DBDep):
    sb_delete(sb, "attendance", auth.church_id, record_id)


# ---------------------------------------------------------------------------
# Bible Study Groups
# ---------------------------------------------------------------------------

class BibleStudyGroupIn(BaseModel):
    name: str
    description: str = ""
    meeting_day: str = ""
    meeting_time: str = ""
    location: str = ""
    teacher_id: Optional[str] = None


@app.get("/bible-study")
def list_bible_study_groups(auth: AuthDep, sb: DBDep):
    rows = sb_select(sb, "bible_study_groups", auth.church_id)
    for row in rows:
        count_resp = sb.table("bible_study_members").select("id", count="exact").eq("group_id", row["id"]).execute()
        row["member_count"] = count_resp.count or 0
        if row.get("teacher_id"):
            teacher = sb.table("members").select("first_name, last_name, preferred_name").eq("id", row["teacher_id"]).execute().data
            if teacher:
                t = teacher[0]
                row["teacher_name"] = f"{t.get('preferred_name') or t['first_name']} {t['last_name']}"
            else:
                row["teacher_name"] = ""
        else:
            row["teacher_name"] = ""
    return rows


@app.post("/bible-study", status_code=201)
def create_bible_study_group(body: BibleStudyGroupIn, auth: AuthDep, sb: DBDep):
    return sb_insert(sb, "bible_study_groups", {**body.model_dump(), "church_id": auth.church_id})


@app.get("/bible-study/{group_id}")
def get_bible_study_group(group_id: str, auth: AuthDep, sb: DBDep):
    return sb_get(sb, "bible_study_groups", auth.church_id, group_id)


@app.put("/bible-study/{group_id}")
def update_bible_study_group(group_id: str, body: BibleStudyGroupIn, auth: AuthDep, sb: DBDep):
    return sb_update(sb, "bible_study_groups", auth.church_id, group_id, body.model_dump())


@app.delete("/bible-study/{group_id}", status_code=204)
def delete_bible_study_group(group_id: str, auth: AuthDep, sb: DBDep):
    sb_delete(sb, "bible_study_groups", auth.church_id, group_id)


# Bible study group members
@app.get("/bible-study/{group_id}/members")
def list_bible_study_members(group_id: str, auth: AuthDep, sb: DBDep):
    sb_get(sb, "bible_study_groups", auth.church_id, group_id)
    rows = sb.table("bible_study_members").select("member_id").eq("group_id", group_id).execute().data
    return [r["member_id"] for r in rows]


@app.post("/bible-study/{group_id}/members", status_code=201)
def add_bible_study_member(group_id: str, body: GroupMemberIn, auth: AuthDep, sb: DBDep):
    sb_get(sb, "bible_study_groups", auth.church_id, group_id)
    return sb_insert(sb, "bible_study_members", {"group_id": group_id, "member_id": body.member_id})


@app.delete("/bible-study/{group_id}/members/{member_id}", status_code=204)
def remove_bible_study_member(group_id: str, member_id: str, auth: AuthDep, sb: DBDep):
    sb_get(sb, "bible_study_groups", auth.church_id, group_id)
    sb.table("bible_study_members").delete().eq("group_id", group_id).eq("member_id", member_id).execute()


# ---------------------------------------------------------------------------
# Pledges
# ---------------------------------------------------------------------------

class PledgeIn(BaseModel):
    member_id: Optional[str] = None
    year: int
    category: str
    amount: float
    notes: str = ""


@app.get("/pledges")
def list_pledges(auth: AuthDep, sb: DBDep):
    return sb_select(sb, "pledges", auth.church_id)


@app.post("/pledges", status_code=201)
def create_pledge(body: PledgeIn, auth: AuthDep, sb: DBDep):
    return sb_insert(sb, "pledges", {**body.model_dump(), "church_id": auth.church_id})


@app.put("/pledges/{pledge_id}")
def update_pledge(pledge_id: str, body: PledgeIn, auth: AuthDep, sb: DBDep):
    return sb_update(sb, "pledges", auth.church_id, pledge_id, body.model_dump())


@app.delete("/pledges/{pledge_id}", status_code=204)
def delete_pledge(pledge_id: str, auth: AuthDep, sb: DBDep):
    sb_delete(sb, "pledges", auth.church_id, pledge_id)


# ---------------------------------------------------------------------------
# Directory (read-only member listing for printable directory)
# ---------------------------------------------------------------------------

@app.get("/directory")
def get_directory(auth: AuthDep, sb: DBDep):
    """Return all active members sorted by last name for directory/printing."""
    rows = (
        sb.table("members")
        .select("id, first_name, last_name, preferred_name, phone, cell_phone, email, address, city, state, zip, family_id, status, photo_url")
        .eq("church_id", auth.church_id)
        .eq("status", "Active")
        .order("last_name")
        .execute()
        .data
    )
    return rows
