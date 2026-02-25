
DECLARE
  v_existing  UUID;
  v_count     INTEGER;
  v_last_removal TIMESTAMPTZ;
  v_is_same_device BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT id INTO v_existing
  FROM device_bindings
  WHERE user_id = p_user_id AND hwid_hash = p_hwid;

  IF v_existing IS NOT NULL THEN
    UPDATE device_bindings
    SET last_seen_at = NOW(),
        device_label = COALESCE(p_label, device_label)
    WHERE id = v_existing;
    RETURN jsonb_build_object('bound', true, 'existing', true);
  END IF;

  SELECT removed_at INTO v_last_removal
  FROM device_removals
  WHERE user_id = p_user_id
  ORDER BY removed_at DESC
  LIMIT 1;

  IF v_last_removal IS NOT NULL AND v_last_removal > NOW() - INTERVAL '24 hours' THEN
    SELECT EXISTS (
      SELECT 1 FROM device_removals
      WHERE user_id = p_user_id AND removed_hwid = p_hwid
    ) INTO v_is_same_device;

    IF NOT v_is_same_device THEN
      RETURN jsonb_build_object(
        'bound', false,
        'reason', 'cooldown_active',
        'cooldown_ends', (v_last_removal + INTERVAL '24 hours')::text
      );
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM device_bindings
  WHERE user_id = p_user_id;

  IF v_count >= p_limit THEN
    RETURN jsonb_build_object(
      'bound', false,
      'reason', 'limit_reached',
      'count', v_count,
      'limit', p_limit
    );
  END IF;

  INSERT INTO device_bindings (user_id, hwid_hash, device_label)
  VALUES (p_user_id, p_hwid, p_label);

  RETURN jsonb_build_object('bound', true, 'existing', false);
END;
