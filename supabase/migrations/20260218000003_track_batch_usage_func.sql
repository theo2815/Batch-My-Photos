-- Create a function to atomically check and track batch usage
-- usage: select track_batch_usage('user_uuid', '2023-10', 1, 2); -- for limit 2
-- usage: select track_batch_usage('user_uuid', '2023-10', 1, null); -- for unlimited

create or replace function track_batch_usage(
  p_user_id uuid,
  p_month_year text,
  p_count int,
  p_limit int
) returns jsonb as $$
declare
  v_current_usage int;
  v_new_usage int;
begin
  -- ACQUIRE LOCK: Prevent concurrent checks for the same user+month.
  -- This ensures that between reading the sum and inserting, no other transaction
  -- can sneak in an insert for this user/month.
  -- 214... is an arbitrary salt to avoid collisions with other advisory locks
  perform pg_advisory_xact_lock(hashtext('track_batch_usage' || p_user_id::text || p_month_year));

  -- Get current usage
  select coalesce(sum(batch_count), 0) into v_current_usage
  from batch_usage
  where user_id = p_user_id and month_year = p_month_year;

  v_new_usage := v_current_usage + p_count;

  -- Check limit (if passed)
  if p_limit is not null and v_new_usage > p_limit then
    return jsonb_build_object(
      'success', false,
      'error', 'Monthly batch limit exceeded',
      'used', v_current_usage,
      'limit', p_limit,
      'remaining', 0
    );
  end if;

  -- Insert usage
  insert into batch_usage (user_id, month_year, batch_count, executed_at)
  values (p_user_id, p_month_year, p_count, now());

  return jsonb_build_object(
    'success', true,
    'used', v_new_usage,
    'limit', p_limit,
    'remaining', case when p_limit is null then null else p_limit - v_new_usage end
  );
end;
$$ language plpgsql security definer;
