"""
ShepherdsCore Cloud — FastAPI backend
Multi-tenant church management API backed by Supabase (PostgreSQL + RLS)
"""

from contextlib import asynccontextmanager
from typing import Annotated, Optional
from datetime import datetime
import os

from fastapi import FastAPI, Depends, HTTPException, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from pydantic_settings import BaseSettings
from jose import jwt, JWTError
from supabase import create_client, Client


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str
    groq_api_key: str = ""
    paddle_api_key: str = ""
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


settings = Settings()  # type: ignore[call-arg]


# ---------------------------------------------------------------------------
# Supabase client (service role — bypasses RLS for server-side ops)
# ---------------------------------------------------------------------------

_supabase: Client | None = None

def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _supabase


# ---------------------------------------------------------------------------
# JWT auth middleware
# ---------------------------------------------------------------------------

bearer_scheme = HTTPBearer()

class AuthContext(BaseModel):
    user_id: str
    email: str
    church_id: str

    model_config = {"arbitrary_types_allowed": True}


def verify_token(credentials: Annotated[HTTPAuthorizationCredentials, Security(bearer_scheme)]) -> AuthContext:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

    user_id: str = payload.get("sub", "")
    email: str = payload.get("email", "")
    # church_id is stored in app_metadata by our signup hook / onboarding flow
    app_meta: dict = payload.get("app_metadata", {})
    church_id: str = app_meta.get("church_id", "")

    if not user_id or not church_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="church_id not found in token. Complete church onboarding first.",
        )
    return AuthContext(user_id=user_id, email=email, church_id=church_id)


AuthDep = Annotated[AuthContext, Depends(verify_token)]
SupabaseDep = Annotated[Client, Depends(get_supabase)]


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm up Supabase connection
    get_supabase()
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
    sb: SupabaseDep,
):
    """Create a church for a newly-registered user and stamp church_id into their
    Supabase app_metadata so the next JWT refresh includes it."""
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {e}")

    user_id: str = payload.get("sub", "") or body.user_id
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="user_id required")

    church = sb_insert(sb, "churches", {
        "name": body.church_name,
        "pastor_name": body.pastor_name,
    })
    church_id = church["id"]

    # Stamp church_id into the user's app_metadata so it flows into future JWTs.
    try:
        sb.auth.admin.update_user_by_id(
            user_id,
            {"app_metadata": {"church_id": church_id}},
        )
    except Exception:
        # Non-fatal: the caller can also set this via Supabase dashboard / trigger.
        pass

    return {"church_id": church_id}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.get("/dashboard/stats")
def dashboard_stats(auth: AuthDep, sb: SupabaseDep):
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
def list_members(auth: AuthDep, sb: SupabaseDep):
    return sb_select(sb, "members", auth.church_id)


@app.post("/members", status_code=201)
def create_member(body: MemberIn, auth: AuthDep, sb: SupabaseDep):
    return sb_insert(sb, "members", {**body.model_dump(), "church_id": auth.church_id})


@app.get("/members/{member_id}")
def get_member(member_id: str, auth: AuthDep, sb: SupabaseDep):
    return sb_get(sb, "members", auth.church_id, member_id)


@app.put("/members/{member_id}")
def update_member(member_id: str, body: MemberUpdateIn, auth: AuthDep, sb: SupabaseDep):
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    return sb_update(sb, "members", auth.church_id, member_id, data)


@app.delete("/members/{member_id}", status_code=204)
def delete_member(member_id: str, auth: AuthDep, sb: SupabaseDep):
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
def list_families(auth: AuthDep, sb: SupabaseDep):
    rows = sb_select(sb, "families", auth.church_id)
    for row in rows:
        count_resp = sb.table("members").select("id", count="exact").eq("family_id", row["id"]).execute()
        row["member_count"] = count_resp.count or 0
    return rows


@app.get("/families/{family_id}")
def get_family(family_id: str, auth: AuthDep, sb: SupabaseDep):
    return sb_get(sb, "families", auth.church_id, family_id)


@app.post("/families", status_code=201)
def create_family(body: FamilyIn, auth: AuthDep, sb: SupabaseDep):
    return sb_insert(sb, "families", {**body.model_dump(), "church_id": auth.church_id})


@app.put("/families/{family_id}")
def update_family(family_id: str, body: FamilyIn, auth: AuthDep, sb: SupabaseDep):
    return sb_update(sb, "families", auth.church_id, family_id, body.model_dump())


@app.delete("/families/{family_id}", status_code=204)
def delete_family(family_id: str, auth: AuthDep, sb: SupabaseDep):
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
def list_giving(auth: AuthDep, sb: SupabaseDep):
    return sb_select(sb, "giving", auth.church_id)


@app.post("/giving", status_code=201)
def create_giving(body: GivingIn, auth: AuthDep, sb: SupabaseDep):
    return sb_insert(sb, "giving", {**body.model_dump(), "church_id": auth.church_id})


@app.get("/giving/{record_id}")
def get_giving(record_id: str, auth: AuthDep, sb: SupabaseDep):
    return sb_get(sb, "giving", auth.church_id, record_id)


