-- =============================================================================
-- Migration 26: Version 1.7 (Prompt C), Earnings page method filter.
--
-- What this file does:
--   1. admin_list_payments() gets one more optional filter, p_provider
--      (paymongo, manual or cash). The Earnings page's "Method" box now has
--      exactly: All, PayMongo, GCash transfer, BPI transfer. Those need the
--      PROVIDER, not only the method:
--        PayMongo        provider = 'paymongo' (GCash, Maya or card online)
--        GCash transfer  provider = 'manual' and method = 'gcash'
--        BPI transfer    provider = 'manual' and method = 'bpi'
--      (Before, method 'gcash' mixed PayMongo GCash with GCash transfers,
--      and there was no way to pick "PayMongo".)
--      Everything else in the function is exactly as in migration 10.
--
-- Why drop and re-create: adding a parameter makes a NEW function in
-- Postgres; keeping the old one too would confuse the website's calls
-- (two functions with the same name). The new parameter is LAST, so calls
-- that pass the first 7 values in order still work.
-- =============================================================================


-- Remove the old 7-parameter version (its grants go with it).
drop function if exists public.admin_list_payments(text, text, text, date, date, text, integer);


-- Lists payments for the admin, with filters.
-- Takes (all optional):
--   p_view     'all' (default), 'review' (manual GCash / BPI transfers still
--              waiting for the admin, oldest first) or 'late' (payments whose
--              booking is "paid, needs action")
--   p_status   one payment status (pending, paid, failed, expired, rejected, refunded)
--   p_method   one method (gcash, maya, card, bpi, cash)
--   p_from / p_to  Philippine dates; matched on when it was paid (or started,
--              if not paid)
--   p_search   client or walk-in name, email, PayMongo reference, or booking
--              code (B69-...)
--   p_limit    how many rows at most (default 200, never more than 500)
--   p_provider (Version 1.7) one provider: paymongo, manual or cash
-- Gives back: one row per payment with its booking, class and guest, plus
-- total_matches (counted before the limit). booking_status shows an unpaid
-- hold whose time ran out as 'expired' (like admin_search_bookings).
-- security definer: it reads every client's payments, so it checks
-- require_admin() first.
create or replace function public.admin_list_payments(
  p_view   text    default 'all',
  p_status text    default null,
  p_method text    default null,
  p_from   date    default null,
  p_to     date    default null,
  p_search text    default null,
  p_limit  integer default 200,
  -- Version 1.7: one payment provider (paymongo, manual or cash)
  p_provider text  default null
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
      coalesce(p.paid_at, p.created_at) desc
    limit v_limit
  ) x
  order by
    case when v_view = 'review' then x.created_at end asc,
    coalesce(x.paid_at, x.created_at) desc;
end;
$$;


-- Take every right away first (Supabase gives all roles every new function),
-- then let logged-in users call it; it checks require_admin() inside.
revoke all on function public.admin_list_payments(text, text, text, date, date, text, integer, text)
from public, anon, authenticated, service_role;
grant execute on function public.admin_list_payments(text, text, text, date, date, text, integer, text)
to authenticated;

-- Short description that shows up in the Supabase dashboard.
comment on function public.admin_list_payments(text, text, text, date, date, text, integer, text) is
  'Admin: payments with filters (status, method, provider, dates, search), plus the review (manual transfers) and late-payment views.';
