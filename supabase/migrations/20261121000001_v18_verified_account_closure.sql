-- Stage 1: add the verified server entry point before deploying the updated app.
-- Runs the existing closure checks for the authenticated user verified by the server.
create function public.close_my_account_verified(p_user_id uuid)
returns table (has_bookings boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
begin
  if p_user_id is null then
    raise exception 'An account is required.' using errcode = '42501';
  end if;

  -- Existing closure and blocker functions use auth.uid() for all lookups.
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  return query select result.has_bookings from public.close_my_account() result;
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
end;
$$;

revoke execute on function public.close_my_account_verified(uuid) from public, anon, authenticated;
grant execute on function public.close_my_account_verified(uuid) to service_role;
