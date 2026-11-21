-- Stage 2: move into migrations only after the verified app is deployed and the old app is out of traffic.
revoke execute on function public.close_my_account() from public, anon, authenticated;
