-- ============================================================
-- Migration 9: Stripe billing — rename paddle to stripe customer ID
-- ============================================================

-- Add stripe_customer_id if it doesn't exist
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- If paddle_customer_id exists, migrate data (will be empty, just cleanup)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='churches' AND column_name='paddle_customer_id') THEN
    UPDATE public.churches SET stripe_customer_id = paddle_customer_id WHERE paddle_customer_id IS NOT NULL AND stripe_customer_id IS NULL;
    ALTER TABLE public.churches DROP COLUMN paddle_customer_id;
  END IF;
END $$;
