-- =============================================================================
-- Migration 22: Version 1.5, admin side (the Bookings list).
--
-- What this file does (one function, admin_search_bookings):
--   A1. "Pending Attendance Verification": a booking that is still
--       'confirmed' after its class has ENDED (and the cafe didn't cancel the
--       class) is worked out on the fly, not saved as a new status. That way
--       it needs no timer or nightly job: the moment the class ends, the list
--       shows it. The new column attendance_due says so, and the status
--       filter accepts the extra word 'pending_attendance':
--         - 'pending_attendance' lists only those bookings
--         - 'confirmed' now lists only confirmed bookings whose class has NOT
--           ended yet (or was cancelled by the cafe)
--       The admin then marks Attended or No-show on the booking page
--       (admin_set_attendance, unchanged).
--   A2. The Attended and No-show chips just filter on 'attended' / 'no_show'
--       (already real statuses), so nothing is needed here for them.
--   A3. Pagination: the new p_offset says how many matching rows to skip, so
--       the page loads only the rows it shows. total_matches still counts
--       every match (before the offset and limit).
--
-- The return columns and the arguments change, so the old function is
-- dropped first and its rights are given back at the end.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website: /admin/bookings (src/app/admin/(panel)/bookings/page.tsx) and
-- the Dashboard (src/app/admin/(panel)/page.tsx).
-- Tests: supabase/tests/24-v15-admin.test.mjs.
-- =============================================================================


drop function if exists public.admin_search_bookings(text, text[], date, time, text, integer);

-- The admin Bookings list, with filters, search and pages.
-- Takes (all optional):
--   p_search      a name, email, phone number or booking code (same matching
--                 as migration 9: contains the name / email, 4+ digits of a
--                 phone, or the start of a booking code like B69-3F9A1C2D)
--   p_statuses    a list of statuses, e.g. {confirmed}. Besides the real
--                 booking statuses it accepts 'pending_attendance' (NEW, see
--                 the top of this file). Empty = everything EXCEPT expired.
--   p_date        only classes on this date (then p_when is ignored)
--   p_start_time  only classes starting at this time, e.g. 09:00
--   p_when        'upcoming' (today and later, the default), 'past' (before
--                 today, newest first) or 'all'
--   p_limit       how many rows at most (default 200, never more than 500)
--   p_offset      how many matching rows to skip first (NEW, default 0), for
--                 page 2, 3, ...
-- Gives back: one row per booking with the class, the guest, drink, mat,
-- money and payment, plus:
--   attendance_due  (NEW) true = confirmed, the class has ended and wasn't
--                   cancelled: show "Pending Attendance Verification"
--   total_matches   how many rows matched in all (before offset and limit)
-- "status" is what the admin should SEE: an unpaid hold whose time has run
-- out shows as 'expired'.
create function public.admin_search_bookings(
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
      -- Status filter (no filter = everything except expired)
      (case
        when v_statuses is null then e.shown_status <> 'expired'
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
    -- Upcoming / all: soonest class first. Past: most recent class first.
    -- (b.id last, so pages never swap rows that tie.)
    order by
      case when v_when = 'past' and p_date is null then s.date end desc,
      case when v_when = 'past' and p_date is null then s.start_time end desc,
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
  order by
    case when v_when = 'past' and p_date is null then r.date end desc,
    case when v_when = 'past' and p_date is null then r.start_time end desc,
    r.date,
    r.start_time,
    r.created_at,
    r.id;
end;
$$;


-- Who may call it: logged-in users only (it checks is_admin() inside, so a
-- client gets "Only admins can do this."). Same as migration 9.
revoke all on function public.admin_search_bookings(text, text[], date, time, text, integer, integer)
from public, anon, authenticated, service_role;
grant execute on function public.admin_search_bookings(text, text[], date, time, text, integer, integer)
to authenticated;

comment on function public.admin_search_bookings(text, text[], date, time, text, integer, integer) is 'Admin: Bookings list with status (incl. pending_attendance) / date / class filters, search and pages (offset).';
