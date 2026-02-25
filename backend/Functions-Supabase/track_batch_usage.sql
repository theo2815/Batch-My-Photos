
DECLARE
  v_current_usage int;
  v_new_usage int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('track_batch_usage' || p_user_id::text || p_month_year));

  SELECT COALESCE(SUM(batch_count), 0) INTO v_current_usage
  FROM batch_usage
  WHERE user_id = p_user_id AND month_year = p_month_year;

  v_new_usage := v_current_usage + p_count;

  IF p_limit IS NOT NULL AND v_new_usage > p_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly batch limit exceeded',
      'used', v_current_usage,
      'limit', p_limit,
      'remaining', 0
    );
  END IF;

  INSERT INTO batch_usage (user_id, month_year, batch_count, executed_at)
  VALUES (p_user_id, p_month_year, p_count, NOW());

  RETURN jsonb_build_object(
    'success', true,
    'used', v_new_usage,
    'limit', p_limit,
    'remaining', CASE WHEN p_limit IS NULL THEN NULL ELSE p_limit - v_new_usage END
  );
END;
