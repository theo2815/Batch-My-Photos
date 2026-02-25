
DECLARE
  v_active_count INTEGER;
  v_oldest_id    UUID;
  v_oldest_hwid  TEXT;
BEGIN
  UPDATE device_bindings
  SET last_seen_at = NOW()
  WHERE user_id = p_user_id AND hwid_hash = p_hwid;

  SELECT COUNT(*) INTO v_active_count
  FROM device_bindings
  WHERE user_id = p_user_id
    AND last_seen_at > NOW() - INTERVAL '10 minutes';

  IF v_active_count <= p_limit THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT id, hwid_hash INTO v_oldest_id, v_oldest_hwid
  FROM device_bindings
  WHERE user_id = p_user_id
    AND hwid_hash != p_hwid
    AND last_seen_at > NOW() - INTERVAL '10 minutes'
  ORDER BY last_seen_at ASC
  LIMIT 1;

  IF v_oldest_id IS NOT NULL THEN
    DELETE FROM device_bindings WHERE id = v_oldest_id;
    RETURN jsonb_build_object(
      'ok', false,
      'invalidated', true,
      'removed_hwid', v_oldest_hwid
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
