
DECLARE
  v_period_start TIMESTAMPTZ;
  v_used INTEGER;
BEGIN
  IF p_reset_at IS NULL OR p_reset_at <= NOW() THEN
    RETURN jsonb_build_object('allowed', true, 'used', 0, 'limit', p_removals_limit);
  END IF;

  v_period_start := p_reset_at - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_used
  FROM device_removals
  WHERE user_id = p_user_id
    AND removed_at >= v_period_start;

  IF v_used >= p_removals_limit THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', p_removals_limit);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'used', v_used, 'limit', p_removals_limit);
END;
