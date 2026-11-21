-- Legacy evidence remains valid without a reference; new submissions require one.
alter table public.payments add column transaction_reference text;

drop function public.submit_manual_payment(uuid, public.payment_method, text);
create or replace function public.submit_manual_payment(
  p_booking_id      uuid,
  p_method          public.payment_method,
  p_screenshot_path text,
  p_transaction_reference text
)
returns public.booking_status
language plpgsql
volatile
security definer  -- clients can't write payments or bookings directly
set search_path = ''
as $$
declare
  v_user_id uuid := public.require_active_user();
  v_booking public.bookings%rowtype;
begin
  if coalesce(public.setting_text('manual_payment_enabled', 'false'), 'false') <> 'true' then
    raise exception 'Sorry, manual transfers are turned off right now. Please pay online.';
  end if;
  if p_method is null or p_method not in ('gcash', 'bpi') then
    raise exception 'Please pick GCash or BPI.';
  end if;

  -- Require a short reference without changing the original bank identifier.
  if p_transaction_reference is null or char_length(btrim(p_transaction_reference)) not between 1 and 100
     or p_transaction_reference ~ '[[:cntrl:]]' then
    raise exception 'Enter the transaction reference from your transfer receipt (1 to 100 characters).';
  end if;

  -- The screenshot: in the caller's own folder, no tricks with "..", and
  -- really uploaded to the private bucket
  if p_screenshot_path is null
     or char_length(p_screenshot_path) > 300
     or position('..' in p_screenshot_path) > 0
     or left(p_screenshot_path, 37) <> v_user_id::text || '/'
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'payment-screenshots' and o.name = p_screenshot_path
     )
  then
    raise exception 'Please upload a screenshot of your transfer first.';
  end if;

  -- LOCK the booking (the webhook or a second click waits here)
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;

  if not found or v_booking.user_id is distinct from v_user_id then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;
  if v_booking.status <> 'pending_payment' then
    raise exception 'This booking is no longer waiting for payment.';
  end if;
  if v_booking.hold_expires_at <= now() then
    raise exception 'Sorry, your seat hold has ended. Please book the class again.';
  end if;
  if v_booking.total <= 0 then
    raise exception 'This booking is free, so there is nothing to transfer.';
  end if;

  -- The PayMongo checkout (if one was opened) can't be used any more
  update public.payments p
    set status = 'expired'
    where p.booking_id = v_booking.id
      and p.provider = 'paymongo'
      and p.status = 'pending';

  insert into public.payments (booking_id, provider, method, amount, status, screenshot_path, transaction_reference)
  values (v_booking.id, 'manual', p_method, v_booking.total, 'pending', p_screenshot_path, btrim(p_transaction_reference));

  update public.bookings b set status = 'awaiting_verification' where b.id = v_booking.id;
  return 'awaiting_verification';
end;
$$;

revoke execute on function public.submit_manual_payment(uuid, public.payment_method, text, text) from public, anon, authenticated, service_role;
grant execute on function public.submit_manual_payment(uuid, public.payment_method, text, text) to authenticated;

-- Keep the existing atomic review transition and enforce the class-end cutoff.
create or replace function public.admin_review_manual_payment(p_payment_id uuid, p_approve boolean)
returns public.booking_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_id   uuid := public.require_admin();
  v_payment    public.payments%rowtype;
  v_booking    public.bookings%rowtype;
  v_new_status public.booking_status;
begin
  if p_approve is null then
    raise exception 'Please choose approve or reject.';
  end if;

  select p.* into v_payment
  from public.payments p
  where p.id = p_payment_id
  for update;

  if not found then
    raise exception 'Sorry, we couldn''t find that payment.';
  end if;
  if v_payment.provider <> 'manual' then
    raise exception 'Only manual transfer payments need to be reviewed.';
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'This payment was already reviewed.';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = v_payment.booking_id
  for update;

  if v_booking.status <> 'awaiting_verification' then
    raise exception 'This booking is not waiting for a payment check.';
  end if;

  -- Check the actual clock after locking both rows, including after waiting.
  if p_approve and exists (
    select 1 from public.class_sessions s where s.id = v_booking.session_id
      and public.at_manila(s.date, s.end_time) <= clock_timestamp()
  ) then
    raise exception 'This class has ended. Reconcile any received transfer outside approval.';
  end if;

  if p_approve then
    update public.payments p
      set status = 'paid', paid_at = now(), verified_by = v_admin_id
      where p.id = v_payment.id;
    v_new_status := 'confirmed';
  else
    update public.payments p
      set status = 'rejected', verified_by = v_admin_id
      where p.id = v_payment.id;
    v_new_status := 'expired';
  end if;

  update public.bookings b set status = v_new_status where b.id = v_booking.id;
  return v_new_status;
end;
$$;

