-- Sort appointments before paging. Calls without a sort retain the legacy order.
drop function public.admin_search_bookings(text, text[], date, time, text, integer, integer);
create or replace function public.admin_search_bookings(
  p_search     text    default null,
  p_statuses   text[]  default null,
  p_date       date    default null,
  p_start_time time    default null,
  p_when       text    default 'upcoming',
  p_limit      integer default 200,
  p_offset     integer default 0,
  p_sort       text default null
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
        when b.status = 'awaiting_verification' and public.at_manila(s.date, s.end_time) <= now()
          and exists (select 1 from public.payments p where p.booking_id = b.id
            and p.provider = 'manual' and p.method in ('gcash', 'bpi') and p.status = 'pending')
          then 'expired'::public.booking_status
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
      case when p_sort = 'newest' then b.created_at end desc,
      case when p_sort = 'oldest' then b.created_at end asc,
      case when p_sort in ('newest', 'oldest') then b.id end,
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
    case when p_sort = 'newest' then r.created_at end desc,
    case when p_sort = 'oldest' then r.created_at end asc,
    case when p_sort in ('newest', 'oldest') then r.id end,
    case when v_when = 'all' and p_date is null then r.date < public.manila_today() end,
    case when p_date is null and (v_when = 'past' or (v_when = 'all' and r.date < public.manila_today())) then r.date end desc,
    case when p_date is null and (v_when = 'past' or (v_when = 'all' and r.date < public.manila_today())) then r.start_time end desc,
    r.date,
    r.start_time,
    r.created_at,
    r.id;
end;
$$;

revoke execute on function public.admin_search_bookings(text, text[], date, time, text, integer, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_search_bookings(text, text[], date, time, text, integer, integer, text) to authenticated;

-- Page filtered payments independently of the earnings totals.
drop function public.admin_list_payments(text, text, text, date, date, text, integer, text);
create or replace function public.admin_list_payments(
  p_view   text    default 'all',
  p_status text    default null,
  p_method text    default null,
  p_from   date    default null,
  p_to     date    default null,
  p_search text    default null,
  p_limit  integer default 200,
  -- Version 1.7: one payment provider (paymongo, manual or cash)
  p_provider text  default null,
  p_offset integer default 0
)
returns table (
  payment_id       uuid,
  provider         public.payment_provider,
  method           public.payment_method,
  amount           numeric,
  status           public.payment_status,
  paymongo_ref     text,
  screenshot_path  text,
  verified_by_name text,
  paid_at          timestamptz,
  created_at       timestamptz,
  booking_id       uuid,
  booking_status   public.booking_status,
  class_date       date,
  start_time       time,
  end_time         time,
  session_status   public.session_status,
  guest_name       text,
  guest_email      text,
  guest_contact    text,
  is_walkin        boolean,
  mat_rental       boolean,
  booking_total    numeric,
  total_matches    integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_view   text    := coalesce(nullif(btrim(p_view), ''), 'all');
  v_status text    := nullif(btrim(p_status), '');
  v_method text    := nullif(btrim(p_method), '');
  v_search text    := nullif(btrim(p_search), '');
  -- Version 1.7: the provider filter (empty = all)
  v_provider text  := nullif(btrim(p_provider), '');
  v_limit  integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_like   text;
  v_code   text;
begin
  perform public.require_admin();

  if v_view not in ('all', 'review', 'late') then
    raise exception 'Please choose all, review or late.';
  end if;
  if v_status is not null and v_status not in (select unnest(enum_range(null::public.payment_status))::text) then
    raise exception 'Unknown payment status in the filter.';
  end if;
  if v_method is not null and v_method not in (select unnest(enum_range(null::public.payment_method))::text) then
    raise exception 'Unknown payment method in the filter.';
  end if;
  -- Version 1.7: same check for the provider
  if v_provider is not null and v_provider not in (select unnest(enum_range(null::public.payment_provider))::text) then
    raise exception 'Unknown payment provider in the filter.';
  end if;

  if v_search is not null then
    -- "contains" pattern; a typed % or _ means the character itself
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- A booking code: drop an optional "B69-" in front, keep only 0-9 a-f
    v_code := lower(regexp_replace(regexp_replace(v_search, '^B69-?', '', 'i'), '[^0-9a-fA-F]', '', 'g'));
  end if;

  return query
  select
    x.id, x.provider, x.method, x.amount, x.status, x.paymongo_ref, x.screenshot_path,
    x.verified_by_name, x.paid_at, x.created_at, x.booking_id, x.booking_status,
    x.date, x.start_time, x.end_time, x.session_status, x.guest_name, x.guest_email,
    x.guest_contact, x.is_walkin, x.mat_rental, x.total, x.total_matches
  from (
    select
      p.id, p.provider, p.method, p.amount, p.status, p.paymongo_ref, p.screenshot_path,
      coalesce(nullif(btrim(vp.full_name), ''), vp.email) as verified_by_name,
      p.paid_at, p.created_at, b.id as booking_id,
      case
        when b.status = 'pending_payment' and b.hold_expires_at <= now() then 'expired'::public.booking_status
        else b.status
      end as booking_status,
      s.date, s.start_time, s.end_time, s.status as session_status,
      coalesce(b.walkin_name, nullif(btrim(pr.full_name), ''), pr.email, 'Guest') as guest_name,
      pr.email as guest_email,
      coalesce(b.walkin_contact, pr.mobile) as guest_contact,
      b.user_id is null as is_walkin,
      b.mat_rental, b.total,
      (count(*) over ())::integer as total_matches
    from public.payments p
    join public.bookings b on b.id = p.booking_id
    join public.class_sessions s on s.id = b.session_id
    left join public.profiles pr on pr.id = b.user_id
    left join public.profiles vp on vp.id = p.verified_by
    where
      -- Which tab
      (case
        when v_view = 'review' then p.provider = 'manual' and p.status = 'pending'
        when v_view = 'late' then b.status = 'paid_needs_action' and p.status = 'paid'
        else true
      end)
      and (v_status is null or p.status::text = v_status)
      and (v_method is null or p.method::text = v_method)
      -- Version 1.7: e.g. 'paymongo' = every PayMongo payment (GCash, Maya
      -- or card); 'manual' + method 'gcash' = a GCash transfer
      and (v_provider is null or p.provider::text = v_provider)
      -- Dates: when it was paid, or when it started if not paid (Manila dates)
      and (p_from is null or (coalesce(p.paid_at, p.created_at) at time zone 'Asia/Manila')::date >= p_from)
      and (p_to is null or (coalesce(p.paid_at, p.created_at) at time zone 'Asia/Manila')::date <= p_to)
      and (
        v_search is null
        or coalesce(pr.full_name, '') ilike v_like
        or coalesce(pr.email, '') ilike v_like
        or coalesce(b.walkin_name, '') ilike v_like
        or coalesce(p.paymongo_ref, '') ilike v_like
        or (length(v_code) >= 4 and b.id::text like v_code || '%')
      )
    -- Review: oldest first (first come, first checked). Others: newest first.
    order by
      case when v_view = 'review' then p.created_at end asc,
      coalesce(p.paid_at, p.created_at) desc, p.id
    limit v_limit offset v_offset
  ) x
  order by
    case when v_view = 'review' then x.created_at end asc,
    coalesce(x.paid_at, x.created_at) desc, x.id;
end;
$$;

revoke execute on function public.admin_list_payments(text, text, text, date, date, text, integer, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_list_payments(text, text, text, date, date, text, integer, text, integer) to authenticated;

-- Cancel once and return precisely the clients notified by that transaction.
create function public.admin_cancel_class_for_email(p_session_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_count integer;
  v_result jsonb;
begin
  v_count := public.admin_cancel_session(p_session_id);
  select jsonb_build_object(
    'bookedCount', v_count,
    'classDate', s.date,
    'startTime', s.start_time,
    'endTime', s.end_time,
    'recipients', coalesce((
      select jsonb_agg(to_jsonb(r)) from (
        select distinct on (n.user_id)
          n.user_id, n.booking_id, n.kind
        from public.notifications n
        join public.bookings b on b.id = n.booking_id
        where b.session_id = s.id and n.created_at = now()
          and n.kind in ('class_cancelled', 'class_cancelled_checking', 'class_cancelled_hold_released')
        order by n.user_id, case n.kind when 'class_cancelled' then 1 when 'class_cancelled_checking' then 2 else 3 end, n.booking_id
      ) r
    ), '[]'::jsonb)
  ) into v_result
  from public.class_sessions s where s.id = p_session_id;
  return v_result;
end;
$$;

revoke execute on function public.admin_cancel_class_for_email(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_cancel_class_for_email(uuid) to authenticated;
