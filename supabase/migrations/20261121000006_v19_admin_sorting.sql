-- Version 1.9: sorting on two admin lists.
--   1. Earnings payments list: Newest first (default) or Oldest first
--      -> admin_list_payments gets a new last argument, p_sort.
--   2. Schedule "Upcoming classes": date soonest first (default) or latest
--      first -> admin_upcoming_classes gets a new argument, p_sort.
-- Both lists are split into pages INSIDE the database, so the sorting must
-- happen here too (sorting one page in the website would be wrong).
-- Nothing else about either function changes: same filters, same admin
-- check, same columns.

-- ---------------------------------------------------------------------------
-- 1. admin_list_payments(..., p_sort)
-- ---------------------------------------------------------------------------
-- The old version (9 arguments) is removed first, because adding an argument
-- makes a new function in Postgres, and the website must call only one.
drop function public.admin_list_payments(text, text, text, date, date, text, integer, text, integer);

-- Admin only: one page of payments for the Earnings table.
-- Takes: the tab (all / review / late), optional filters (status, method,
-- dates, search, provider), the page size and start, and
-- p_sort = 'newest' (default) or 'oldest' (by when it was paid, or started
-- if never paid). The 'review' tab always stays oldest first.
-- Gives back: the payment rows, each with total_matches (all pages).
create function public.admin_list_payments(
  p_view   text    default 'all',
  p_status text    default null,
  p_method text    default null,
  p_from   date    default null,
  p_to     date    default null,
  p_search text    default null,
  p_limit  integer default 200,
  p_provider text  default null,
  p_offset integer default 0,
  -- Version 1.9: 'newest' or 'oldest'
  p_sort   text    default 'newest'
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
  v_provider text  := nullif(btrim(p_provider), '');
  v_limit  integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  -- Version 1.9: the sort (empty = newest)
  v_sort   text    := coalesce(nullif(btrim(p_sort), ''), 'newest');
  v_like   text;
  v_code   text;
begin
  perform public.require_admin();

  if v_view not in ('all', 'review', 'late') then
    raise exception 'Please choose all, review or late.';
  end if;
  -- Version 1.9: only the two sort words are allowed
  if v_sort not in ('newest', 'oldest') then
    raise exception 'Please sort by newest or oldest.';
  end if;
  if v_status is not null and v_status not in (select unnest(enum_range(null::public.payment_status))::text) then
    raise exception 'Unknown payment status in the filter.';
  end if;
  if v_method is not null and v_method not in (select unnest(enum_range(null::public.payment_method))::text) then
    raise exception 'Unknown payment method in the filter.';
  end if;
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
      (case
        when v_view = 'review' then p.provider = 'manual' and p.status = 'pending'
        when v_view = 'late' then b.status = 'paid_needs_action' and p.status = 'paid'
        else true
      end)
      and (v_status is null or p.status::text = v_status)
      and (v_method is null or p.method::text = v_method)
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
    -- Review: oldest first (first come, first checked).
    -- Version 1.9: otherwise oldest first when asked, else newest first.
    -- (When sorting oldest, the "desc" line only breaks exact ties.)
    order by
      case when v_view = 'review' then p.created_at end asc,
      case when v_sort = 'oldest' then coalesce(p.paid_at, p.created_at) end asc,
      coalesce(p.paid_at, p.created_at) desc, p.id
    limit v_limit offset v_offset
  ) x
  -- The same order again for the final list
  order by
    case when v_view = 'review' then x.created_at end asc,
    case when v_sort = 'oldest' then coalesce(x.paid_at, x.created_at) end asc,
    coalesce(x.paid_at, x.created_at) desc, x.id;
end;
$$;

comment on function public.admin_list_payments(text, text, text, date, date, text, integer, text, integer, text) is
  'Admin: one page of payments for Earnings, with filters and (Version 1.9) newest / oldest sort.';

-- Only logged-in users may call it (and the function itself refuses non-admins)
revoke execute on function public.admin_list_payments(text, text, text, date, date, text, integer, text, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_list_payments(text, text, text, date, date, text, integer, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. admin_upcoming_classes(p_page, p_sort)
-- ---------------------------------------------------------------------------
drop function public.admin_upcoming_classes(integer);

-- Admin only: one five-row page of upcoming classes for the Schedule page,
-- with live seat counts for those rows only.
-- Takes: the page number and p_sort = 'asc' (default: soonest class first)
-- or 'desc' (latest class first).
-- Gives back: the classes, each with the total count and the page number
-- actually used (a page past the end becomes the last page).
create function public.admin_upcoming_classes(p_page integer, p_sort text default 'asc')
returns table (
  session_id uuid, date date, start_time time, end_time time, capacity integer,
  status public.session_status, seats_taken integer, seats_left integer,
  has_started boolean, total_count integer, page_number integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_total integer;
  v_page integer;
  -- Version 1.9: the sort (empty = asc)
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'asc');
begin
  perform public.require_admin();
  if v_sort not in ('asc', 'desc') then
    raise exception 'Please sort the dates asc or desc.';
  end if;

  -- How many classes have not ended yet (today and later, Manila time)
  select count(*)::integer into v_total
  from public.class_sessions s
  where s.date >= public.manila_today() and public.at_manila(s.date, s.end_time) > now();

  -- Keep the requested page in range, including after a class ends.
  v_page := least(greatest(1, coalesce(p_page, 1)), greatest(1, (v_total + 4) / 5));
  return query
  select s.id, s.date, s.start_time, s.end_time, s.capacity, s.status,
         x.taken, greatest(0, s.capacity - x.taken),
         public.at_manila(s.date, s.start_time) <= now(), v_total, v_page
  from (
    select c.id, c.date, c.start_time, c.end_time, c.capacity, c.status
    from public.class_sessions c
    where c.date >= public.manila_today() and public.at_manila(c.date, c.end_time) > now()
    -- 'desc': latest date and time first; otherwise soonest first
    order by
      case when v_sort = 'desc' then c.date end desc,
      case when v_sort = 'desc' then c.start_time end desc,
      c.date, c.start_time
    limit 5 offset (v_page - 1) * 5
  ) s
  cross join lateral (select public.seats_taken(s.id) as taken) x
  order by
    case when v_sort = 'desc' then s.date end desc,
    case when v_sort = 'desc' then s.start_time end desc,
    s.date, s.start_time;
end;
$$;

comment on function public.admin_upcoming_classes(integer, text) is
  'Admin: one five-row page of upcoming classes with live seats, sorted by date (Version 1.9: asc or desc).';

revoke execute on function public.admin_upcoming_classes(integer, text) from public, anon, authenticated;
grant execute on function public.admin_upcoming_classes(integer, text) to authenticated;