@app.put("/giving/{record_id}")
def update_giving(record_id: str, body: GivingIn, auth: AuthDep, sb: SupabaseDep):
    return sb_update(sb, "giving", auth.church_id, record_id, body.model_dump())


@app.delete("/giving/{record_id}", status_code=204)
def delete_giving(record_id: str, auth: AuthDep, sb: SupabaseDep):
    sb_delete(sb, "giving", auth.church_id, record_id)


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

class EventIn(BaseModel):
    name: str
    date: str  # ISO date
    description: str = ""


@app.get("/events")
def list_events(auth: AuthDep, sb: SupabaseDep):
    return sb_select(sb, "events", auth.church_id)


@app.post("/events", status_code=201)
def create_event(body: EventIn, auth: AuthDep, sb: SupabaseDep):
    return sb_insert(sb, "events", {**body.model_dump(), "church_id": auth.church_id})


@app.get("/events/{event_id}")
def get_event(event_id: str, auth: AuthDep, sb: SupabaseDep):
    return sb_get(sb, "events", auth.church_id, event_id)


@app.put("/events/{event_id}")
def update_event(event_id: str, body: EventIn, auth: AuthDep, sb: SupabaseDep):
    return sb_update(sb, "events", auth.church_id, event_id, body.model_dump())


@app.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: str, auth: AuthDep, sb: SupabaseDep):
    sb_delete(sb, "events", auth.church_id, event_id)


# Event attendance
@app.get("/events/{event_id}/attendance")
def list_attendance(event_id: str, auth: AuthDep, sb: SupabaseDep):
    # verify event belongs to this church
    sb_get(sb, "events", auth.church_id, event_id)
    rows = sb.table("event_attendance").select("member_id").eq("event_id", event_id).execute().data
    return [r["member_id"] for r in rows]


class AttendanceIn(BaseModel):
    member_id: str


@app.post("/events/{event_id}/attendance", status_code=201)
def check_in(event_id: str, body: AttendanceIn, auth: AuthDep, sb: SupabaseDep):
    sb_get(sb, "events", auth.church_id, event_id)
    return sb_insert(sb, "event_attendance", {"event_id": event_id, "member_id": body.member_id})


@app.delete("/events/{event_id}/attendance/{member_id}", status_code=204)
def check_out(event_id: str, member_id: str, auth: AuthDep, sb: SupabaseDep):
    sb_get(sb, "events", auth.church_id, event_id)
    sb.table("event_attendance").delete().eq("event_id", event_id).eq("member_id", member_id).execute()


# Group membership list
@app.get("/groups/{group_id}/members")
def list_group_members(group_id: str, auth: AuthDep, sb: SupabaseDep):
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
def list_groups(auth: AuthDep, sb: SupabaseDep):
    rows = sb_select(sb, "groups", auth.church_id)
    # attach member count
    for row in rows:
        count_resp = sb.table("group_members").select("id", count="exact").eq("group_id", row["id"]).execute()
        row["member_count"] = count_resp.count or 0
    return rows


@app.post("/groups", status_code=201)
def create_group(body: GroupIn, auth: AuthDep, sb: SupabaseDep):
    return sb_insert(sb, "groups", {**body.model_dump(), "church_id": auth.church_id})


@app.get("/groups/{group_id}")
def get_group(group_id: str, auth: AuthDep, sb: SupabaseDep):
    return sb_get(sb, "groups", auth.church_id, group_id)


@app.put("/groups/{group_id}")
def update_group(group_id: str, body: GroupIn, auth: AuthDep, sb: SupabaseDep):
    return sb_update(sb, "groups", auth.church_id, group_id, body.model_dump())


@app.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: str, auth: AuthDep, sb: SupabaseDep):
    sb_delete(sb, "groups", auth.church_id, group_id)


# Group membership
class GroupMemberIn(BaseModel):
    member_id: str


@app.post("/groups/{group_id}/members", status_code=201)
def add_group_member(group_id: str, body: GroupMemberIn, auth: AuthDep, sb: SupabaseDep):
    # verify group belongs to church
    sb_get(sb, "groups", auth.church_id, group_id)
    return sb_insert(sb, "group_members", {"group_id": group_id, "member_id": body.member_id})


@app.delete("/groups/{group_id}/members/{member_id}", status_code=204)
def remove_group_member(group_id: str, member_id: str, auth: AuthDep, sb: SupabaseDep):
    sb_get(sb, "groups", auth.church_id, group_id)
    sb.table("group_members").delete().eq("group_id", group_id).eq("member_id", member_id).execute()


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@app.get("/reports/giving")
def report_giving(year: int, month: int, auth: AuthDep, sb: SupabaseDep):
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
def report_members(year: int, month: int, auth: AuthDep, sb: SupabaseDep):
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
def report_annual_giving(year: int, auth: AuthDep, sb: SupabaseDep):
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
def get_settings(auth: AuthDep, sb: SupabaseDep):
    resp = sb.table("churches").select("*").eq("id", auth.church_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Church not found")
    return resp.data


@app.put("/settings")
def update_settings(body: ChurchSettingsIn, auth: AuthDep, sb: SupabaseDep):
    resp = sb.table("churches").update(body.model_dump()).eq("id", auth.church_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Church not found")
    return resp.data[0]
