-- =============================================================================
-- Migration 27: Version 1.7 (Prompt D), Appointments logic.
--
-- What this file does:
--   1. admin_search_bookings() (the admin Appointments list):
--        - "All" (no status filter) now shows EVERY status, including
--          ended unpaid holds ('expired'); before, those were hidden
--        - a re-scheduled booking's OLD row ('transferred') is never listed,
--          so only the new booking shows (no duplicates, no "Re-scheduled"
--          status in the list). The old row stays in the database.
--        - "All dates": today and later first, then past classes
--      Same parameters and columns as migration 22, so the website calls it
--      the same way.
--   2. New bell updates (notification_kind) for a cancel BY THE CAFE:
--        cafe_cancelled_free_code   cancelled, 100% code for one class
--        cafe_cancelled_half_code   cancelled, 50% code (normal policy)
--        cafe_cancelled_no_credit   cancelled, no credit (normal policy)
--        cafe_cancelled_refunded    cancelled, refunded outside the website
--   3. booking_admin_actions accepts two new actions: 'cancel_free_code'
--      (a 100% code) and 'cancel_refunded' (refunded outside the website).
--   4. notify_booking_change() (migration 12) gets a "skip" switch, used
--      only by admin_cancel_appointment() so the client gets ONE update.
--   5. admin_cancel_appointment(booking, choice, reason): the admin cancels
--      ONE appointment with one of 3 choices and a REQUIRED reason:
--        'free'      cancel + a personal 100% code (class fee, one use, 60 days)
--        'policy'    the same rules as when the client cancels:
--                      more than 24 hours before (or the cafe cancelled the
--                      class, or a late payment): 100% code (the client could
--                      have moved for free)
--                      12 to 24 hours: 50% code
--                      under 12 hours / started / free-move time over: no credit
--        'refunded'  cancel, no code, and every PAID payment of the booking
--                    (and the bookings it was moved from) becomes 'refunded',
--                    so Earnings stops counting it
--      In all 3 the seat is freed (the booking leaves the seat-holding
--      statuses) and the client gets one bell update (walk-ins have none);
--      the website emails them. Logged in booking_admin_actions.
--   6. get_my_cafe_cancellations(): the caller's own bookings the cafe
--      cancelled, with the outcome and code, for My Bookings.
--
-- Where it's used: the admin Appointments list and manage page, My Bookings.
-- Tests: supabase/tests/29-v17-appointments.test.mjs.
-- =============================================================================


-- =============================================================================
-- 1. APPOINTMENTS LIST: admin_search_bookings()
-- =============================================================================

