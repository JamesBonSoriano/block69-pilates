-- =============================================================================
-- Migration 9: admin daily work (Phase C, Step 11 part 1).
--
-- What this file does:
--   Adds five READ-ONLY functions for the admin pages. They never change
--   anything; the admin's actions still go through the functions from
--   migration 3 (admin_walkin_booking, admin_set_attendance,
--   admin_cancel_session).
--     admin_dashboard_summary()     Dashboard: the numbers at the top
--     admin_list_sessions(from, to) classes in a date range with seats taken
--     admin_class_rosters(ids)      who is booked in one or more classes
--                                   (Attendance list, Dashboard, Walk-in)
--     admin_search_bookings(...)    Bookings page: filters and search
--     admin_get_booking(id)         one booking's details and payments
--
-- Security:
--   Every function starts with require_admin() (migration 3), which stops
--   anyone who isn't an ACTIVE admin (is_admin(), migration 2). They are
--   "security definer" so they can use the private helpers (seats_taken,
--   booking_family, ...), and only logged-in users may call them at all
--   (grants at the bottom). A client, a guest or a deactivated admin gets
--   "Only admins can do this."
--
-- Why functions instead of reading the tables from the website:
--   Admins may read every table (RLS, migration 2), but "seats taken" and
--   "is this unpaid hold still alive?" must follow the SAME rule as
--   book_seat, so we reuse the database helpers instead of copying the rule
--   into the website. Search across names, emails, phones and booking codes
--   is also much simpler in one SQL query.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase
-- project. The website calls the functions from src/lib/data/admin.ts.
--
-- (No peso sign in this file on purpose: the test database on Windows can't
-- read it, even in a comment.)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- admin_dashboard_summary()
-- -----------------------------------------------------------------------------

