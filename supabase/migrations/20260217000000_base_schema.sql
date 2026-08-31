-- ============================================================================
-- Baseline: reconstructed base tables (subscriptions, transactions, batch_usage)
-- Date added: 2026-08-31 (dated 2026-02-17 so it sorts before the legacy
--             migrations copied from backend/migrations/)
-- ============================================================================
-- These three tables predate the checked-in migrations — their original DDL
-- (001_batch_usage_tracking.sql and earlier) was never committed. This file
-- RECONSTRUCTS them from how the code uses them so that `supabase db reset`
-- can replay the full schema locally.
--
-- PRODUCTION IS AUTHORITATIVE for these tables. Everything here is
-- IF NOT EXISTS, and on the linked prod project this migration (and the
-- legacy ones after it) must be marked as already applied:
--   npx supabase migration repair --status applied <version...>
-- Only 20260831* migrations are actually new for prod.
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan                 TEXT NOT NULL DEFAULT 'free',
  status               TEXT NOT NULL DEFAULT 'active',
  amount               INTEGER,
  currency             TEXT,
  paid_at              TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  paymongo_checkout_id TEXT,
  paymongo_payment_id  TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount               INTEGER NOT NULL,
  currency             TEXT,
  status               TEXT,
  description          TEXT,
  paymongo_checkout_id TEXT,
  coupon_code          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON transactions(user_id, created_at DESC);

-- Append-only: one row per tracked batch operation (see track_batch_usage).
CREATE TABLE IF NOT EXISTS batch_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_year  VARCHAR(7) NOT NULL, -- 'YYYY-MM' (UTC)
  batch_count INTEGER NOT NULL DEFAULT 1,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_usage_user_month
  ON batch_usage(user_id, month_year);
