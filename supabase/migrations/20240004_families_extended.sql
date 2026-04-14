-- ============================================================
-- Extend families table: rename name→family_name, add contact fields
-- ============================================================

-- Rename the existing 'name' column to 'family_name' for clarity
alter table public.families rename column name to family_name;

-- Add extended contact/detail columns
alter table public.families
  add column if not exists address text not null default '',
  add column if not exists phone   text not null default '',
  add column if not exists email   text not null default '',
  add column if not exists notes   text not null default '';
