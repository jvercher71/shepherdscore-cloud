-- ============================================================
-- Migration 6: Church logo, password reset support
-- ============================================================

-- Add logo_url to churches
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '';