-- The numbers at the top of the admin Dashboard.
-- Takes: nothing.
-- Gives back ONE row:
--   today                   today's date in the Philippines
--   today_classes           how many classes today (not counting cancelled ones)
--   today_capacity          their seats added together
--   today_taken             seats taken in them right now (same rule as seats_left)
--   awaiting_verification   manual transfers waiting for the admin to check
--   paid_needs_action       late payments: paid after the hold ended (Phase D)
--   live_holds              unpaid holds still counting (people paying right now)
--   to_mark                 confirmed bookings in classes that have STARTED in
--                           the last 30 days but aren't marked attended / no-show
--   to_mark_classes         how many classes those are
--   paid_this_week          pesos paid since Monday (Philippine time)
--   paid_this_month         pesos paid since the 1st of this month
--   mats_this_month         pesos of mat rental in this month's payments
--                           (all of it goes to the stray animals)
create or replace function public.admin_dashboard_summary()
returns table (
  today                 date,
  today_classes         integer,
  today_capacity        integer,
  today_taken           integer,
  awaiting_verification integer,
  paid_needs_action     integer,
  live_holds            integer,
  to_mark               integer,
  to_mark_classes       integer,
  paid_this_week        numeric,
  paid_this_month       numeric,
  mats_this_month       numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today       date := public.manila_today();
  -- Monday of this week and the 1st of this month, as exact moments (Manila midnight).
  -- (date_trunc('week') always gives the Monday.)
  v_week_start  timestamptz := public.at_manila(date_trunc('week', v_today)::date, '00:00');
  v_month_start timestamptz := public.at_manila(date_trunc('month', v_today)::date, '00:00');
begin
  perform public.require_admin();

  return query
  select
    v_today,
    -- Today's classes (cancelled ones don't count)
    t.classes,
    t.capacity,
    t.taken,
    -- Bookings that need the admin
    (select count(*)::integer from public.bookings b where b.status = 'awaiting_verification'),
    (select count(*)::integer from public.bookings b where b.status = 'paid_needs_action'),
    (select count(*)::integer from public.bookings b
       where b.status = 'pending_payment' and b.hold_expires_at > now()),
    -- Attendance still to mark (classes that have started, last 30 days)
    m.bookings,
    m.classes,
    -- Money actually received (only 'paid' payments; refunds and failures don't count)
    (select coalesce(sum(p.amount), 0) from public.payments p
       where p.status = 'paid' and p.paid_at >= v_week_start),
    (select coalesce(sum(p.amount), 0) from public.payments p
       where p.status = 'paid' and p.paid_at >= v_month_start),
    -- Mat rental inside this month's payments. A payment always sits on the
    -- ORIGINAL booking (transfers copy the booking, not the payment), so
    -- each mat is counted once.
    (select coalesce(sum(b.mat_fee), 0) from public.payments p
       join public.bookings b on b.id = p.booking_id
       where p.status = 'paid' and p.paid_at >= v_month_start)
  from
    (select count(*)::integer as classes,
            coalesce(sum(s.capacity), 0)::integer as capacity,
            coalesce(sum(public.seats_taken(s.id)), 0)::integer as taken
     from public.class_sessions s
     where s.date = v_today and s.status <> 'cancelled') t,
    (select count(*)::integer as bookings,
            count(distinct b.session_id)::integer as classes
     from public.bookings b
     join public.class_sessions s on s.id = b.session_id
     where b.status = 'confirmed'
       and s.status <> 'cancelled'                       -- those clients get a free transfer instead
       and s.date >= v_today - 30                        -- don't nag about very old classes
       and now() >= public.at_manila(s.date, s.start_time)) m;
end;
$$;


-- -----------------------------------------------------------------------------
-- admin_list_sessions(from_date, to_date)
-- -----------------------------------------------------------------------------

-- Lists the classes between two dates for the admin, INCLUDING past ones,
-- closed ones and cancelled ones (get_open_sessions only shows today onwards).
-- Used by: Dashboard (today's and the next classes), Attendance (the class
-- chips) and Walk-in (classes with a free seat).
-- Takes: a start date and an end date (Philippine dates). At most 92 days are
-- given back, so nobody asks for years of data by mistake.
-- Gives back: one row per class, earliest first, with:
--   seats_taken / seats_left  right now (seats_taken() from migration 3)
--   booking_closes_at         when ONLINE booking closes (walk-ins ignore it)
--   has_started / has_ended   compared with the clock right now
--   to_mark                   confirmed bookings still to mark attended /
--                             no-show (only once the class has started, and
--                             never for a class the cafe cancelled)
create or replace function public.admin_list_sessions(p_from_date date, p_to_date date)
returns table (
  session_id        uuid,
  date              date,
  start_time        time,
  end_time          time,
  capacity          integer,
  status            public.session_status,
  seats_taken       integer,
  seats_left        integer,
  booking_closes_at timestamptz,
  has_started       boolean,
  has_ended         boolean,
  to_mark           integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.require_admin();

  if p_from_date is null or p_to_date is null then
    raise exception 'Please pick a start date and an end date.';
  end if;
  if p_to_date < p_from_date then
    raise exception 'The end date must be on or after the start date.';
  end if;

  return query
  select
    s.id,
    s.date,
    s.start_time,
    s.end_time,
    s.capacity,
    s.status,
    x.taken,
    greatest(0, s.capacity - x.taken),
    public.booking_closes_at(s.date, s.start_time),
    now() >= public.at_manila(s.date, s.start_time),
    now() >= public.at_manila(s.date, s.end_time),
    -- Bookings still waiting for Attended / No-show
    case
      when s.status = 'cancelled' or now() < public.at_manila(s.date, s.start_time) then 0
      else (select count(*)::integer from public.bookings b
            where b.session_id = s.id and b.status = 'confirmed')
    end
  from public.class_sessions s
  -- Count the taken seats once per class
  cross join lateral (select public.seats_taken(s.id) as taken) x
  where s.date between p_from_date and least(p_to_date, p_from_date + 92)
  order by s.date, s.start_time;
end;
$$;


-- -----------------------------------------------------------------------------
-- admin_class_rosters(session_ids)
-- -----------------------------------------------------------------------------

-- Lists who is booked in one or more classes: the Attendance list (one
-- class), and the Dashboard class cards (a few classes in one call).
-- Left out: bookings that no longer have anything to do with the class
-- (expired or ended unpaid holds, transferred away, cancelled with voucher,
-- forfeited).
-- Takes: a list of class ids (at most 50).
-- Gives back: one row per booking, grouped by class: guests who are coming
-- (confirmed, attended, no-show) first, then the ones not settled yet
-- (unpaid hold, payment being checked, late payment), each in booking order.
--   seat_holding   true if it takes a seat right now (same rule as seats_taken)
--   guest_name     the client's name (or email if they never gave one), or the
--                  walk-in name
--   guest_contact  the client's mobile, or the walk-in contact number
--   is_walkin      true for a walk-in added by the admin (no account)
--   moved_here     true if it was transferred here from another class
--   paid_*         the latest PAID payment of this booking or of the booking
--                  it was moved from (payments stay on the original booking)
create or replace function public.admin_class_rosters(p_session_ids uuid[])
returns table (
  session_id      uuid,
  booking_id      uuid,
  status          public.booking_status,
  seat_holding    boolean,
  guest_name      text,
  guest_contact   text,
  guest_email     text,
  is_walkin       boolean,
  moved_here      boolean,
  first_time      boolean,
  health_notes    text,
  drink_choice    text,
  mat_rental      boolean,
  mat_fee         numeric,
  total           numeric,
  paid_amount     numeric,
  paid_method     public.payment_method,
  paid_provider   public.payment_provider,
  hold_expires_at timestamptz,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.require_admin();

  if coalesce(cardinality(p_session_ids), 0) > 50 then
    raise exception 'Please ask for 50 classes or fewer at a time.';
  end if;

  return query
  select
    b.session_id,
    b.id,
    b.status,
    -- Same rule as seats_taken() in migration 3
    (b.status in ('confirmed', 'awaiting_verification', 'attended')
      or (b.status = 'pending_payment' and b.hold_expires_at > now())),
    coalesce(b.walkin_name, nullif(btrim(p.full_name), ''), p.email, 'Guest'),
    coalesce(b.walkin_contact, p.mobile),
    p.email,
    b.user_id is null,
    b.transferred_from is not null,
    b.first_time,
    b.health_notes,
    b.drink_choice,
    b.mat_rental,
    b.mat_fee,
    b.total,
    pay.amount,
    pay.method,
    pay.provider,
    b.hold_expires_at,
    b.created_at
  from public.bookings b
  left join public.profiles p on p.id = b.user_id
  -- The latest paid payment for this booking or the ones it came from
  left join lateral (
    select x.amount, x.method, x.provider
    from public.payments x
    where x.booking_id in (select public.booking_family(b.id))
      and x.status = 'paid'
    order by x.paid_at desc
    limit 1
  ) pay on true
  where b.session_id = any(p_session_ids)
    and (
      b.status in ('confirmed', 'attended', 'no_show', 'awaiting_verification', 'paid_needs_action')
      or (b.status = 'pending_payment' and b.hold_expires_at > now())
    )
  order by
    b.session_id,
    -- Guests who are coming first, then the unsettled ones
    case when b.status in ('confirmed', 'attended', 'no_show') then 0 else 1 end,
    b.created_at;
end;
$$;


-- -----------------------------------------------------------------------------
-- admin_search_bookings(search, statuses, date, start_time, when, limit)
-- -----------------------------------------------------------------------------

-- The admin Bookings list, with filters and search.
-- Takes (all optional):
--   p_search      a name, email, phone number or booking code. Matching:
--                   - name / email / walk-in name: contains the text (any case)
--                   - phone: contains the digits (4 or more). For 10+ digits
--                     only the last 10 are compared, so "0917 123 4567" also
--                     finds "+63 917 123 4567"
--                   - booking code: "B69-3F9A1C2D" or just "3f9a1c2d" (4+
--                     characters) matches the start of the booking id
--   p_statuses    a list of statuses, e.g. {confirmed} or
--                 {awaiting_verification,paid_needs_action}. Empty = every
--                 status EXCEPT expired (abandoned unpaid holds are noise).
--   p_date        only classes on this date (then p_when is ignored)
--   p_start_time  only classes starting at this time, e.g. 09:00
--   p_when        'upcoming' (today and later, the default), 'past' (before
--                 today, newest first) or 'all'
--   p_limit       how many rows at most (default 200, never more than 500)
-- Gives back: one row per booking with the class, the guest, drink, mat,
-- money and payment, plus total_matches (how many matched before the limit).
-- "status" here is what the admin should SEE: an unpaid hold whose 15
-- minutes have run out shows as 'expired' (it no longer holds a seat), even
-- though the saved row still says pending_payment.
create or replace function public.admin_search_bookings(
  p_search     text    default null,
  p_statuses   text[]  default null,
  p_date       date    default null,
  p_start_time time    default null,
  p_when       text    default 'upcoming',
  p_limit      integer default 200
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
  v_like     text;
  v_digits   text;
  v_code     text;
begin
  perform public.require_admin();

  if v_when not in ('upcoming', 'past', 'all') then
    raise exception 'Please choose upcoming, past or all.';
  end if;

  -- Every status asked for must be a real booking status
  if exists (
    select 1 from unnest(v_statuses) x(s)
    where x.s not in (select unnest(enum_range(null::public.booking_status))::text)
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
      -- Seconds left on a live unpaid hold, rounded up (0 otherwise)
      case
        when e.shown_status = 'pending_payment'
          then ceil(extract(epoch from b.hold_expires_at - now()))::integer
        else 0
      end as hold_seconds_left,
      -- How many rows matched in total (counted BEFORE the limit below)
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
    ) e
    where
      -- Status filter (no filter = everything except expired)
      (case
        when v_statuses is null then e.shown_status <> 'expired'
        else e.shown_status::text = any(v_statuses)
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
    -- Upcoming / all: soonest class first. Past: most recent class first.
    order by
      case when v_when = 'past' and p_date is null then s.date end desc,
      case when v_when = 'past' and p_date is null then s.start_time end desc,
      s.date,
      s.start_time,
      b.created_at
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
  order by
    case when v_when = 'past' and p_date is null then r.date end desc,
    case when v_when = 'past' and p_date is null then r.start_time end desc,
    r.date,
    r.start_time,
    r.created_at;
end;
$$;


-- -----------------------------------------------------------------------------
-- admin_get_booking(booking_id)
-- -----------------------------------------------------------------------------

-- Everything about ONE booking, for the admin's booking details page.
-- Takes: the booking id.
-- Gives back: one row (or no rows if the id doesn't exist) with:
--   the booking (saved status, the status to SHOW, times, health answers,
--     drink, mat, money, voucher code),
--   the class (date, times, status, capacity, seats left right now),
--   the guest (account details, or the walk-in name and contact),
--   moved_from_* / moved_to_*  the class it was transferred from / to,
--   can_mark_attendance        true if admin_set_attendance() would allow it
--                              now (confirmed / attended / no-show, on or
--                              after the class day)
--   payments                   a JSON list of every payment for this booking
--                              and the bookings it came from, newest first.
--                              Each has: id, booking_id, provider, method,
--                              amount, status, paymongo_ref, has_screenshot,
--                              verified_by_name, paid_at, created_at.
--                              (The screenshot itself is shown in Payments,
--                              Step 11 part 2.)
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
    -- Same checks as admin_set_attendance() in migration 3
    (b.status in ('confirmed', 'attended', 'no_show') and s.date <= public.manila_today()),
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


-- -----------------------------------------------------------------------------
-- Who may call what (same pattern as migrations 3, 6, 7 and 8)
-- -----------------------------------------------------------------------------

-- Take every right away first (Supabase gives all roles every new function)...
revoke all on function
  public.admin_dashboard_summary(),
  public.admin_list_sessions(date, date),
  public.admin_class_rosters(uuid[]),
  public.admin_search_bookings(text, text[], date, time, text, integer),
  public.admin_get_booking(uuid)
from public, anon, authenticated, service_role;

-- ...then let logged-in users call them. Each one checks is_admin() inside,
-- so a client who calls one directly only gets "Only admins can do this."
grant execute on function
  public.admin_dashboard_summary(),
  public.admin_list_sessions(date, date),
  public.admin_class_rosters(uuid[]),
  public.admin_search_bookings(text, text[], date, time, text, integer),
  public.admin_get_booking(uuid)
to authenticated;


-- Short descriptions that show up in the Supabase dashboard.
comment on function public.admin_dashboard_summary() is 'Admin: Dashboard numbers (today''s seats, needs action, attendance to mark, money paid this week / month, mat donations).';
comment on function public.admin_list_sessions(date, date) is 'Admin: classes in a date range (past ones too) with seats taken / left and attendance still to mark.';
comment on function public.admin_class_rosters(uuid[]) is 'Admin: who is booked in one or more classes (name, contact, drink, mat, payment), for Attendance and the Dashboard.';
comment on function public.admin_search_bookings(text, text[], date, time, text, integer) is 'Admin: Bookings list with status / date / class filters and search by name, email, phone or booking code.';
comment on function public.admin_get_booking(uuid) is 'Admin: one booking with its class, guest, transfers and every payment.';
