"""
ShepherdsCore Cloud — FastAPI backend
Multi-tenant church management API backed by Supabase (PostgreSQL + RLS)
"""

from contextlib import asynccontextmanager
from typing import Annotated, Optional
from datetime import datetime
from collections import defaultdict

import httpx
from fastapi import FastAPI, Depends, HTTPException, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from pydantic_settings import BaseSettings
from supabase import create_client, Client
from groq import Groq


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    groq_api_key: str = ""
    stripe_secret_key: str = ""
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
    return AuthContext(user_id=user_id, email=email, church_id=church_id, token=token)


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
    allow_methods=["*"],
    allow_headers=["*"],
)


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

    today = datetime.utcnow().date()
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
    first_name: str
    last_name: str
    email: str = ""
    phone: str = ""
    address: str = ""
    photo_url: str = ""
    family_id: Optional[str] = None


class MemberUpdateIn(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    family_id: Optional[str] = None


@app.get("/members")
def list_members(auth: AuthDep, sb: DBDep):
    return sb_select(sb, "members", auth.church_id)


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
    amount: float
    category: str = "General Offering"
    date: str  # ISO date string YYYY-MM-DD
    notes: str = ""


@app.get("/giving")
def list_giving(auth: AuthDep, sb: DBDep):
    return sb_select(sb, "giving", auth.church_id)


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
    description: str = ""


@app.get("/events")
def list_events(auth: AuthDep, sb: DBDep):
    return sb_select(sb, "events", auth.church_id)


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
def report_giving(year: int, month: int, auth: AuthDep, sb: DBDep):
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
def report_members(year: int, month: int, auth: AuthDep, sb: DBDep):
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
# AI — Pastoral Insights
# ---------------------------------------------------------------------------

@app.get("/ai/pastoral-insights")
def pastoral_insights(auth: AuthDep, sb: DBDep):
    """Analyze member engagement data and return AI-generated pastoral insights."""
    cid = auth.church_id
    today = datetime.utcnow().date()

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
    import json
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
    draft_type: str  # "announcement", "event_promo", "welcome_email", "thank_you", "newsletter"
    context: str  # user-provided context or details
    tone: str = "warm"  # "warm", "formal", "casual"


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
