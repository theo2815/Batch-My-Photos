
DECLARE
  current_month VARCHAR(7);
  total_usage INTEGER;
BEGIN
  current_month := TO_CHAR(NOW(), 'YYYY-MM');
  SELECT COALESCE(SUM(batch_count), 0)
  INTO total_usage
  FROM batch_usage
  WHERE user_id = p_user_id
    AND month_year = current_month;
  RETURN total_usage;
END;
