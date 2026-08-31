-- ============================================================================
-- Referral Coupons System
-- Created: 2026-02-22
-- ============================================================================

-- Referral coupons table (admin-created, database-backed)
CREATE TABLE IF NOT EXISTS referral_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  referrer_name TEXT NOT NULL,
  discounted_price_centavos INTEGER NOT NULL DEFAULT 12900,
  description TEXT NOT NULL DEFAULT 'Referral Discount',
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tracks which user used which referral coupon
CREATE TABLE IF NOT EXISTS referral_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES referral_coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  coupon_code TEXT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coupon_id, user_id)
);

-- Index for fast coupon lookups by code
CREATE INDEX IF NOT EXISTS idx_referral_coupons_code ON referral_coupons(code);
CREATE INDEX IF NOT EXISTS idx_referral_usage_coupon_id ON referral_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_referral_usage_user_id ON referral_usage(user_id);

-- RLS
ALTER TABLE referral_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_usage ENABLE ROW LEVEL SECURITY;

-- Service role gets full access (for backend admin operations)
CREATE POLICY "Service role full access on referral_coupons"
  ON referral_coupons FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access on referral_usage"
  ON referral_usage FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
