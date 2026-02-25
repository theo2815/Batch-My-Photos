create or replace function get_user_emails(user_ids uuid[])
returns table(id uuid, email varchar)
security definer -- Elevates privileges to allow querying auth.users
set search_path = public
as $$
begin
  return query
  select u.id, u.email::varchar
  from auth.users u
  where u.id = any(user_ids);
end;
$$ language plpgsql;

-- CRITICAL SECURITY: Revoke access from public/anon/authenticated
revoke execute on function get_user_emails(uuid[]) from public;
revoke execute on function get_user_emails(uuid[]) from anon;
revoke execute on function get_user_emails(uuid[]) from authenticated;

-- Only allow the backend (service_role) to execute it
grant execute on function get_user_emails(uuid[]) to service_role;