-- The admin Appointments list, with filters, search and pages.
-- Takes (all optional): p_search, p_statuses (empty = ALL statuses since
-- Version 1.7), p_date, p_start_time, p_when ('upcoming' default, 'past' or
-- 'all'), p_limit, p_offset. See migration 22 for the details.
-- Gives back: one row per booking (never a 'transferred' one), plus
-- attendance_due and total_matches.
create or replace function public.admin_search_bookings(
  p_search     text    default null,
  p_statuses   text[]  default null,
  p_date       date    default null,
  p_start_time time    default null,
  p_when       text    default 'upcoming',
  p_limit      integer default 200,
  p_offset     integer default 0
)
returns table (
  booking_id        uuid,
  status            public.booking_status,
  created_at        timestamptz,
  session_id        uuid,
  class_date        date,
  start_time        time,
  end_time          time,
  session_status    public.session_status,
  guest_name        text,
  guest_email       text,
  guest_contact     text,
  is_walkin         boolean,
  moved_here        boolean,
  first_time        boolean,
  has_health_notes  boolean,
  drink_choice      text,
  mat_rental        boolean,
  total             numeric,
  paid_amount       numeric,
  paid_method       public.payment_method,
  paid_provider     public.payment_provider,
  hold_seconds_left integer,
  attendance_due    boolean,
  total_matches     integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_search   text   := nullif(btrim(p_search), '');
  v_statuses text[] := nullif(p_statuses, '{}');
  v_when     text   := coalesce(nullif(btrim(p_when), ''), 'upcoming');
  v_limit    integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_offset   integer := greatest(coalesce(p_offset, 0), 0);
  v_like     text;
  v_digits   text;
  v_code     text;
begin
  perform public.require_admin();

  if v_when not in ('upcoming', 'past', 'all') then
    raise exception 'Please choose upcoming, past or all.';
  end if;

  -- Every status asked for must be a real booking status, or the extra word
  -- 'pending_attendance' (NEW)
  if exists (
    select 1 from unnest(v_statuses) x(s)
    where x.s not in (select unnest(enum_range(null::public.booking_status))::text)
      and x.s <> 'pending_attendance'
  ) then
    raise exception 'Unknown booking status in the filter.';
  end if;

  if v_search is not null then
    -- "contains" pattern for ILIKE. % and _ have a special meaning in LIKE,
    -- so a typed % or _ is escaped (\% \_) to mean the character itself.
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- Just the digits, for phone numbers (10+ digits: compare the last 10)
    v_digits := regexp_replace(v_search, '\D', '', 'g');
    if length(v_digits) >= 10 then
      v_digits := right(v_digits, 10);
    end if;
    -- A booking code: drop an optional "B69-" in front, keep only 0-9 a-f
    v_code := lower(regexp_replace(regexp_replace(v_search, '^B69-?', '', 'i'), '[^0-9a-fA-F]', '', 'g'));
    -- Typed "B69-..." = clearly a booking code, so don't ALSO treat its
    -- digits as part of a phone number
    if v_search ~* '^B69-' then
      v_digits := '';
    end if;
  end if;

  return query
  select
    r.id,
    r.shown_status,
    r.created_at,
    r.session_id,
    r.date,
    r.start_time,
    r.end_time,
    r.session_status,
    r.guest_name,
    r.guest_email,
    r.guest_contact,
    r.is_walkin,
    r.moved_here,
    r.first_time,
    r.has_health_notes,
    r.drink_choice,
    r.mat_rental,
    r.total,
    pay.amount,
    pay.method,
    pay.provider,
    r.hold_seconds_left,
    r.attendance_due,
    r.total_matches
  from (
    select
      b.id,
      b.created_at,
      b.session_id,
      s.date,
      s.start_time,
      s.end_time,
      s.status as session_status,
      coalesce(b.walkin_name, nullif(btrim(p.full_name), ''), p.email, 'Guest') as guest_name,
      p.email as guest_email,
      coalesce(b.walkin_contact, p.mobile) as guest_contact,
      b.user_id is null as is_walkin,
      b.transferred_from is not null as moved_here,
      b.first_time,
      nullif(btrim(b.health_notes), '') is not null as has_health_notes,
      b.drink_choice,
      b.mat_rental,
      b.total,
      e.shown_status,
      e.attendance_due,
      -- Seconds left on a live unpaid hold, rounded up (0 otherwise)
      case
        when e.shown_status = 'pending_payment'
          then ceil(extract(epoch from b.hold_expires_at - now()))::integer
        else 0
      end as hold_seconds_left,
      -- How many rows matched in total (counted BEFORE the offset and limit)
      (count(*) over ())::integer as total_matches
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    left join public.profiles p on p.id = b.user_id
    -- What the admin should see: an ended unpaid hold counts as expired
    cross join lateral (
      select case
        when b.status = 'pending_payment' and b.hold_expires_at <= now() then 'expired'::public.booking_status
        else b.status
      end as shown_status
    ) st
    -- NEW: still 'confirmed' after a class that has ended (and wasn't
    -- cancelled) = attendance still to check. The word the status filter
    -- uses for the row: 'pending_attendance' for those, else its status.
    cross join lateral (
      select
        st.shown_status,
        (st.shown_status = 'confirmed' and s.status <> 'cancelled'
          and public.at_manila(s.date, s.end_time) <= now()) as attendance_due
    ) e
    cross join lateral (
      select case when e.attendance_due then 'pending_attendance' else e.shown_status::text end as word
    ) f
    where
      -- Version 1.7: a re-scheduled booking's OLD row ('transferred') is never
      -- listed: only the new booking shows, with its real status. (The old
      -- row stays in the database and in the new booking's History.)
      b.status <> 'transferred'
      -- Status filter. Version 1.7: no filter ("All") = EVERY status,
      -- including ended unpaid holds ('expired'); before, those were hidden.
      and (case
        when v_statuses is null then true
        else f.word = any(v_statuses)
      end)
      -- Date filter
      and (case
        when p_date is not null then s.date = p_date
        when v_when = 'upcoming' then s.date >= public.manila_today()
        when v_when = 'past' then s.date < public.manila_today()
        else true
      end)
      -- Class time filter
      and (p_start_time is null or s.start_time = p_start_time)
      -- Search
      and (
        v_search is null
        or coalesce(p.full_name, '') ilike v_like
        or coalesce(p.email, '') ilike v_like
        or coalesce(b.walkin_name, '') ilike v_like
        or (length(v_digits) >= 4 and (
              regexp_replace(coalesce(p.mobile, ''), '\D', '', 'g') like '%' || v_digits || '%'
              or regexp_replace(coalesce(b.walkin_contact, ''), '\D', '', 'g') like '%' || v_digits || '%'))
        or (length(v_code) >= 4 and b.id::text like v_code || '%')
      )
    -- Upcoming: soonest class first. Past: most recent class first.
    -- Version 1.7, all dates: today and later first (soonest first), THEN
    -- past classes (most recent first).
    -- (b.id last, so pages never swap rows that tie.)
    order by
      case when v_when = 'all' and p_date is null then s.date < public.manila_today() end,
      case when p_date is null and (v_when = 'past' or (v_when = 'all' and s.date < public.manila_today())) then s.date end desc,
      case when p_date is null and (v_when = 'past' or (v_when = 'all' and s.date < public.manila_today())) then s.start_time end desc,
      s.date,
      s.start_time,
      b.created_at,
      b.id
    offset v_offset
    limit v_limit
  ) r
  -- The latest paid payment for this booking or the ones it came from
  left join lateral (
    select x.amount, x.method, x.provider
    from public.payments x
    where x.booking_id in (select public.booking_family(r.id))
      and x.status = 'paid'
    order by x.paid_at desc
    limit 1
  ) pay on true
  -- (the same order again, after the payment is joined)
  order by
    case when v_when = 'all' and p_date is null then r.date < public.manila_today() end,
    case when p_date is null and (v_when = 'past' or (v_when = 'all' and r.date < public.manila_today())) then r.date end desc,
    case when p_date is null and (v_when = 'past' or (v_when = 'all' and r.date < public.manila_today())) then r.start_time end desc,
    r.date,
    r.start_time,
    r.created_at,
    r.id;
end;
$$;


-- =============================================================================
-- 2. NEW BELL UPDATES for a cancel by the cafe
-- =============================================================================
-- (The website turns each one into a sentence: src/lib/notifications.ts.)
alter type public.notification_kind add value if not exists 'cafe_cancelled_free_code';
alter type public.notification_kind add value if not exists 'cafe_cancelled_half_code';
alter type public.notification_kind add value if not exists 'cafe_cancelled_no_credit';
alter type public.notification_kind add value if not exists 'cafe_cancelled_refunded';


-- =============================================================================
-- 3. booking_admin_actions: two new actions
-- =============================================================================
-- The list of allowed actions is a check constraint, so it is swapped for
-- one with the two new words. Old rows use the older words, so they pass.
alter table public.booking_admin_actions
  drop constraint booking_admin_actions_action_check;

alter table public.booking_admin_actions
  add constraint booking_admin_actions_action_check
  check (action in ('transfer', 'cancel_voucher', 'cancel_no_credit', 'reschedule', 'reject_payment',
                    'cancel_free_code', 'cancel_refunded'));

comment on table public.booking_admin_actions is
  'Admin cancels (100% code, 50% code, no credit, refunded) / transfers / re-schedules / payment rejections of one booking, with the normal rule, override flag and reason. Admins only.';


-- =============================================================================
-- 4. notify_booking_change(): the same as migration 12, plus a skip switch
-- =============================================================================

-- Adds a bell update when a client's booking changes status.
-- Takes: the new (and old) bookings row. Gives back: nothing (after trigger).
-- Version 1.7: does nothing while the transaction-only setting
-- block69.skip_booking_notify is 'on' (admin_cancel_appointment adds its
-- own update instead).
create or replace function public.notify_booking_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old  public.booking_status;          -- the status before (null for a new booking)
  v_kind public.notification_kind;       -- which update to add (null = none)
  v_code text;                           -- the 50% code, for a cancellation
begin
  -- Version 1.7: admin_cancel_appointment() adds its OWN, clearer update
  -- ("cancelled by the cafe") and turns this switch on for its one status
  -- change, so the client never gets two updates for one cancel.
  if coalesce(current_setting('block69.skip_booking_notify', true), '') = 'on' then
    return null;
  end if;

  -- Walk-ins without an account: nobody to tell
  if new.user_id is null then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    -- The status didn't change (e.g. only the drink was edited): nothing to say
    if new.status = old.status then
      return null;
    end if;
    v_old := old.status;
  end if;

  v_kind := case
    when new.status = 'confirmed' and v_old is null and new.transferred_from is not null
      then 'booking_transferred'
    when new.status = 'confirmed' and v_old = 'awaiting_verification'
      then 'payment_approved'
    when new.status = 'confirmed'
      then 'booking_confirmed'
    when new.status = 'awaiting_verification'
      then 'payment_checking'
    when new.status = 'expired' and v_old = 'awaiting_verification'
      then 'payment_rejected'
    when new.status = 'paid_needs_action'
      then 'payment_needs_action'
    when new.status = 'cancelled_with_voucher'
      then 'cancelled_with_voucher'
    when new.status = 'forfeited'
      then 'booking_forfeited'
    else null
  end::public.notification_kind;

  if v_kind is null then
    return null;
  end if;

  -- The 50% code: every cancel function makes the voucher just BEFORE it
  -- changes the booking, in the same transaction. now() is the start time of
  -- the transaction, so "made at now()" finds exactly that code.
  if v_kind = 'cancelled_with_voucher' then
    select v.code into v_code
    from public.vouchers v
    where v.owner_id = new.user_id
      and v.source = 'cancellation'
      and v.created_at = now()
    order by v.created_at desc
    limit 1;
  end if;

  insert into public.notifications (user_id, booking_id, kind, voucher_code)
  values (new.user_id, new.id, v_kind, v_code);
  return null;
end;
$$;


-- =============================================================================
-- 5. admin_cancel_appointment(booking_id, choice, reason)
-- =============================================================================

-- The admin cancels ONE appointment (confirmed, or a late payment).
-- Takes:
--   p_booking_id  the booking
--   p_choice      'free' (recommended), 'policy' or 'refunded' (see the top
--                 of this file)
--   p_reason      why (REQUIRED, up to 500 characters). Saved in
--                 booking_admin_actions, where only admins can read it.
-- Gives back: the new status, the outcome ('free_code', 'half_code',
-- 'no_credit' or 'refunded'), the code and its expiry (empty without a
-- code), and how many pesos were marked refunded.
-- Walk-ins have no account, so they can't get a code: for them only
-- 'refunded' (or a 'policy' cancel that gives no credit) works.
-- security definer: it changes bookings, payments, vouchers and
-- notifications; require_admin() checks the caller first.
create or replace function public.admin_cancel_appointment(
  p_booking_id uuid,
  p_choice     text,
  p_reason     text
)
returns table (
  new_status         public.booking_status,
  outcome            text,
  voucher_code       text,
  voucher_expires_at timestamptz,
  refunded_amount    numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_admin_id   uuid := public.require_admin();
  v_reason     text := nullif(btrim(p_reason), '');
  v_booking    public.bookings%rowtype;
  v_session    public.class_sessions%rowtype;
  v_rule       text;          -- what the cancellation rules say right now
  v_outcome    text;          -- free_code / half_code / no_credit / refunded
  v_percent    integer;       -- 100 or 50 for a code
  v_status     public.booking_status;
  v_code       text;
  v_voucher_id uuid;
  v_expires_at timestamptz;
  v_refunded   numeric := 0;
begin
  -- The form's first checks, again here (the database is the last word)
  if p_choice is null or p_choice not in ('free', 'policy', 'refunded') then
    raise exception 'Please choose how to cancel: free re-schedule, normal policy, or refunded outside the website.';
  end if;
  if v_reason is null then
    raise exception 'Please write a reason for cancelling.';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Please keep the reason to 500 characters or less.';
  end if;

  -- Lock the booking, so the client (or another admin) can't cancel or move
  -- it at the same moment
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;
  if v_booking.status not in ('confirmed', 'paid_needs_action') then
    raise exception 'Only confirmed bookings and late payments can be cancelled here. (For a payment that is still being checked, confirm or reject it first.)';
  end if;

  select s.* into v_session from public.class_sessions s where s.id = v_booking.session_id;
  v_rule := public.admin_change_rule(v_booking.status, v_session.date, v_session.start_time,
                                     v_session.status, v_booking.transferred_from);

  -- Which outcome the choice gives
  if p_choice = 'free' then
    v_outcome := 'free_code';
  elsif p_choice = 'refunded' then
    v_outcome := 'refunded';
  else
    -- 'policy': the client's own cancellation rules. More than 24 hours
    -- away (moved once or not), a class the cafe cancelled, or a late
    -- payment = the client could move for free, so a 100% code.
    v_outcome := case
      when v_rule in ('transfer', 'already_transferred', 'free_transfer', 'late_payment') then 'free_code'
      when v_rule = 'voucher' then 'half_code'
      else 'no_credit'   -- 'no_credit', 'started', 'move_window_ended'
    end;
  end if;

  if v_outcome in ('free_code', 'half_code') and v_booking.user_id is null then
    raise exception 'Walk-ins have no account, so they can''t get a code. Choose "Refunded outside the website" instead.';
  end if;

  if v_outcome in ('free_code', 'half_code') then
    -- A personal code for the CLASS FEE only (never the mat), one use, 60
    -- days, like the 50% codes. FREE-xxxxxx = 100%, HALF-xxxxxx = 50%.
    -- If the random code exists already (very unlikely), try another one.
    v_percent := case when v_outcome = 'free_code' then 100 else 50 end;
    loop
      v_code := case when v_percent = 100 then 'FREE-' else 'HALF-' end
                || upper(substr(md5(gen_random_uuid()::text), 1, 6));
      begin
        insert into public.vouchers (code, percent_off, owner_id, source, uses_left, expires_at)
        values (v_code, v_percent, v_booking.user_id, 'cancellation', 1, now() + interval '60 days')
        returning id, expires_at into v_voucher_id, v_expires_at;
        exit;  -- saved, leave the loop
      exception when unique_violation then
        -- that code is taken: loop and try a new one
      end;
    end loop;
    v_status := 'cancelled_with_voucher';
  else
    v_status := 'forfeited';
  end if;

  -- Refunded outside the website: every PAID payment of this booking (and
  -- of the bookings it was moved from: payments stay on the original)
  -- becomes 'refunded'. Earnings and the totals count only 'paid'.
  if v_outcome = 'refunded' then
    with marked as (
      update public.payments p
      set status = 'refunded'
      where p.booking_id in (select public.booking_family(v_booking.id))
        and p.status = 'paid'
      returning p.amount
    )
    select coalesce(sum(m.amount), 0) into v_refunded from marked m;
  end if;

  -- Free the seat. The automatic bell update is switched off for this one
  -- change (only inside this transaction); our own update is added below.
  perform set_config('block69.skip_booking_notify', 'on', true);
  update public.bookings b set status = v_status where b.id = v_booking.id;
  perform set_config('block69.skip_booking_notify', 'off', true);

  -- One clear bell update for the client (walk-ins have no account)
  if v_booking.user_id is not null then
    insert into public.notifications (user_id, booking_id, kind, voucher_code)
    values (v_booking.user_id, v_booking.id, ('cafe_cancelled_' || v_outcome)::public.notification_kind, v_code);
  end if;

  -- The admin log. 'policy' is the normal rule; 'free' and 'refunded' are
  -- overrides (they always have a reason anyway).
  insert into public.booking_admin_actions (booking_id, action, normal_rule, overridden, note, voucher_id, admin_id)
  values (
    v_booking.id,
    case v_outcome
      when 'free_code' then 'cancel_free_code'
      when 'half_code' then 'cancel_voucher'
      when 'no_credit' then 'cancel_no_credit'
      else 'cancel_refunded'
    end,
    v_rule,
    p_choice <> 'policy',
    v_reason,
    v_voucher_id,
    v_admin_id
  );

  return query select v_status, v_outcome, v_code, v_expires_at, v_refunded;
end;
$$;


-- =============================================================================
-- 6. get_my_cafe_cancellations()
-- =============================================================================

-- The caller's OWN bookings that the cafe (an admin) cancelled, for My
-- Bookings ("Cancelled by the cafe" + what they got).
-- Takes: nothing (uses the logged-in user).
-- Gives back: one row per booking: booking_id, outcome ('free_code',
-- 'half_code', 'no_credit' or 'refunded') and the code (if any). The
-- admin's reason is NOT included (admins only).
-- security definer: clients can't read booking_admin_actions themselves.
create or replace function public.get_my_cafe_cancellations()
returns table (
  booking_id   uuid,
  outcome      text,
  voucher_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  -- The newest admin cancel of each of the caller's cancelled bookings
  select distinct on (a.booking_id)
    a.booking_id,
    case a.action
      when 'cancel_free_code' then 'free_code'
      when 'cancel_voucher' then 'half_code'
      when 'cancel_no_credit' then 'no_credit'
      else 'refunded'
    end,
    v.code
  from public.booking_admin_actions a
  join public.bookings b on b.id = a.booking_id
  left join public.vouchers v on v.id = a.voucher_id
  where b.user_id = auth.uid()
    and b.status in ('cancelled_with_voucher', 'forfeited')
    and a.action in ('cancel_free_code', 'cancel_voucher', 'cancel_no_credit', 'cancel_refunded')
  order by a.booking_id, a.created_at desc;
$$;


-- =============================================================================
-- Who may call what
-- =============================================================================

-- Take every right away first (Supabase gives all roles every new function),
-- then let logged-in users call them (each checks who is calling inside).
revoke all on function
  public.admin_cancel_appointment(uuid, text, text),
  public.get_my_cafe_cancellations()
from public, anon, authenticated, service_role;
grant execute on function
  public.admin_cancel_appointment(uuid, text, text),
  public.get_my_cafe_cancellations()
to authenticated;

-- Short descriptions that show up in the Supabase dashboard.
comment on function public.admin_search_bookings(text, text[], date, time, text, integer, integer) is
  'Admin: Appointments list (all statuses incl. expired; re-scheduled old rows hidden) with filters, search and pages.';
comment on function public.admin_cancel_appointment(uuid, text, text) is
  'Admin: cancel one appointment (free 100% code, normal policy, or refunded outside the website) with a required reason.';
comment on function public.get_my_cafe_cancellations() is
  'The caller''s own bookings the cafe cancelled, with the outcome and code (no admin reason).';
