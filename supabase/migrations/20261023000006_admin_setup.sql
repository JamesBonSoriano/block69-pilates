-- =============================================================================
-- Migration 10: admin setup pages (Phase C, Step 11 part 2).
--
-- What this file does:
--   1. Promo codes can be TURNED OFF: new column vouchers.disabled_at, and
--      find_usable_voucher() (migration 3) refuses a turned-off code. Nothing
--      else about vouchers changes.
--   2. Settings / Pricing:   admin_update_settings(values) checks every value
--                            before saving it (prices, hold minutes, cutoff,
--                            links, drink options, ...)
--   3. Vouchers:             admin_create_promo, admin_set_promo_enabled,
--                            admin_list_vouchers
--   4. Payments:             admin_list_payments, admin_earnings
--                            (approve / reject still uses
--                            admin_review_manual_payment from migration 3)
--   5. Schedule:             admin_update_session (capacity / open / closed
--                            for ONE dated class). Weekly templates are edited
--                            straight in the table (admins only, RLS from
--                            migration 2); classes are made with
--                            generate_sessions (migration 3).
--   6. Users:                admin_list_users, admin_set_user_active,
--                            admin_set_user_role. An admin can never change
--                            their OWN role or active status, not even with
--                            a direct update (the profile guard trigger from
--                            migration 2 is rewritten to block it).
--   7. Storage buckets + policies:
--        site-images          PUBLIC (anyone can see the photos), only
--                             admins can upload, replace or delete
--        payment-screenshots  PRIVATE, only admins can open the files
--                             (clients upload in Step 12; that policy comes then)
--   8. One booking:          admin_cancel_booking, admin_transfer_booking,
--                            admin_booking_change_info, and a new admins-only
--                            table booking_admin_actions (who, when, the
--                            normal rule, override yes/no, the reason).
--                            The admin follows the cancellation rules by
--                            default; a different outcome needs a reason.
--
-- Security: every admin_* function starts with require_admin() (active
-- admins only) and only logged-in users may call them (grants at the bottom).
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase
-- project. The website calls the functions from src/lib/data/admin.ts and
-- src/lib/admin/*.ts.
--
-- (No peso sign in this file on purpose: the test database on Windows can't
-- read it, even in a comment.)
-- =============================================================================


-- =============================================================================
-- 1. TURNING PROMO CODES OFF
-- =============================================================================

-- When the admin turned the code off. Empty = the code is on.
-- (Only promo codes can be turned off; personal 50% codes can't.)
alter table public.vouchers
  add column disabled_at timestamptz;

comment on column public.vouchers.disabled_at is 'When the admin turned this promo code off. Empty = on.';


-- Finds a voucher code and checks the caller may use it right now.
-- SAME as migration 3, with ONE new check: a code the admin turned off
-- (disabled_at is set) is refused.
-- Checks: the code exists, it's not someone else's personal code, it's not
-- turned off, it hasn't expired, and it still has a use left.
-- A voucher use is RESERVED while a booking that uses it is holding a seat
-- (pending_payment with a live hold, or awaiting_verification), and SPENT when
-- that booking gets paid (trigger from migration 3).
-- Takes: the typed code and the caller's user id.
-- Gives back: the whole voucher row, LOCKED until the transaction ends.
create or replace function public.find_usable_voucher(p_code text, p_user_id uuid)
returns public.vouchers
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_voucher  public.vouchers%rowtype;
  v_reserved integer;
begin
  -- Codes are stored in capitals; ignore spaces the client typed around it.
  select v.* into v_voucher
  from public.vouchers v
  where v.code = upper(btrim(p_code))
  for update;

  -- Not found, or it's another client's personal code. (Same message for both,
  -- so nobody can guess other people's codes.)
  if not found or (v_voucher.owner_id is not null and v_voucher.owner_id <> p_user_id) then
    raise exception 'Sorry, that voucher code isn''t valid.';
  end if;

  -- NEW: the cafe turned this code off
  if v_voucher.disabled_at is not null then
    raise exception 'Sorry, this voucher code is no longer active.';
  end if;

  if v_voucher.expires_at is not null and v_voucher.expires_at <= now() then
    raise exception 'Sorry, this voucher code has expired.';
  end if;

  -- How many uses are reserved by bookings that are still waiting for payment.
  select count(*)::integer into v_reserved
  from public.bookings b
  where b.voucher_id = v_voucher.id
    and (
      b.status = 'awaiting_verification'
      or (b.status = 'pending_payment' and b.hold_expires_at > now())
    );

  if v_voucher.uses_left - v_reserved <= 0 then
    if v_reserved > 0 then
      raise exception 'This voucher code is already on another booking that is waiting for payment.';
    end if;
    raise exception 'Sorry, this voucher code has already been used.';
  end if;

  return v_voucher;
end;
$$;


-- =============================================================================
-- 2. SETTINGS (Settings page and Pricing page)
-- =============================================================================

-- Saves one or more settings, after checking each value.
-- Why a function: book_seat() and the website READ these values (prices,
-- hold minutes, cutoff, drink list). A wrong value (e.g. "abc" as a price)
-- would break booking, so the database refuses it here.
-- Takes: a JSON object of setting key -> new value, e.g.
--   {"class_price": 550, "cutoff_time": "07:30", "cafe_phone": "0917 123 4567"}
-- The rules per key:
--   class_price             number, 1 to 100000 pesos, at most 2 decimals
--   mat_price               number, 0 to 100000 pesos, at most 2 decimals
--   hold_minutes            whole number, 5 to 60
--   cutoff_time             "HH:MM" (24-hour clock), e.g. "08:00"
--   sessions_weeks_ahead    whole number, 1 to 12
--   manual_payment_enabled  true / false
--   drink_options           a list of 1 to 12 names, each 1 to 40 characters,
--                           no repeats (spaces around each name are removed)
--   cafe_name, cafe_address required text (up to 80 / 200 characters)
--   cafe_email, admin_alert_email   an email address
--   cafe_phone, gcash_name, gcash_number, bpi_account_name,
--   bpi_account_number      text, up to 80 characters (may be empty)
--   maps_url, instagram_url, facebook_url, chat_url
--                           empty, or a web address starting with https://
-- Any other key is refused (logo_path is set by the logo upload, later).
-- Text is saved without spaces at the ends.
-- Gives back: how many settings were saved.
create or replace function public.admin_update_settings(p_values jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key   text;
  v_value jsonb;
  v_clean jsonb;     -- the value that is saved
  v_text  text;
  v_num   numeric;
  v_label text;      -- the setting's name in messages
  v_count integer := 0;
begin
  perform public.require_admin();

  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    raise exception 'There is nothing to save.';
  end if;

  for v_key, v_value in select e.key, e.value from jsonb_each(p_values) e loop
    -- A friendly name for messages
    v_label := case v_key
      when 'class_price' then 'The class price'
      when 'mat_price' then 'The mat rental price'
      when 'hold_minutes' then 'The seat hold'
      when 'cutoff_time' then 'The booking cutoff'
      when 'sessions_weeks_ahead' then 'Weeks ahead'
      when 'drink_options' then 'The drink list'
      when 'cafe_name' then 'The cafe name'
      when 'cafe_address' then 'The address'
      when 'cafe_email' then 'The contact email'
      when 'admin_alert_email' then 'The alert email'
      when 'cafe_phone' then 'The phone number'
      when 'gcash_name' then 'The GCash account name'
      when 'gcash_number' then 'The GCash number'
      when 'bpi_account_name' then 'The BPI account name'
      when 'bpi_account_number' then 'The BPI account number'
      when 'maps_url' then 'The map link'
      when 'instagram_url' then 'The Instagram link'
      when 'facebook_url' then 'The Facebook link'
      when 'chat_url' then 'The Chat With Us link'
      else initcap(replace(v_key, '_', ' '))
    end;

    case
      -- ---- Money ----
      when v_key in ('class_price', 'mat_price') then
        if jsonb_typeof(v_value) <> 'number' then
          raise exception '% must be a number of pesos.', v_label;
        end if;
        v_num := (v_value #>> '{}')::numeric;
        if v_num <> round(v_num, 2) then
          raise exception '% can have at most 2 decimals.', v_label;
        end if;
        if v_num > 100000 or v_num < (case when v_key = 'class_price' then 1 else 0 end) then
          raise exception '% must be between % and 100,000 pesos.', v_label,
            case when v_key = 'class_price' then 1 else 0 end;
        end if;
        v_clean := to_jsonb(v_num);

      -- ---- Whole numbers ----
      when v_key in ('hold_minutes', 'sessions_weeks_ahead') then
        if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}')::numeric <> trunc((v_value #>> '{}')::numeric) then
          raise exception '% must be a whole number.', v_label;
        end if;
        v_num := (v_value #>> '{}')::numeric;
        if v_key = 'hold_minutes' and v_num not between 5 and 60 then
          raise exception 'The seat hold must be between 5 and 60 minutes.';
        end if;
        if v_key = 'sessions_weeks_ahead' and v_num not between 1 and 12 then
          raise exception 'Weeks ahead must be between 1 and 12.';
        end if;
        v_clean := to_jsonb(v_num::integer);

      -- ---- The cutoff time ----
      when v_key = 'cutoff_time' then
        v_text := btrim(v_value #>> '{}');
        if jsonb_typeof(v_value) <> 'string' or v_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
          raise exception 'The booking cutoff must be a time like 08:00.';
        end if;
        v_clean := to_jsonb(v_text);

      -- ---- On / off ----
      when v_key = 'manual_payment_enabled' then
        if jsonb_typeof(v_value) <> 'boolean' then
          raise exception 'The manual transfer switch must be on or off.';
        end if;
        v_clean := v_value;

      -- ---- The drink list ----
      when v_key = 'drink_options' then
        if jsonb_typeof(v_value) <> 'array' then
          raise exception 'The drink list must be a list of names.';
        end if;
        if exists (select 1 from jsonb_array_elements(v_value) d where jsonb_typeof(d) <> 'string') then
          raise exception 'Each drink must be a name.';
        end if;
        -- Clean every name, keep the admin's order
        select coalesce(jsonb_agg(x.name order by x.n), '[]'::jsonb) into v_clean
        from (
          select btrim(d.value) as name, d.n
          from jsonb_array_elements_text(v_value) with ordinality as d(value, n)
          where btrim(d.value) <> ''
        ) x;
        if jsonb_array_length(v_clean) not between 1 and 12 then
          raise exception 'Please keep between 1 and 12 drinks on the list.';
        end if;
        if exists (select 1 from jsonb_array_elements_text(v_clean) d where length(d) > 40) then
          raise exception 'Each drink name can be at most 40 characters.';
        end if;
        if (select count(distinct lower(d)) from jsonb_array_elements_text(v_clean) d) <> jsonb_array_length(v_clean) then
          raise exception 'The drink list has the same drink twice.';
        end if;

      -- ---- Text ----
      when v_key in ('cafe_name', 'cafe_address', 'cafe_email', 'admin_alert_email',
                     'cafe_phone', 'gcash_name', 'gcash_number', 'bpi_account_name', 'bpi_account_number') then
        if jsonb_typeof(v_value) <> 'string' then
          raise exception '% must be text.', v_label;
        end if;
        v_text := btrim(v_value #>> '{}');
        if v_key in ('cafe_name', 'cafe_address', 'cafe_email', 'admin_alert_email') and v_text = '' then
          raise exception '% can''t be empty.', v_label;
        end if;
        if length(v_text) > (case when v_key = 'cafe_address' then 200 else 80 end) then
          raise exception '% is too long.', v_label;
        end if;
        if v_key in ('cafe_email', 'admin_alert_email') and v_text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
          raise exception '% must be an email address.', v_label;
        end if;
        v_clean := to_jsonb(v_text);

      -- ---- Web links ----
      when v_key in ('maps_url', 'instagram_url', 'facebook_url', 'chat_url') then
        if jsonb_typeof(v_value) <> 'string' then
          raise exception '% must be a web address.', v_label;
        end if;
        v_text := btrim(v_value #>> '{}');
        -- Empty is allowed (the website then hides that link)
        if v_text <> '' and (v_text !~ '^https://[^[:space:]]+$' or length(v_text) > 300) then
          raise exception '% must be a web address starting with https://', v_label;
        end if;
        v_clean := to_jsonb(v_text);

      else
        raise exception 'Unknown setting: %', v_key;
    end case;

    -- Save it. A missing row is made again (public, except the two admin-only
    -- settings). An existing row keeps its is_public as it is.
    insert into public.settings (key, value, is_public)
    values (v_key, v_clean, v_key not in ('admin_alert_email', 'sessions_weeks_ahead'))
    on conflict (key) do update set value = excluded.value;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


-- =============================================================================
-- 3. VOUCHERS (Pricing & Vouchers page)
-- =============================================================================

-- Makes a new promo code that anyone can use.
-- Takes: the code (3 to 32 letters, numbers or dashes; saved in capitals),
-- the percent off the CLASS FEE (more than 0, up to 100), how many times it
-- can be used in total (1 to 10000), and the last day it works (optional,
-- a Philippine date; it works until the end of that day).
-- Codes starting with "HALF-" are kept for the system's 50% codes.
-- Gives back: the new voucher's id.
create or replace function public.admin_create_promo(
  p_code        text,
  p_percent_off numeric,
  p_uses        integer,
  p_expires_on  date default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_id   uuid;
begin
  perform public.require_admin();

  if v_code !~ '^[A-Z0-9-]{3,32}$' then
    raise exception 'A code must be 3 to 32 letters, numbers or dashes (no spaces).';
  end if;
  if v_code like 'HALF-%' then
    raise exception 'Codes starting with HALF- are kept for the 50%% cancellation codes. Please pick another.';
  end if;
  if p_percent_off is null or p_percent_off <= 0 or p_percent_off > 100 or p_percent_off <> round(p_percent_off, 2) then
    raise exception 'The discount must be more than 0 and at most 100 percent.';
  end if;
  if p_uses is null or p_uses not between 1 and 10000 then
    raise exception 'Total uses must be between 1 and 10,000.';
  end if;
  if p_expires_on is not null and p_expires_on < public.manila_today() then
    raise exception 'The last day can''t be in the past.';
  end if;

  begin
    insert into public.vouchers (code, percent_off, source, uses_left, expires_at)
    values (
      v_code, p_percent_off, 'promo', p_uses,
      -- Works until the END of the last day (midnight after it, Manila time)
      case when p_expires_on is not null then public.at_manila(p_expires_on + 1, '00:00') end
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'The code % already exists. Please pick another.', v_code;
  end;

  return v_id;
end;
$$;


-- Turns a promo code off (nobody can use it any more) or back on.
-- A booking that already holds a seat with it keeps its discount.
-- Takes: the voucher id and true (on) or false (off).
-- Gives back: true if it's on now, false if it's off.
-- Only promo codes can be turned off; personal 50% codes belong to a client.
create or replace function public.admin_set_promo_enabled(p_voucher_id uuid, p_enabled boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_source public.voucher_source;
begin
  perform public.require_admin();

  if p_enabled is null then
    raise exception 'Please choose on or off.';
  end if;

  select v.source into v_source from public.vouchers v where v.id = p_voucher_id for update;
  if not found then
    raise exception 'Sorry, we couldn''t find that code.';
  end if;
  if v_source <> 'promo' then
    raise exception 'Only promo codes can be turned on or off.';
  end if;

  update public.vouchers v
    set disabled_at = case when p_enabled then null else now() end
    where v.id = p_voucher_id;
  return p_enabled;
end;
$$;


-- Lists every voucher for the admin: promo codes and the personal 50% codes.
-- Takes: nothing.
-- Gives back: one row per voucher, newest first, with:
--   times_used     original paid bookings that used it (transfer copies don't count)
--   reserved       uses held right now by unpaid bookings
--   state          'off' (turned off), 'used' (no uses left), 'expired',
--                  'reserved' (its last use is on an unpaid booking), 'active'
--   owner_name / owner_email   the client, for personal codes (empty for promos)
--   used_for_date  for a used personal code: the class it was used on
create or replace function public.admin_list_vouchers()
returns table (
  voucher_id    uuid,
  code          text,
  source        public.voucher_source,
  percent_off   numeric,
  amount_off    numeric,
  uses_left     integer,
  times_used    integer,
  reserved      integer,
  expires_at    timestamptz,
  disabled_at   timestamptz,
  created_at    timestamptz,
  owner_name    text,
  owner_email   text,
  state         text,
  used_for_date date
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
    v.id,
    v.code,
    v.source,
    v.percent_off,
    v.amount_off,
    v.uses_left,
    u.used,
    r.reserved,
    v.expires_at,
    v.disabled_at,
    v.created_at,
    nullif(btrim(p.full_name), ''),
    p.email,
    case
      when v.disabled_at is not null then 'off'
      when v.uses_left <= 0 then 'used'
      when v.expires_at is not null and v.expires_at <= now() then 'expired'
      when v.uses_left - r.reserved <= 0 then 'reserved'
      else 'active'
    end,
    u.last_date
  from public.vouchers v
  left join public.profiles p on p.id = v.owner_id
  -- Uses held by unpaid bookings right now (same rule as find_usable_voucher)
  cross join lateral (
    select count(*)::integer as reserved
    from public.bookings b
    where b.voucher_id = v.id
      and (b.status = 'awaiting_verification' or (b.status = 'pending_payment' and b.hold_expires_at > now()))
  ) r
  -- Uses spent: original bookings that got paid with it (same rule as get_my_vouchers)
  cross join lateral (
    select count(*)::integer as used, max(s.date) as last_date
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    where b.voucher_id = v.id
      and b.transferred_from is null
      and b.status not in ('pending_payment', 'awaiting_verification', 'expired')
  ) u
  order by v.created_at desc;
end;
$$;


-- =============================================================================
-- 4. PAYMENTS (Payments page)
-- =============================================================================

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
-- Gives back: one row per payment with its booking, class and guest, plus
-- total_matches (counted before the limit). booking_status shows an unpaid
-- hold whose time ran out as 'expired' (like admin_search_bookings).
create or replace function public.admin_list_payments(
  p_view   text    default 'all',
  p_status text    default null,
  p_method text    default null,
  p_from   date    default null,
  p_to     date    default null,
  p_search text    default null,
  p_limit  integer default 200
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


-- Money received, by day and by payment method (the Payments page cards
-- and bars).
-- Takes: the first and last date (Philippine dates, at most 400 days apart).
-- Gives back: one row per day + provider + method that had paid payments:
--   payments     how many paid payments
--   amount       pesos received
--   mat_amount   of that, pesos of mat rental (all of it goes to the strays).
--                A payment sits on the ORIGINAL booking (transfers copy the
--                booking, not the payment), so each mat is counted once.
-- Only 'paid' payments count (refunds, failures and pending ones don't).
create or replace function public.admin_earnings(p_from date, p_to date)
returns table (
  day        date,
  provider   public.payment_provider,
  method     public.payment_method,
  payments   integer,
  amount     numeric,
  mat_amount numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.require_admin();

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Please pick a start date and an end date after it.';
  end if;
  if p_to - p_from > 400 then
    raise exception 'Please pick at most 400 days at a time.';
  end if;

  return query
  select
    (p.paid_at at time zone 'Asia/Manila')::date as day,
    p.provider,
    p.method,
    count(*)::integer,
    sum(p.amount),
    -- never more than the payment itself
    sum(least(b.mat_fee, p.amount))
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  where p.status = 'paid'
    and p.paid_at >= public.at_manila(p_from, '00:00')
    and p.paid_at < public.at_manila(p_to + 1, '00:00')
  group by 1, 2, 3
  order by 1, 2, 3;
end;
$$;


-- =============================================================================
-- 5. ONE DATED CLASS (Schedule page)
-- =============================================================================

-- Changes the seats of ONE dated class, or closes / opens it for booking.
-- (To CANCEL a class, the admin uses admin_cancel_session from migration 3,
-- which gives booked clients a free transfer.)
-- Takes: the class id, the new capacity (1 to 50) and 'open' or 'closed'.
-- Rules: a cancelled or finished class can't be changed, and the capacity
-- can't go below the seats already taken (nobody loses their seat).
-- 'closed' = nobody can book it any more (online or walk-in), but the people
-- already booked keep their seats.
-- Gives back: the saved capacity, status and the seats taken right now.
create or replace function public.admin_update_session(
  p_session_id uuid,
  p_capacity   integer,
  p_status     public.session_status
)
returns table (
  capacity    integer,
  status      public.session_status,
  seats_taken integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_session public.class_sessions%rowtype;
  v_taken   integer;
begin
  perform public.require_admin();

  -- LOCK the class, so nobody books its last seat while we change it
  select s.* into v_session from public.class_sessions s where s.id = p_session_id for update;
  if not found then
    raise exception 'Sorry, we couldn''t find that class.';
  end if;
  if v_session.status = 'cancelled' then
    raise exception 'This class was cancelled, so it can''t be changed.';
  end if;
  if now() >= public.at_manila(v_session.date, v_session.end_time) then
    raise exception 'This class has already ended.';
  end if;
  if p_status is null or p_status not in ('open', 'closed') then
    raise exception 'Please choose open or closed. To cancel a class, use Cancel class.';
  end if;
  if p_capacity is null or p_capacity not between 1 and 50 then
    raise exception 'Seats must be between 1 and 50.';
  end if;

  v_taken := public.seats_taken(v_session.id);
  if p_capacity < v_taken then
    raise exception '% seats are already taken, so the class can''t have fewer than % seats.', v_taken, v_taken;
  end if;

  update public.class_sessions s
    set capacity = p_capacity, status = p_status
    where s.id = v_session.id;

  return query select p_capacity, p_status, v_taken;
end;
$$;


-- =============================================================================
-- 6. USERS (Users page)
-- =============================================================================

-- Lists accounts for the admin, with search.
-- Takes (optional): search text (name, email, or 4+ digits of the mobile),
-- a role ('client' or 'admin'; empty = everyone) and a limit (default 200,
-- at most 500).
-- Gives back: one row per account, by name, with:
--   bookings        bookings they made that count (not expired holds)
--   upcoming        seat-holding bookings in classes that haven't ended
--   last_class_date their latest class with a booking that counts
--   is_me           true for the admin who is asking (the page hides the
--                   buttons on that row; the functions below refuse it anyway)
create or replace function public.admin_list_users(
  p_search text    default null,
  p_role   text    default null,
  p_limit  integer default 200
)
returns table (
  user_id         uuid,
  full_name       text,
  email           text,
  mobile          text,
  instagram       text,
  role            public.user_role,
  is_active       boolean,
  created_at      timestamptz,
  bookings        integer,
  upcoming        integer,
  last_class_date date,
  is_me           boolean,
  total_matches   integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me     uuid    := public.require_admin();
  v_search text    := nullif(btrim(p_search), '');
  v_role   text    := nullif(btrim(p_role), '');
  v_limit  integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_like   text;
  v_digits text;
begin
  if v_role is not null and v_role not in ('client', 'admin') then
    raise exception 'Please choose clients, admins or everyone.';
  end if;
  if v_search is not null then
    v_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digits := regexp_replace(v_search, '\D', '', 'g');
    if length(v_digits) >= 10 then
      v_digits := right(v_digits, 10);  -- "0917..." also finds "+63 917..."
    end if;
  end if;

  return query
  select
    p.id, nullif(btrim(p.full_name), ''), p.email, p.mobile, p.instagram, p.role, p.is_active, p.created_at,
    st.bookings, st.upcoming, st.last_date,
    p.id = v_me,
    (count(*) over ())::integer
  from public.profiles p
  cross join lateral (
    select
      count(*) filter (where not (b.status = 'expired' or (b.status = 'pending_payment' and b.hold_expires_at <= now())))::integer as bookings,
      count(*) filter (
        where public.at_manila(s.date, s.end_time) > now()
          and (b.status in ('confirmed', 'awaiting_verification', 'paid_needs_action')
               or (b.status = 'pending_payment' and b.hold_expires_at > now()))
      )::integer as upcoming,
      max(s.date) filter (where b.status not in ('expired', 'pending_payment')) as last_date
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    where b.user_id = p.id
  ) st
  where (v_role is null or p.role::text = v_role)
    and (
      v_search is null
      or coalesce(p.full_name, '') ilike v_like
      or coalesce(p.email, '') ilike v_like
      or (length(v_digits) >= 4 and regexp_replace(coalesce(p.mobile, ''), '\D', '', 'g') like '%' || v_digits || '%')
    )
  order by lower(coalesce(nullif(btrim(p.full_name), ''), p.email)), p.created_at
  limit v_limit;
end;
$$;


-- Deactivates or reactivates someone's account.
-- A deactivated account can't log in to private pages or book (it's logged
-- out the next time it opens one). Bookings and payments are kept.
-- Takes: the user id and true (active) or false (deactivated).
-- Gives back: the saved value. An admin can't change their OWN account here.
create or replace function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_admin();
begin
  if p_active is null then
    raise exception 'Please choose active or deactivated.';
  end if;
  if p_user_id = v_me then
    raise exception 'You can''t deactivate or reactivate your own account.';
  end if;

  update public.profiles p set is_active = p_active where p.id = p_user_id;
  if not found then
    raise exception 'Sorry, we couldn''t find that account.';
  end if;
  return p_active;
end;
$$;


-- Makes someone an admin, or changes an admin back to a client.
-- Takes: the user id and 'admin' or 'client'.
-- Gives back: the saved role. An admin can't change their OWN role (so the
-- cafe can never lock itself out by mistake).
create or replace function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns public.user_role
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.require_admin();
begin
  if p_role is null then
    raise exception 'Please choose client or admin.';
  end if;
  if p_user_id = v_me then
    raise exception 'You can''t change your own role. Ask another admin.';
  end if;

  update public.profiles p set role = p_role where p.id = p_user_id;
  if not found then
    raise exception 'Sorry, we couldn''t find that account.';
  end if;
  return p_role;
end;
$$;


-- The profile guard trigger from migration 2, with ONE new rule.
-- Old rule: a browser user who is not an active admin can't change role or
-- is_active.
-- NEW rule: an admin using the browser can't change their OWN role or
-- is_active either (not even with a direct update), so nobody can remove
-- their own admin rights or deactivate themselves by mistake.
-- Database functions and the SQL Editor run as a different role and are not
-- affected (e.g. deactivate_my_account() for clients still works).
-- Takes: the old and new profiles row. Gives back: the new row, or an error.
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active)
     -- The browser's requests run as 'anon' or 'authenticated'
     and current_user in ('anon', 'authenticated')
  then
    if not public.is_admin() then
      raise exception 'Only an admin can change role or is_active'
        using errcode = '42501';
    end if;
    if old.id = auth.uid() then
      raise exception 'You can''t change your own role or active status.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;


-- =============================================================================
-- 7. STORAGE: photo bucket and payment screenshot bucket
-- =============================================================================

-- The two buckets. "on conflict ... do update" keeps this safe to run again.
--   site-images          public: anyone can SEE a photo by its web address
--   payment-screenshots  private: files can only be opened through a policy
-- Both: images only (JPEG, PNG, WebP; screenshots also HEIC from iPhones),
-- at most 5 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('site-images', 'site-images', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-screenshots', 'payment-screenshots', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- site-images: only active admins may list, upload, replace or delete files.
-- (Seeing a photo needs no policy: the bucket is public.)
create policy "Admins list site images"
  on storage.objects for select to authenticated
  using (bucket_id = 'site-images' and (select public.is_admin()));

create policy "Admins upload site images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'site-images' and (select public.is_admin()));

create policy "Admins replace site images"
  on storage.objects for update to authenticated
  using (bucket_id = 'site-images' and (select public.is_admin()))
  with check (bucket_id = 'site-images' and (select public.is_admin()));

create policy "Admins delete site images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'site-images' and (select public.is_admin()));

-- payment-screenshots: only active admins may open them (the Payments page
-- makes a 10-minute link with this right). Clients get an upload policy for
-- their OWN folder in Step 12.
create policy "Admins read payment screenshots"
  on storage.objects for select to authenticated
  using (bucket_id = 'payment-screenshots' and (select public.is_admin()));


-- =============================================================================
-- 8. THE ADMIN CANCELS OR TRANSFERS ONE BOOKING (booking details page)
-- =============================================================================
-- The admin can cancel or move ONE booking for a client (for example the
-- client messaged the cafe). By default the admin follows the same
-- cancellation table as clients (CLAUDE.md section 5). The admin may choose a
-- DIFFERENT outcome (an "override", e.g. a 50% code less than 12 hours before
-- class) only by writing a reason. Every admin change is saved in
-- booking_admin_actions: who, when, what, what the normal rule was, and the
-- reason.
-- Two things never change, even with a reason:
--   - a transfer still needs a free seat in an open class (no overbooking)
--   - walk-ins have no account, so they can't get a personal 50% code


-- -----------------------------------------------------------------------------
-- TABLE: booking_admin_actions
-- One row = one cancel or transfer the ADMIN did on one booking.
-- A separate table (not columns on bookings) so the notes stay private:
-- clients may read their own bookings rows, but never this table.
-- Rows are only added by admin_cancel_booking / admin_transfer_booking.
-- -----------------------------------------------------------------------------
create table public.booking_admin_actions (
  -- Random unique id for the row.
  id             uuid primary key default gen_random_uuid(),
  -- The booking the admin cancelled or moved.
  booking_id     uuid not null references public.bookings (id) on delete cascade,
  -- For a transfer: the new booking in the new class.
  new_booking_id uuid references public.bookings (id) on delete set null,
  -- What the admin did:
  --   'transfer'          moved to another class
  --   'cancel_voucher'    cancelled, with a personal 50% code
  --   'cancel_no_credit'  cancelled, no credit
  action         text not null
                 constraint booking_admin_actions_action_check
                 check (action in ('transfer', 'cancel_voucher', 'cancel_no_credit')),
  -- What the cancellation rules said at that moment (a word from
  -- admin_change_rule below, e.g. 'voucher' or 'late_payment').
  normal_rule    text not null,
  -- true = the admin chose something the normal rule doesn't give.
  overridden     boolean not null,
  -- The admin's reason. Required for an override, optional otherwise.
  note           text,
  -- The 50% code made by a 'cancel_voucher', if any.
  voucher_id     uuid references public.vouchers (id) on delete set null,
  -- Which admin did it. (Kept as empty if that profile is ever deleted.)
  admin_id       uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),

  -- An override must have a reason.
  constraint booking_admin_actions_override_needs_note
    check (not overridden or nullif(btrim(note), '') is not null),
  -- Notes are short (the page allows 500 characters).
  constraint booking_admin_actions_note_length check (note is null or length(note) <= 500)
);

comment on table public.booking_admin_actions is 'Admin cancels / transfers of one booking, with the normal rule, override flag and reason. Admins only.';

-- "What did the admin do to this booking?" (booking details page)
create index booking_admin_actions_booking_idx on public.booking_admin_actions (booking_id);
create index booking_admin_actions_new_booking_idx on public.booking_admin_actions (new_booking_id);

-- RLS on, like every other table.
alter table public.booking_admin_actions enable row level security;

-- Grants: guests nothing. Logged-in users may only TRY to read (the policy
-- below lets admins only). Nobody adds, changes or deletes rows from the
-- browser; the two functions below add them.
revoke all on table public.booking_admin_actions from anon, authenticated;
grant select on table public.booking_admin_actions to authenticated;
grant all on table public.booking_admin_actions to service_role;

-- READ: active admins only.
create policy "Admins read booking admin actions"
  on public.booking_admin_actions
  for select
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- admin_change_rule(...)   PRIVATE
-- -----------------------------------------------------------------------------

-- What the cancellation rules say for one booking right now, from the
-- ADMIN's side. The same words as change_rule() (migration 8), plus one more:
--   'late_payment'  the booking is 'paid_needs_action' (paid after the hold
--                   ended and the class was full). The cafe has to sort it
--                   out, so a transfer is the normal choice at any time.
-- Takes: the booking status, the class date, start time and status, and the
-- booking's transferred_from.
-- Gives back: one word (see change_rule in migration 8 for the others).
create or replace function public.admin_change_rule(
  p_booking_status   public.booking_status,
  p_date             date,
  p_start_time       time,
  p_session_status   public.session_status,
  p_transferred_from uuid
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_booking_status = 'paid_needs_action' then 'late_payment'
    else public.change_rule(p_date, p_start_time, p_session_status, p_transferred_from)
  end;
$$;


-- -----------------------------------------------------------------------------
-- admin_normal_action(rule)   PRIVATE
-- -----------------------------------------------------------------------------

-- What the admin may do WITHOUT a reason, for one rule word.
-- Takes: a word from admin_change_rule().
-- Gives back:
--   'transfer'          for 'transfer', 'free_transfer' and 'late_payment'
--   'cancel_voucher'    for 'voucher'      (12 to 24 hours before class)
--   'cancel_no_credit'  for 'no_credit'    (less than 12 hours before class)
--   null                for 'already_transferred' and 'started': the rules
--                       allow nothing, so ANY change needs a reason
create or replace function public.admin_normal_action(p_rule text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_rule in ('transfer', 'free_transfer', 'late_payment') then 'transfer'
    when p_rule = 'voucher' then 'cancel_voucher'
    when p_rule = 'no_credit' then 'cancel_no_credit'
    else null
  end;
$$;


-- -----------------------------------------------------------------------------
-- admin_booking_change_info(booking_id)
-- -----------------------------------------------------------------------------

-- What the admin may do with one booking, for the Cancel / Transfer box on
-- the booking details page, plus every admin change made to it so far.
-- Takes: the booking id.
-- Gives back: one row (no rows if the id doesn't exist) with:
--   can_change       true if the booking is 'confirmed' or 'paid_needs_action'
--                    (the only ones the admin can cancel or move here)
--   rule             what the rules say now (admin_change_rule); empty when
--                    can_change is false
--   normal_action    what the admin may do without a reason
--                    (admin_normal_action); empty = everything needs a reason
--   voucher_allowed  false for walk-ins (no account to give a code to)
--   actions          a JSON list of the admin changes to this booking (as the
--                    old booking or as the new one after a transfer), newest
--                    first. Each has: id, action, normal_rule, overridden,
--                    note, admin_name, created_at, booking_id,
--                    new_booking_id, voucher_code.
create or replace function public.admin_booking_change_info(p_booking_id uuid)
returns table (
  can_change      boolean,
  rule            text,
  normal_action   text,
  voucher_allowed boolean,
  actions         jsonb
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
    x.can_change,
    case when x.can_change then x.rule end,
    case when x.can_change then public.admin_normal_action(x.rule) end,
    x.user_id is not null,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'action', a.action,
          'normal_rule', a.normal_rule,
          'overridden', a.overridden,
          'note', a.note,
          'admin_name', coalesce(nullif(btrim(ap.full_name), ''), ap.email),
          'created_at', a.created_at,
          'booking_id', a.booking_id,
          'new_booking_id', a.new_booking_id,
          'voucher_code', v.code
        )
        order by a.created_at desc
      )
      from public.booking_admin_actions a
      left join public.profiles ap on ap.id = a.admin_id
      left join public.vouchers v on v.id = a.voucher_id
      where a.booking_id = x.id or a.new_booking_id = x.id
    ), '[]'::jsonb)
  from (
    select
      b.id,
      b.user_id,
      b.status in ('confirmed', 'paid_needs_action') as can_change,
      public.admin_change_rule(b.status, s.date, s.start_time, s.status, b.transferred_from) as rule
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    where b.id = p_booking_id
  ) x;
end;
$$;


-- -----------------------------------------------------------------------------
-- admin_cancel_booking(booking_id, outcome, note)
-- -----------------------------------------------------------------------------

-- The admin cancels ONE confirmed (or late-paid) booking.
-- Takes:
--   p_booking_id  the booking
--   p_outcome     'voucher'   -> 'cancelled_with_voucher' + a personal 50% code
--                               (class fee only, 60 days, one use), like a client
--                               cancelling 12 to 24 hours before class
--                 'no_credit' -> 'forfeited', no credit
--   p_note        the reason (up to 500 characters). REQUIRED when the outcome
--                 is not what the rules give right now (an override);
--                 optional otherwise.
-- Walk-ins can't get a 50% code (no account). No cash refunds are made here;
-- if the cafe refunds a late payment, that happens outside the website.
-- Gives back: the new status, the voucher code and expiry (empty for
-- 'no_credit'), and whether it was an override.
create or replace function public.admin_cancel_booking(
  p_booking_id uuid,
  p_outcome    text,
  p_note       text default null
)
returns table (
  new_status         public.booking_status,
  voucher_code       text,
  voucher_expires_at timestamptz,
  overridden         boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_admin_id   uuid := public.require_admin();
  v_note       text := nullif(btrim(p_note), '');
  v_booking    public.bookings%rowtype;
  v_session    public.class_sessions%rowtype;
  v_rule       text;
  v_action     text;
  v_overridden boolean;
  v_status     public.booking_status;
  v_code       text;
  v_voucher_id uuid;
  v_expires_at timestamptz;
begin
  if p_outcome is null or p_outcome not in ('voucher', 'no_credit') then
    raise exception 'Please choose "50%% voucher" or "no credit".';
  end if;
  if length(v_note) > 500 then
    raise exception 'Please keep the reason to 500 characters or less.';
  end if;

  -- Lock the booking so it can't be cancelled and transferred at the same time
  -- (by the client and the admin, or two admins).
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;

  if v_booking.status not in ('confirmed', 'paid_needs_action') then
    raise exception 'Only confirmed bookings and late payments can be cancelled here. (For a payment that is still being checked, approve or reject it in Payments.)';
  end if;

  select s.* into v_session from public.class_sessions s where s.id = v_booking.session_id;

  -- What do the rules say right now, and is this an override?
  v_rule := public.admin_change_rule(v_booking.status, v_session.date, v_session.start_time,
                                     v_session.status, v_booking.transferred_from);
  v_action := 'cancel_' || p_outcome;
  v_overridden := public.admin_normal_action(v_rule) is distinct from v_action;

  if v_overridden and v_note is null then
    raise exception 'This isn''t what the cancellation rules give for this booking right now, so please write a reason. It is saved with the booking.';
  end if;

  if p_outcome = 'voucher' then
    if v_booking.user_id is null then
      raise exception 'Walk-ins have no account, so they can''t get a 50%% code. Choose "no credit", or transfer them instead.';
    end if;

    -- Make a random code like HALF-3F9A1C (same as cancel_my_booking). If it
    -- happens to exist already (very unlikely), try another one.
    loop
      v_code := 'HALF-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
      begin
        insert into public.vouchers (code, percent_off, owner_id, source, uses_left, expires_at)
        values (v_code, 50, v_booking.user_id, 'cancellation', 1, now() + interval '60 days')
        returning id, expires_at into v_voucher_id, v_expires_at;
        exit;  -- saved, leave the loop
      exception when unique_violation then
        -- that code is taken, loop and try a new one
      end;
    end loop;
    v_status := 'cancelled_with_voucher';
  else
    v_status := 'forfeited';
  end if;

  update public.bookings b set status = v_status where b.id = v_booking.id;

  -- Save who did it, what the rule was, and the reason.
  insert into public.booking_admin_actions (booking_id, action, normal_rule, overridden, note, voucher_id, admin_id)
  values (v_booking.id, v_action, v_rule, v_overridden, v_note, v_voucher_id, v_admin_id);

  return query select v_status, v_code, v_expires_at, v_overridden;
end;
$$;


-- -----------------------------------------------------------------------------
-- admin_transfer_booking(booking_id, new_session_id, note)
-- -----------------------------------------------------------------------------

-- The admin moves ONE confirmed (or late-paid) booking to another class,
-- like transfer_my_booking() does for clients, but:
--   - the 24-hour and "only once" rules can be skipped WITH a reason
--     (no reason needed for a normal transfer, a cafe-cancelled class, or a
--     late payment)
--   - the online cutoff doesn't apply (like walk-ins), so the admin can move
--     someone into a class later today, as long as it hasn't ended
--   - it works for walk-ins too
-- Never skipped: the new class must be open, not ended, have a free seat
-- (both classes are LOCKED, so two people can't get the last seat), and the
-- client must not already be in it.
-- The old booking becomes 'transferred'. A new 'confirmed' booking is made
-- with the same inclusions and amounts and points back to the old one
-- (transferred_from). No new payment. A late payment becomes a normal
-- confirmed booking in the new class.
-- Takes: the booking id, the new class id, and the reason (optional unless
-- it's an override; up to 500 characters).
-- Gives back: the new booking's id and whether it was an override.
create or replace function public.admin_transfer_booking(
  p_booking_id     uuid,
  p_new_session_id uuid,
  p_note           text default null
)
returns table (
  new_booking_id uuid,
  overridden     boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_admin_id    uuid := public.require_admin();
  v_note        text := nullif(btrim(p_note), '');
  v_booking     public.bookings%rowtype;
  v_old         public.class_sessions%rowtype;
  v_new         public.class_sessions%rowtype;
  v_rule        text;
  v_overridden  boolean;
  v_new_booking uuid;
begin
  if length(v_note) > 500 then
    raise exception 'Please keep the reason to 500 characters or less.';
  end if;

  -- Lock the booking so it can't be cancelled and transferred at the same time.
  select b.* into v_booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'Sorry, we couldn''t find that booking.';
  end if;

  if v_booking.status = 'transferred' then
    raise exception 'This booking has already been transferred.';
  elsif v_booking.status not in ('confirmed', 'paid_needs_action') then
    raise exception 'Only confirmed bookings and late payments can be transferred.';
  end if;

  if p_new_session_id is null or p_new_session_id = v_booking.session_id then
    raise exception 'Please pick a different class.';
  end if;

  -- LOCK both classes, smallest id first (same order as transfer_my_booking),
  -- so two transfers going opposite ways can't get stuck waiting for each other.
  perform 1
  from public.class_sessions s
  where s.id in (v_booking.session_id, p_new_session_id)
  order by s.id
  for update;

  select s.* into v_old from public.class_sessions s where s.id = v_booking.session_id;
  select s.* into v_new from public.class_sessions s where s.id = p_new_session_id;

  if v_new.id is null then
    raise exception 'Sorry, we couldn''t find the class you picked.';
  end if;

  -- What do the rules say right now, and is this an override?
  v_rule := public.admin_change_rule(v_booking.status, v_old.date, v_old.start_time,
                                     v_old.status, v_booking.transferred_from);
  v_overridden := public.admin_normal_action(v_rule) is distinct from 'transfer';

  if v_overridden and v_note is null then
    raise exception 'The transfer rules don''t allow this booking to move right now (more than 24 hours before class, once only), so please write a reason. It is saved with the booking.';
  end if;

  -- The new class must still take people. (These are never skipped.)
  if v_new.status <> 'open' then
    raise exception 'The class you picked is not open. Open it in Schedule first, or pick another.';
  end if;
  if now() >= public.at_manila(v_new.date, v_new.end_time) then
    raise exception 'The class you picked has already ended.';
  end if;
  if v_booking.user_id is not null and public.my_seat_status(v_booking.user_id, v_new.id) is not null then
    raise exception 'This client already has a booking in the class you picked.';
  end if;
  if public.seats_taken(v_new.id) >= v_new.capacity then
    raise exception 'The class you picked is full. Add a seat in Schedule first, or pick another.';
  end if;

  -- Old booking gives up its seat.
  update public.bookings b set status = 'transferred' where b.id = v_booking.id;

  -- New booking: same person, inclusions and amounts, already paid, so 'confirmed'.
  -- (Payments stay on the old booking; transferred_from connects them. The
  -- voucher trigger skips it because transferred_from is set.)
  insert into public.bookings (
    session_id, user_id, walkin_name, walkin_contact, status, mat_rental, drink_choice, voucher_id,
    class_fee, mat_fee, discount, total,
    first_time, health_notes, not_pregnant_confirmed, agreed_at, transferred_from
  )
  values (
    v_new.id, v_booking.user_id, v_booking.walkin_name, v_booking.walkin_contact, 'confirmed',
    v_booking.mat_rental, v_booking.drink_choice, v_booking.voucher_id,
    v_booking.class_fee, v_booking.mat_fee, v_booking.discount, v_booking.total,
    v_booking.first_time, v_booking.health_notes, v_booking.not_pregnant_confirmed, v_booking.agreed_at,
    v_booking.id
  )
  returning id into v_new_booking;

  -- Save who did it, what the rule was, and the reason.
  insert into public.booking_admin_actions (booking_id, new_booking_id, action, normal_rule, overridden, note, admin_id)
  values (v_booking.id, v_new_booking, 'transfer', v_rule, v_overridden, v_note, v_admin_id);

  return query select v_new_booking, v_overridden;
end;
$$;


-- =============================================================================
-- Who may call what (same pattern as the earlier migrations)
-- =============================================================================

-- Take every right away first (Supabase gives all roles every new function).
-- ("create or replace" keeps the old grants of find_usable_voucher, which
-- stays private, and of the trigger function.)
revoke all on function
  public.admin_update_settings(jsonb),
  public.admin_create_promo(text, numeric, integer, date),
  public.admin_set_promo_enabled(uuid, boolean),
  public.admin_list_vouchers(),
  public.admin_list_payments(text, text, text, date, date, text, integer),
  public.admin_earnings(date, date),
  public.admin_update_session(uuid, integer, public.session_status),
  public.admin_list_users(text, text, integer),
  public.admin_set_user_active(uuid, boolean),
  public.admin_set_user_role(uuid, public.user_role),
  public.admin_booking_change_info(uuid),
  public.admin_cancel_booking(uuid, text, text),
  public.admin_transfer_booking(uuid, uuid, text)
from public, anon, authenticated, service_role;

-- The two small rule helpers are private (only our functions use them).
revoke all on function
  public.admin_change_rule(public.booking_status, date, time, public.session_status, uuid),
  public.admin_normal_action(text)
from public, anon, authenticated, service_role;

-- Logged-in users may call them; each checks is_admin() inside.
grant execute on function
  public.admin_update_settings(jsonb),
  public.admin_create_promo(text, numeric, integer, date),
  public.admin_set_promo_enabled(uuid, boolean),
  public.admin_list_vouchers(),
  public.admin_list_payments(text, text, text, date, date, text, integer),
  public.admin_earnings(date, date),
  public.admin_update_session(uuid, integer, public.session_status),
  public.admin_list_users(text, text, integer),
  public.admin_set_user_active(uuid, boolean),
  public.admin_set_user_role(uuid, public.user_role),
  public.admin_booking_change_info(uuid),
  public.admin_cancel_booking(uuid, text, text),
  public.admin_transfer_booking(uuid, uuid, text)
to authenticated;


-- Short descriptions that show up in the Supabase dashboard.
comment on function public.admin_update_settings(jsonb) is 'Admin: save settings after checking each value (prices, hold, cutoff, links, drinks, contact details).';
comment on function public.admin_create_promo(text, numeric, integer, date) is 'Admin: create a promo code (percent off the class fee, total uses, last day).';
comment on function public.admin_set_promo_enabled(uuid, boolean) is 'Admin: turn a promo code off or back on.';
comment on function public.admin_list_vouchers() is 'Admin: every promo and personal voucher with uses, state and owner.';
comment on function public.admin_list_payments(text, text, text, date, date, text, integer) is 'Admin: payments with filters, plus the review (manual transfers) and late-payment views.';
comment on function public.admin_earnings(date, date) is 'Admin: paid money by day and method, with the mat rental part.';
comment on function public.admin_update_session(uuid, integer, public.session_status) is 'Admin: change one dated class''s seats or open / close it (never below seats taken).';
comment on function public.admin_list_users(text, text, integer) is 'Admin: accounts with search and booking counts.';
comment on function public.admin_set_user_active(uuid, boolean) is 'Admin: deactivate or reactivate someone else''s account.';
comment on function public.admin_set_user_role(uuid, public.user_role) is 'Admin: make someone else an admin or a client.';
comment on function public.admin_booking_change_info(uuid) is 'Admin: what the rules allow for one booking now, and the admin changes made to it.';
comment on function public.admin_cancel_booking(uuid, text, text) is 'Admin: cancel one booking (50% code or no credit); a different outcome than the rules needs a reason.';
comment on function public.admin_transfer_booking(uuid, uuid, text) is 'Admin: move one booking to another open class with a free seat; skipping the 24h / once rules needs a reason.';
