-- Finds a paid receipt for the caller's booking, following earlier class moves.
create function public.my_booking_receipt_id(p_booking_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id
  from public.bookings b
  join public.payments p on p.booking_id in (select public.booking_family(b.id))
  where b.id = p_booking_id and b.user_id = auth.uid() and p.status = 'paid'
  order by p.paid_at desc nulls last, p.id
  limit 1;
$$;

revoke execute on function public.my_booking_receipt_id(uuid) from public, anon, authenticated;
grant execute on function public.my_booking_receipt_id(uuid) to authenticated;