-- Expose the reference together with evidence in the admin-only booking view.
create or replace function public.admin_get_booking(p_booking_id uuid)
returns table (
  booking_id            uuid,
  status                public.booking_status,
  shown_status          public.booking_status,
  created_at            timestamptz,
  updated_at            timestamptz,
  hold_expires_at       timestamptz,
  agreed_at             timestamptz,
  not_pregnant_confirmed boolean,
  first_time            boolean,
  health_notes          text,
  drink_choice          text,
  mat_rental            boolean,
  class_fee             numeric,
  mat_fee               numeric,
  discount              numeric,
  total                 numeric,
  voucher_code          text,
  voucher_source        public.voucher_source,
  session_id            uuid,
  class_date            date,
  start_time            time,
  end_time              time,
  session_status        public.session_status,
  capacity              integer,
  seats_left            integer,
  user_id               uuid,
  guest_name            text,
  guest_email           text,
  guest_contact         text,
  guest_instagram       text,
  is_walkin             boolean,
  account_active        boolean,
  moved_from_booking_id uuid,
  moved_from_date       date,
  moved_from_start_time time,
  moved_to_booking_id   uuid,
  moved_to_date         date,
  moved_to_start_time   time,
  can_mark_attendance   boolean,
  payments              jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.require_admin();

  return query
  select
    b.id,
    b.status,
    case
      when b.status = 'pending_payment' and b.hold_expires_at <= now() then 'expired'::public.booking_status
      else b.status
    end,
    b.created_at,
    b.updated_at,
    b.hold_expires_at,
    b.agreed_at,
    b.not_pregnant_confirmed,
    b.first_time,
    b.health_notes,
    b.drink_choice,
    b.mat_rental,
    b.class_fee,
    b.mat_fee,
    b.discount,
    b.total,
    v.code,
    v.source,
    s.id,
    s.date,
    s.start_time,
    s.end_time,
    s.status,
    s.capacity,
    greatest(0, s.capacity - public.seats_taken(s.id)),
    b.user_id,
    coalesce(b.walkin_name, nullif(btrim(p.full_name), ''), p.email, 'Guest'),
    p.email,
    coalesce(b.walkin_contact, p.mobile),
    p.instagram,
    b.user_id is null,
    p.is_active,
    from_b.id,
    from_s.date,
    from_s.start_time,
    to_b.id,
    to_s.date,
    to_s.start_time,
    -- Same checks as admin_set_attendance() (this migration): the right
    -- status, a class the cafe didn't cancel, on or after the class day,
    -- and a PAID payment in the booking's family
    (b.status in ('confirmed', 'attended', 'no_show')
       and s.status <> 'cancelled'
       and s.date <= public.manila_today()
       and public.booking_has_paid_payment(b.id)),
    -- Every payment in the booking's family, newest first, as a JSON list
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'booking_id', x.booking_id,
          'provider', x.provider,
          'method', x.method,
          'amount', x.amount,
          'status', x.status,
          'paymongo_ref', x.paymongo_ref,
          'has_screenshot', x.screenshot_path is not null,
          'transaction_reference', x.transaction_reference,
          'verified_by_name', coalesce(nullif(btrim(vp.full_name), ''), vp.email),
          'paid_at', x.paid_at,
          'created_at', x.created_at
        )
        order by coalesce(x.paid_at, x.created_at) desc
      )
      from public.payments x
      left join public.profiles vp on vp.id = x.verified_by
      where x.booking_id in (select public.booking_family(b.id))
    ), '[]'::jsonb)
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  left join public.profiles p on p.id = b.user_id
  left join public.vouchers v on v.id = b.voucher_id
  -- The class it was moved FROM (one step back)
  left join public.bookings from_b on from_b.id = b.transferred_from
  left join public.class_sessions from_s on from_s.id = from_b.session_id
  -- The class it was moved TO (one step forward)
  left join public.bookings to_b on to_b.transferred_from = b.id
  left join public.class_sessions to_s on to_s.id = to_b.session_id
  where b.id = p_booking_id;
end;
$$;

-- Expires only pending GCash/BPI transfers after the class ends in Manila.
-- Payment and proof remain available for reconciliation. PayMongo is untouched.
create function public.expire_ended_manual_transfers()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_payment record;
  v_expired integer := 0;
begin
  -- Take one payment lock at a time before checking its booking, as review does.
  for v_payment in
    select p.id, p.booking_id
    from public.payments p
    join public.bookings b on b.id = p.booking_id
    join public.class_sessions s on s.id = b.session_id
    where p.provider = 'manual' and p.method in ('gcash', 'bpi') and p.status = 'pending'
      and b.status = 'awaiting_verification' and public.at_manila(s.date, s.end_time) <= now()
    order by p.id
    for update of p skip locked
  loop
    update public.bookings set status = 'expired'
    where id = v_payment.booking_id and status = 'awaiting_verification';
    if found then
      update public.payments set status = 'expired' where id = v_payment.id;
      v_expired := v_expired + 1;
    end if;
  end loop;
  return v_expired;
end;
$$;

revoke execute on function public.expire_ended_manual_transfers() from public, anon, authenticated, service_role;
grant execute on function public.expire_ended_manual_transfers() to service_role;

-- Catch up existing ended transfers and schedule subsequent expirations.
select public.expire_ended_manual_transfers();
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule('block69-expire-manual-transfers', '* * * * *', 'select public.expire_ended_manual_transfers()');
  end if;
end;
$$;
