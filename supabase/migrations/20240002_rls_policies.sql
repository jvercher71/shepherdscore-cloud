-- ============================================================
-- Row Level Security — all tables scoped to church_id via JWT
-- ============================================================
-- How it works:
--   Supabase stores church_id in app_metadata on the auth.users record.
--   Our FastAPI backend reads this from the JWT.
--   For direct Supabase client calls from the frontend (future), we expose
--   a helper function that reads app_metadata from the JWT claim.
-- ============================================================

-- Helper: extract church_id from the authenticated user's JWT app_metadata
create or replace function public.auth_church_id()
returns uuid
language sql stable
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid;
$$;

-- ============================================================
-- churches — users can only see/edit their own church row
-- ============================================================
alter table public.churches enable row level security;

create policy "users can view their church"
  on public.churches for select
  using (id = public.auth_church_id());

create policy "users can update their church"
  on public.churches for update
  using (id = public.auth_church_id());

-- ============================================================
-- families
-- ============================================================
alter table public.families enable row level security;

create policy "families: church members only"
  on public.families for all
  using (church_id = public.auth_church_id())
  with check (church_id = public.auth_church_id());

-- ============================================================
-- members
-- ============================================================
alter table public.members enable row level security;

create policy "members: church members only"
  on public.members for all
  using (church_id = public.auth_church_id())
  with check (church_id = public.auth_church_id());

-- ============================================================
-- giving
-- ============================================================
alter table public.giving enable row level security;

create policy "giving: church members only"
  on public.giving for all
  using (church_id = public.auth_church_id())
  with check (church_id = public.auth_church_id());

-- ============================================================
-- events
-- ============================================================
alter table public.events enable row level security;

create policy "events: church members only"
  on public.events for all
  using (church_id = public.auth_church_id())
  with check (church_id = public.auth_church_id());

-- ============================================================
-- event_attendance — scoped via join to events
-- ============================================================
alter table public.event_attendance enable row level security;

create policy "event_attendance: church members only"
  on public.event_attendance for all
  using (
    exists (
      select 1 from public.events e
      where e.id = event_attendance.event_id
        and e.church_id = public.auth_church_id()
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_attendance.event_id
        and e.church_id = public.auth_church_id()
    )
  );

-- ============================================================
-- groups
-- ============================================================
alter table public.groups enable row level security;

create policy "groups: church members only"
  on public.groups for all
  using (church_id = public.auth_church_id())
  with check (church_id = public.auth_church_id());

-- ============================================================
-- group_members — scoped via join to groups
-- ============================================================
alter table public.group_members enable row level security;

create policy "group_members: church members only"
  on public.group_members for all
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and g.church_id = public.auth_church_id()
    )
  )
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_members.group_id
        and g.church_id = public.auth_church_id()
    )
  );
