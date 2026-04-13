-- ============================================================
-- ShepherdsCore Cloud — Initial Schema
-- ============================================================
-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- churches
-- ============================================================
create table public.churches (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '',
  address       text not null default '',
  phone         text not null default '',
  email         text not null default '',
  website       text not null default '',
  pastor_name   text not null default '',
  subscription_status  text not null default 'trial',  -- trial | active | past_due | canceled
  paddle_customer_id   text,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- families
-- ============================================================
create table public.families (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- members
-- ============================================================
create table public.members (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  email       text not null default '',
  phone       text not null default '',
  address     text not null default '',
  photo_url   text not null default '',
  family_id   uuid references public.families(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- giving
-- ============================================================
create table public.giving (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade,
  member_id  uuid references public.members(id) on delete set null,
  amount     numeric(12, 2) not null check (amount >= 0),
  category   text not null default 'General Offering',
  date       date not null,
  notes      text not null default '',
  created_at timestamptz not null default now()
);

-- ============================================================
-- events
-- ============================================================
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  name        text not null,
  date        date not null,
  description text not null default '',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- event_attendance
-- ============================================================
create table public.event_attendance (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, member_id)
);

-- ============================================================
-- groups
-- ============================================================
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches(id) on delete cascade,
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- group_members
-- ============================================================
create table public.group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, member_id)
);

-- ============================================================
-- Indexes for common query patterns
-- ============================================================
create index on public.members (church_id);
create index on public.families (church_id);
create index on public.giving (church_id, date);
create index on public.giving (member_id);
create index on public.events (church_id, date);
create index on public.groups (church_id);
create index on public.group_members (group_id);
create index on public.group_members (member_id);
create index on public.event_attendance (event_id);
create index on public.event_attendance (member_id);
