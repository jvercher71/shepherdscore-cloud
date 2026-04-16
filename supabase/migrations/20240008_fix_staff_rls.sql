-- ============================================================
-- Migration 8: Fix church_staff RLS — restrict INSERT/UPDATE to admins
-- Prevents users from self-promoting to Admin role
-- ============================================================

-- Drop the overly permissive FOR ALL policy
DROP POLICY IF EXISTS "church_staff: church members only" ON public.church_staff;

-- Admins can do everything
CREATE POLICY "church_staff: admins full access"
  ON public.church_staff FOR ALL
  USING (
    church_id = public.auth_church_id()
    AND EXISTS (
      SELECT 1 FROM public.church_staff cs
      WHERE cs.church_id = public.auth_church_id()
        AND cs.user_id = (auth.jwt() ->> 'sub')::uuid
        AND cs.role = 'Admin'
    )
  )
  WITH CHECK (
    church_id = public.auth_church_id()
    AND EXISTS (
      SELECT 1 FROM public.church_staff cs
      WHERE cs.church_id = public.auth_church_id()
        AND cs.user_id = (auth.jwt() ->> 'sub')::uuid
        AND cs.role = 'Admin'
    )
  );

-- All church staff can read the staff list (needed for UI)
CREATE POLICY "church_staff: members can view"
  ON public.church_staff FOR SELECT
  USING (church_id = public.auth_church_id());

-- Allow the setup-owner endpoint to self-insert when no staff exist yet
CREATE POLICY "church_staff: first user self-register"
  ON public.church_staff FOR INSERT
  WITH CHECK (
    church_id = public.auth_church_id()
    AND user_id = (auth.jwt() ->> 'sub')::uuid
    AND NOT EXISTS (
      SELECT 1 FROM public.church_staff cs
      WHERE cs.church_id = public.auth_church_id()
    )
  );
