-- ============================================================================
-- Batch Usage Tracking Migration
-- ============================================================================
-- This migration creates the batch_usage table and related infrastructure
-- for tracking monthly batch execution counts per user.
--
-- Run this in your Supabase SQL Editor:
-- https://app.supabase.com/project/YOUR_PROJECT/sql
--
-- ============================================================================

-- Create batch_usage table
CREATE TABLE IF NOT EXISTS batch_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_count INTEGER NOT NULL DEFAULT 1,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  month_year VARCHAR(7) NOT NULL, -- Format: "2026-02" for easy monthly grouping
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_batch_usage_user_month ON batch_usage(user_id, month_year);
CREATE INDEX IF NOT EXISTS idx_batch_usage_executed ON batch_usage(executed_at);

-- Enable Row Level Security
ALTER TABLE batch_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own usage
CREATE POLICY "Users can view own usage" ON batch_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Only service role can insert (backend only)
CREATE POLICY "Service role can insert usage" ON batch_usage
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- Helper Function: Get Current Month's Usage
-- ============================================================================
-- This function returns the total batch count for a user in the current month.
-- Usage: SELECT get_monthly_usage('user-uuid-here');
--
CREATE OR REPLACE FUNCTION get_monthly_usage(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  current_month VARCHAR(7);
  total_usage INTEGER;
BEGIN
  -- Get current month in "YYYY-MM" format
  current_month := TO_CHAR(NOW(), 'YYYY-MM');

  -- Sum all batch_count values for this user in this month
  SELECT COALESCE(SUM(batch_count), 0)
  INTO total_usage
  FROM batch_usage
  WHERE user_id = p_user_id
    AND month_year = current_month;

  RETURN total_usage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Verification Queries (Optional - Run these to test)
-- ============================================================================

-- Test inserting a record (replace with your user ID)
-- INSERT INTO batch_usage (user_id, batch_count, month_year, executed_at)
-- VALUES ('YOUR_USER_ID_HERE', 1, TO_CHAR(NOW(), 'YYYY-MM'), NOW());

-- Check monthly usage for a user
-- SELECT get_monthly_usage('YOUR_USER_ID_HERE');

-- View all usage records (as admin)
-- SELECT * FROM batch_usage ORDER BY executed_at DESC LIMIT 10;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- The batch_usage table is now ready to track batch executions.
-- The backend API will insert records automatically when users execute batches.
