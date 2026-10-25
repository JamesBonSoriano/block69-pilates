-- =============================================================================
-- Migration 20: Version 1.4 admin part 2, Users and Communications.
--
-- The admin Users pages (Version 1.4, PDF pages 25-26) no longer deactivate
-- people or make admins (admins are set with SQL). Instead the admin can:
--   - list clients with search, sort (A-Z or newest) and pages
--   - VIEW one client: contact details, sessions booked, money spent, mat
--     rentals, last and next class, recent bookings
--   - EDIT one client's name, mobile, Instagram and birthday (never the email
--     or the role)
--   - send one client an email message, or resend a booking confirmation,
--     and see the history of what was sent (the Communications page)
--
-- What this file does:
--   1. A new table, communications: one row per email the admin sent to a
--      client (who, what, sent or failed). Admins can READ it; nobody can
--      write it from the website except through the functions below.
--   2. admin_list_users(): now also takes a sort ('name' or 'newest') and an
--      offset, for pages of 10.
--   3. admin_get_user(): one client's details and totals (View user).
--   4. admin_user_bookings(): one client's bookings, newest class first.
--   5. admin_update_user(): saves name, mobile, Instagram, birthday, with the
--      same rules as sign-up (11-digit mobile starting with 09, a real past
--      birthday).
--   6. admin_start_message() / admin_finish_message(): the server asks to
--      start an email (it is checked and logged as 'sending', and the
--      database gives back the client's email address), sends it with
--      Gmail, then marks it 'sent' or 'failed'.
--
-- Why the email is sent by our server and not the database: the Gmail
-- password lives only in the server's settings (.env.local / Vercel).
-- Every function starts with require_admin(), so a client gets
-- "Only admins can do this." (tests: supabase/tests/22-admin-users.test.mjs).
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website: src/app/admin/(panel)/users/ and src/lib/admin/user-actions.ts.
-- =============================================================================


-- =============================================================================
-- 1. TABLE: communications
-- One row = one email the admin sent (or tried to send) to one client.
-- Rows are added by admin_start_message() and finished by
-- admin_finish_message(); nothing else changes them.
-- =============================================================================
create table public.communications (
  -- Random unique id for the message.
  id          uuid primary key default gen_random_uuid(),
  -- Which client it went to (empty if that account was removed later).
  user_id     uuid references public.profiles (id) on delete set null,
  -- Which booking it was about (only for a resent confirmation, or empty).
  booking_id  uuid references public.bookings (id) on delete set null,
  -- 'message' = a message the admin typed; 'confirmation' = a booking
  -- confirmation sent again.
  kind        text not null,
  -- The address it was sent to (copied, so the history stays right even if
  -- the client changes their email later).
  to_email    text not null,
  -- The subject line and the text of the email.
  subject     text not null,
  body        text not null,
  -- 'sending' while our server sends it, then 'sent' or 'failed'.
  status      text not null default 'sending',
  -- Why it failed, in short (only for 'failed').
  error       text,
  -- Which admin sent it.
  sent_by     uuid references public.profiles (id) on delete set null,
  -- When the admin pressed Send, and when the sending finished.
  created_at  timestamptz not null default now(),
  finished_at timestamptz,

  constraint communications_kind_check check (kind in ('message', 'confirmation')),
  constraint communications_status_check check (status in ('sending', 'sent', 'failed')),
  constraint communications_subject_length check (char_length(subject) between 1 and 150),
  constraint communications_body_length check (char_length(body) between 1 and 5000)
);

comment on table public.communications is
  'Emails the admin sent to one client (messages, resent confirmations). Admins read only; written by admin_start_message / admin_finish_message.';

-- "Show this client's messages, newest first" (the Communications page).
create index communications_user_id_idx on public.communications (user_id, created_at desc);

-- Row Level Security on, like every table.
alter table public.communications enable row level security;

-- Grants: logged-in users may only try to READ (the policy below then
-- allows admins only). No insert / update / delete from the website at all:
-- the admin functions below write the rows.
revoke all on table public.communications from anon, authenticated;
grant select on table public.communications to authenticated;
-- Our server code (secret key) keeps full access.
grant all on table public.communications to service_role;

-- READ: active admins only. Clients can't see the log, not even their own rows.
create policy "Admins read communications"
  on public.communications
  for select
  to authenticated
  using ((select public.is_admin()));


-- =============================================================================
-- 2. admin_list_users(): sort and pages
-- =============================================================================

-- The old version (migration 10) had no sort or offset. A function's inputs
-- can't be changed with "create or replace", so it is dropped and made again.
drop function if exists public.admin_list_users(text, text, integer);

-- Lists accounts for the admin, with search, sort and pages.
-- Takes (all optional):
--   p_search  name, email, or 4+ digits of the mobile
--   p_role    'client' or 'admin' (empty = everyone)
--   p_limit   how many rows (default 200, at most 500)
--   p_offset  how many rows to skip (for page 2, 3, ...; default 0)
--   p_sort    'name' (A-Z, the default) or 'newest' (newest account first)
-- Gives back: one row per account with the counts from migration 10
-- (bookings, upcoming, last_class_date, is_me) and total_matches = how many
-- accounts match in all (for "Showing 11-20 of 34").
create or replace function public.admin_list_users(
  p_search text    default null,
  p_role   text    default null,
  p_limit  integer default 200,
  p_offset integer default 0,
  p_sort   text    default 'name'
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
  v_sort   text    := coalesce(nullif(btrim(p_sort), ''), 'name');
  v_limit  integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_like   text;
  v_digits text;
begin
  if v_role is not null and v_role not in ('client', 'admin') then
    raise exception 'Please choose clients, admins or everyone.';
  end if;
  if v_sort not in ('name', 'newest') then
    raise exception 'Please sort by name or by newest.';
  end if;
  if v_search is not null then
    -- Escape the search's own % and _ so they are matched as plain letters
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
    -- How many accounts match in all (before the page is cut out)
    (count(*) over ())::integer
  from public.profiles p
  cross join lateral (
    select
      -- Bookings that count (not expired or ended unpaid holds)
      count(*) filter (where not (b.status = 'expired' or (b.status = 'pending_payment' and b.hold_expires_at <= now())))::integer as bookings,
      -- Seat-holding bookings in classes that haven't ended
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
  order by
    -- 'newest': newest account first; 'name': A-Z (no name = by email)
    case when v_sort = 'newest' then p.created_at end desc,
    lower(coalesce(nullif(btrim(p.full_name), ''), p.email)),
    p.created_at,
    p.id
  limit v_limit
  offset v_offset;
end;
$$;


-- =============================================================================
-- 3. admin_get_user(user_id): the View user page
-- =============================================================================

-- One account's details and totals for the admin.
-- Takes: the user id.
-- Gives back: one row, or NO rows if the account doesn't exist:
--   the profile (name, email, mobile, Instagram, birthday, role, active,
--     is_deleted, created_at = "member since")
--   sessions_booked   bookings that count: not expired, not an ended unpaid
--                     hold, and not 'transferred' (the moved booking counts
--                     instead, so a transfer isn't counted twice)
--   sessions_attended bookings marked attended
--   upcoming          seat-holding bookings in classes that haven't ended
--   mat_rentals       counted bookings with a mat
--   payments_count / total_spent   PAID payments and their total (pesos)
--   last_class_*      the latest counted class that has already started
--   next_class_*      the next seat-holding class that hasn't started
--   last_payment_*    the latest paid payment (amount and when)
create or replace function public.admin_get_user(p_user_id uuid)
returns table (
  user_id             uuid,
  full_name           text,
  email               text,
  mobile              text,
  instagram           text,
  birthday            date,
  role                public.user_role,
  is_active           boolean,
  is_deleted          boolean,
  created_at          timestamptz,
  sessions_booked     integer,
  sessions_attended   integer,
  upcoming            integer,
  mat_rentals         integer,
  payments_count      integer,
  total_spent         numeric,
  last_class_date     date,
  last_class_time     time,
  next_class_date     date,
  next_class_time     time,
  last_payment_amount numeric,
  last_payment_at     timestamptz
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
  with counted as (
    -- This person's bookings that count (see above), with their class
    select b.id, b.status, b.mat_rental, b.hold_expires_at, s.date, s.start_time, s.end_time
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    where b.user_id = p_user_id
      and b.status not in ('expired', 'transferred')
      and not (b.status = 'pending_payment' and b.hold_expires_at <= now())
  ),
  paid as (
    -- Their PAID payments (a transfer keeps the payment on the original
    -- booking, which is also theirs, so this finds it)
    select pay.amount, pay.paid_at
    from public.payments pay
    join public.bookings b on b.id = pay.booking_id
    where b.user_id = p_user_id
      and pay.status = 'paid'
  ),
  last_class as (
    select c.date, c.start_time from counted c
    where public.at_manila(c.date, c.start_time) <= now()
    order by c.date desc, c.start_time desc
    limit 1
  ),
  next_class as (
    select c.date, c.start_time from counted c
    where public.at_manila(c.date, c.start_time) > now()
      and (c.status in ('confirmed', 'awaiting_verification', 'paid_needs_action')
           or (c.status = 'pending_payment' and c.hold_expires_at > now()))
    order by c.date, c.start_time
    limit 1
  ),
  last_payment as (
    select x.amount, x.paid_at from paid x
    order by x.paid_at desc nulls last
    limit 1
  )
  select
    p.id,
    nullif(btrim(p.full_name), ''),
    nullif(p.email, ''),
    p.mobile,
    p.instagram,
    p.birthday,
    p.role,
    p.is_active,
    p.deleted_at is not null,
    p.created_at,
    (select count(*)::integer from counted),
    (select count(*)::integer from counted c where c.status = 'attended'),
    (select count(*)::integer from counted c
      where public.at_manila(c.date, c.end_time) > now()
        and (c.status in ('confirmed', 'awaiting_verification', 'paid_needs_action')
             or (c.status = 'pending_payment' and c.hold_expires_at > now()))),
    (select count(*)::integer from counted c where c.mat_rental),
    (select count(*)::integer from paid),
    (select coalesce(sum(x.amount), 0) from paid x),
    (select lc.date from last_class lc),
    (select lc.start_time from last_class lc),
    (select nc.date from next_class nc),
    (select nc.start_time from next_class nc),
    (select lp.amount from last_payment lp),
    (select lp.paid_at from last_payment lp)
  from public.profiles p
  where p.id = p_user_id;
end;
$$;


-- =============================================================================
-- 4. admin_user_bookings(user_id, limit): recent bookings of one person
-- =============================================================================

-- One person's bookings for the admin (View user, Communications).
-- Left out: expired holds and unpaid holds that ended (nothing happened).
-- Takes: the user id and how many (default 20, at most 100).
-- Gives back: one row per booking, newest class first, with:
--   the class (date, times, class status), the booking status, mat, total
--   paid_amount  PAID money for it (also on the booking it was moved from)
--   class_ended  true once the class is over
create or replace function public.admin_user_bookings(p_user_id uuid, p_limit integer default 20)
returns table (
  booking_id     uuid,
  date           date,
  start_time     time,
  end_time       time,
  session_status public.session_status,
  status         public.booking_status,
  mat_rental     boolean,
  total          numeric,
  paid_amount    numeric,
  class_ended    boolean
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
    s.date,
    s.start_time,
    s.end_time,
    s.status,
    b.status,
    b.mat_rental,
    b.total,
    coalesce((
      select sum(pay.amount)
      from public.payments pay
      where pay.booking_id in (select public.booking_family(b.id))
        and pay.status = 'paid'
    ), 0),
    now() >= public.at_manila(s.date, s.end_time)
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  where b.user_id = p_user_id
    and b.status <> 'expired'
    and not (b.status = 'pending_payment' and b.hold_expires_at <= now())
  order by s.date desc, s.start_time desc, b.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;


-- =============================================================================
-- 5. admin_update_user(): Edit user
-- =============================================================================

-- Saves a client's name, mobile, Instagram and birthday (Edit user).
-- The email and the role are NOT here on purpose: the email changes only
-- through the client's own verified email change, and admins are set with SQL.
-- Takes: the user id, full name, mobile, Instagram (with or without "@",
-- empty = none) and birthday (empty = none).
-- Gives back: nothing. Refuses (plain English): non-admins, accounts that
-- don't exist or were deleted, admin accounts, and values that break the
-- sign-up rules:
--   name      1 to 120 characters (double spaces are squashed)
--   mobile    11 digits starting with 09 (spaces and dashes are taken out)
--   Instagram letters, numbers, dots and underscores, up to 30
--   birthday  a real date from 1900 up to today (Philippine date)
create or replace function public.admin_update_user(
  p_user_id   uuid,
  p_full_name text,
  p_mobile    text,
  p_instagram text,
  p_birthday  date
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name      text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_mobile    text := regexp_replace(coalesce(p_mobile, ''), '[\s-]', '', 'g');
  v_instagram text := nullif(regexp_replace(btrim(coalesce(p_instagram, '')), '^@', ''), '');
  v_target    public.profiles%rowtype;
begin
  perform public.require_admin();

  -- Lock the account's row while it is checked and saved
  select * into v_target from public.profiles p where p.id = p_user_id for update;
  if not found or v_target.deleted_at is not null then
    raise exception 'We couldn''t find that account. It may have been deleted.';
  end if;
  if v_target.role <> 'client' then
    raise exception 'Only client accounts can be edited here.';
  end if;

  -- The same rules as sign-up and My Profile
  if v_name = '' then
    raise exception 'Please enter the full name.';
  end if;
  if char_length(v_name) > 120 then
    raise exception 'Please use 120 characters or fewer for the name.';
  end if;
  if v_mobile !~ '^09[0-9]{9}$' then
    raise exception 'Please enter an 11-digit mobile number starting with 09, for example 0917 123 4567.';
  end if;
  if v_instagram is not null and v_instagram !~ '^[A-Za-z0-9._]{1,30}$' then
    raise exception 'Please enter just the Instagram name, for example @yourname.';
  end if;
  if p_birthday is not null
     and (p_birthday < date '1900-01-01' or p_birthday > (now() at time zone 'Asia/Manila')::date) then
    raise exception 'Please enter a real date in the past for the birthday.';
  end if;

  update public.profiles p
  set full_name = v_name,
      mobile    = v_mobile,
      instagram = v_instagram,
      birthday  = p_birthday
  where p.id = p_user_id;
end;
$$;


-- =============================================================================
-- 6. admin_start_message() / admin_finish_message(): Communications
-- =============================================================================

-- Checks and logs an email to one client BEFORE our server sends it.
-- Takes:
--   p_user_id    who gets it (a client account that wasn't deleted)
--   p_kind       'message' (typed by the admin) or 'confirmation' (resent)
--   p_subject    1 to 150 characters
--   p_body       1 to 5000 characters
--   p_booking_id needed for 'confirmation': one of THEIR confirmed or
--                attended bookings (optional for 'message', also theirs)
-- Gives back: the new message id, the address to send to, and their name.
-- The row starts as 'sending'; the server then calls admin_finish_message().
create or replace function public.admin_start_message(
  p_user_id    uuid,
  p_kind       text,
  p_subject    text,
  p_body       text,
  p_booking_id uuid default null
)
returns table (message_id uuid, to_email text, full_name text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_admin   uuid := public.require_admin();
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body    text := btrim(coalesce(p_body, ''));
  v_target  public.profiles%rowtype;
  v_status  public.booking_status;
  v_id      uuid;
begin
  if p_kind is null or p_kind not in ('message', 'confirmation') then
    raise exception 'Please choose a message or a booking confirmation.';
  end if;

  -- Who it goes to: a client account that still has an email
  select * into v_target from public.profiles p where p.id = p_user_id;
  if not found or v_target.deleted_at is not null or btrim(v_target.email) = '' then
    raise exception 'We couldn''t find that account, or it has no email address.';
  end if;
  if v_target.role <> 'client' then
    raise exception 'Messages can only be sent to client accounts.';
  end if;

  if v_subject = '' then
    raise exception 'Please type a subject.';
  end if;
  if char_length(v_subject) > 150 then
    raise exception 'Please keep the subject to 150 characters or fewer.';
  end if;
  if v_body = '' then
    raise exception 'Please type a message.';
  end if;
  if char_length(v_body) > 5000 then
    raise exception 'Please keep the message to 5000 characters or fewer.';
  end if;

  -- The booking must be THEIRS (and confirmed, for a confirmation)
  if p_booking_id is not null then
    select b.status into v_status
    from public.bookings b
    where b.id = p_booking_id and b.user_id = p_user_id;
    if not found then
      raise exception 'That booking doesn''t belong to this client.';
    end if;
  end if;
  if p_kind = 'confirmation' then
    if p_booking_id is null then
      raise exception 'Please choose which booking to send the confirmation for.';
    end if;
    if v_status not in ('confirmed', 'attended') then
      raise exception 'Only a confirmed booking has a confirmation to send.';
    end if;
  end if;

  insert into public.communications (user_id, booking_id, kind, to_email, subject, body, sent_by)
  values (p_user_id, p_booking_id, p_kind, v_target.email, v_subject, v_body, v_admin)
  returning id into v_id;

  return query select v_id, v_target.email, nullif(btrim(v_target.full_name), '');
end;
$$;


-- Marks a logged email as sent or failed, after our server tried to send it.
-- Takes: the message id, true (sent) or false (failed), and a short reason
-- when it failed (kept to 500 characters).
-- Gives back: nothing. Refuses a message that doesn't exist or was already
-- finished, so the history can't be changed afterwards.
create or replace function public.admin_finish_message(p_message_id uuid, p_sent boolean, p_error text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  update public.communications c
  set status      = case when p_sent then 'sent' else 'failed' end,
      error       = case when p_sent then null else left(coalesce(nullif(btrim(p_error), ''), 'Unknown problem'), 500) end,
      finished_at = now()
  where c.id = p_message_id
    and c.status = 'sending';

  if not found then
    raise exception 'That message was not found or is already finished.';
  end if;
end;
$$;


-- =============================================================================
-- Who may call what
-- =============================================================================

-- Logged-in users may CALL them; each one refuses anyone who isn't an
-- active admin (require_admin). Guests can't call them at all.
revoke all on function public.admin_list_users(text, text, integer, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.admin_get_user(uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_user_bookings(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.admin_update_user(uuid, text, text, text, date) from public, anon, authenticated, service_role;
revoke all on function public.admin_start_message(uuid, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_finish_message(uuid, boolean, text) from public, anon, authenticated, service_role;

grant execute on function public.admin_list_users(text, text, integer, integer, text) to authenticated;
grant execute on function public.admin_get_user(uuid) to authenticated;
grant execute on function public.admin_user_bookings(uuid, integer) to authenticated;
grant execute on function public.admin_update_user(uuid, text, text, text, date) to authenticated;
grant execute on function public.admin_start_message(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.admin_finish_message(uuid, boolean, text) to authenticated;

-- Short descriptions that show up in the Supabase dashboard.
comment on function public.admin_list_users(text, text, integer, integer, text) is 'Admin: list accounts with search, sort (name / newest) and pages.';
comment on function public.admin_get_user(uuid) is 'Admin: one account''s details and totals (View user).';
comment on function public.admin_user_bookings(uuid, integer) is 'Admin: one account''s bookings, newest class first.';
comment on function public.admin_update_user(uuid, text, text, text, date) is 'Admin: edit a client''s name, mobile, Instagram and birthday (not email or role).';
comment on function public.admin_start_message(uuid, text, text, text, uuid) is 'Admin: check and log an email to one client before the server sends it.';
comment on function public.admin_finish_message(uuid, boolean, text) is 'Admin: mark a logged email as sent or failed.';
