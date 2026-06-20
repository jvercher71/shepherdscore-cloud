-- ============================================================
-- Migration 14: Member Portal Tables and Columns
-- ============================================================

-- Add directory_opt_in to public.members if it doesn't exist
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS directory_opt_in boolean NOT NULL DEFAULT false;

-- Create portal_codes table
CREATE TABLE IF NOT EXISTS public.portal_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code        text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Enable RLS on portal_codes
ALTER TABLE public.portal_codes ENABLE ROW LEVEL SECURITY;

-- Allow anonymous insertion of codes (so users can request a code)
CREATE POLICY "Allow public insert to portal_codes" 
  ON public.portal_codes FOR INSERT 
  WITH CHECK (true);

-- Allow public select of codes (needed to verify them)
CREATE POLICY "Allow public select of portal_codes" 
  ON public.portal_codes FOR SELECT 
  USING (true);

-- Allow public delete of codes (needed to clean up verified codes)
CREATE POLICY "Allow public delete of portal_codes" 
  ON public.portal_codes FOR DELETE 
  USING (true);
