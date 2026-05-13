-- ============================================================
-- Migration 13: Web push subscriptions
-- Stores PushSubscription objects from browsers/PWAs so the
-- backend can send notifications. Scoped per (church, user);
-- one row per unique endpoint URL.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_church_user
  ON public.push_subscriptions(church_id, user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A user can only see and manage their own subscriptions within
-- their own church.
DO $$ BEGIN
  CREATE POLICY "push_subscriptions: own rows only"
    ON public.push_subscriptions FOR ALL
    USING (church_id = public.auth_church_id() AND user_id = auth.uid())
    WITH CHECK (church_id = public.auth_church_id() AND user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
