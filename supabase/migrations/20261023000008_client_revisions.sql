-- =============================================================================
-- Migration 12: Revisions part 1, the client side (docs/prompts/R1-revisions-client.md).
--
-- What this file does:
--   1. Sign-up saves the BIRTHDAY too. The sign-up form now asks for it, and
--      handle_new_user() copies it from the sign-up "metadata" (like full_name
--      and mobile). A missing or impossible date is simply left empty.
--   2. A new trigger on profiles, protect_profile_locked_fields(). For
--      clients using the website (not admins, not our server code):
--        - the EMAIL can't be changed (it's a copy of the login email; the
--          admin changes it in Revisions part 3)
--        - the BIRTHDAY can be saved once, and is then read-only (it can't be
--          changed or cleared). It must be a real date, not in the future.
--   3. A new table, notifications: the in-app list of a client's own updates
--      (My Account > Notifications). Rows are made ONLY by database triggers:
--        notify_booking_change()  on bookings: booking confirmed, payment
--                                 being checked / approved / rejected, late
--                                 payment, transfer done, cancelled with a 50%
--                                 code, cancelled with no credit
--        notify_class_cancelled() on class_sessions: the cafe cancelled a class
--      It works for ANY booking that has a user_id, whoever made the change
--      (the client, an admin, the PayMongo webhook, a walk-in with an
--      account in Revisions part 2). Walk-ins without an account get nothing.
--   4. Three functions for the website (logged-in users only):
--        get_my_notifications(limit)      the caller's own list, newest first
--        my_unread_notification_count()   for the dot on the person icon
--        mark_my_notifications_read()     when the Notifications page is opened
--   5. Booking step 1's "What to bring" text: the new default list from the
--      revisions (only if the admin hasn't edited it yet).
--
-- Who can see notifications: Row Level Security lets a person read ONLY
-- their own rows, admins included (there is no admin policy). Nobody can add,
-- change or delete rows from the website; only the triggers add them and
-- mark_my_notifications_read() fills in read_at.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website calls the functions from src/lib/data/notifications.ts.
-- Tests: supabase/tests/15-client-revisions.test.mjs.
--
-- (No peso sign in this file on purpose: the test database on Windows can't
-- read it, even in a comment.)
-- =============================================================================


-- =============================================================================
-- 1. SIGN-UP SAVES THE BIRTHDAY
-- =============================================================================

-- Makes the profiles row for a new sign-up (replaces migration 1's version).
-- Takes: the new auth.users row (trigger).
-- Gives back: the same row. Saves full_name, email, mobile and now birthday
-- from the sign-up metadata. The role is always 'client' (the column default);
-- a "role" sent in the metadata is ignored on purpose.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''  -- safety: always use the exact tables named below
as $$
declare
  v_birthday date;
begin
  -- The birthday, if the sign-up form sent a real one ("YYYY-MM-DD").
  -- Anything else (missing, "2026-02-31", text) is left empty instead of
  -- stopping the sign-up; the website then asks for it once.
  begin
    v_birthday := (new.raw_user_meta_data ->> 'birthday')::date;
  exception when others then
    v_birthday := null;
  end;
  -- Not before 1900, and not in the future (Philippine date)
  if v_birthday < date '1900-01-01' or v_birthday > (now() at time zone 'Asia/Manila')::date then
    v_birthday := null;
  end if;

  insert into public.profiles (id, full_name, email, mobile, birthday)
  values (
    new.id,
    -- The sign-up form sends full_name; Google login sends "name". Fall back to ''.
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    -- Mobile number if the sign-up form sent one (empty text becomes null).
    nullif(btrim(new.raw_user_meta_data ->> 'mobile'), ''),
    v_birthday
  );
  return new;
end;
$$;


-- =============================================================================
-- 2. LOCKED PROFILE FIELDS (email, birthday)
-- =============================================================================

-- Stops clients from changing their email, or their birthday once it's saved.
-- Takes: the old and new profiles row (a "before update" trigger).
-- Gives back: the new row, or an error with a plain-English message.
-- Only checks changes made by the WEBSITE as a client (the 'anon' and
-- 'authenticated' roles, and not an admin). Our own database functions
-- (security definer) and server code are not affected.
create or replace function public.protect_profile_locked_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Changes made by our functions or the server key: nothing to check
  if current_user not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;

  -- The email is a copy of the login email. Only the cafe changes it.
  if new.email is distinct from old.email then
    raise exception 'To change your email, please message the cafe.'
      using errcode = '42501';
  end if;

  -- The birthday can be saved once, then it stays as it is
  if old.birthday is not null and new.birthday is distinct from old.birthday then
    raise exception 'Your birthday is already saved. To change it, please message the cafe.'
      using errcode = '42501';
  end if;

  -- A new birthday must be a real date in the past (Philippine date)
  if new.birthday is distinct from old.birthday
     and (new.birthday < date '1900-01-01' or new.birthday > (now() at time zone 'Asia/Manila')::date)
  then
    raise exception 'Please pick a real date in the past for your birthday.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

-- Runs before every change to a profiles row.
create trigger profiles_protect_locked_fields
  before update on public.profiles
  for each row execute function public.protect_profile_locked_fields();


-- =============================================================================
-- 3. NOTIFICATIONS
-- =============================================================================

-- The kinds of update a client can get. The website turns each one into a
-- sentence (src/lib/notifications.ts), so the wording can change without a
-- database change.
create type public.notification_kind as enum (
  'booking_confirmed',      -- a booking is paid and confirmed
  'payment_checking',       -- a transfer screenshot was sent; the cafe is checking it
  'payment_approved',       -- the cafe approved the transfer (booking confirmed)
  'payment_rejected',       -- the cafe rejected the transfer (seat let go)
  'payment_needs_action',   -- paid late into a full / closed class; the cafe will contact them
  'booking_transferred',    -- moved to another class (by the client or the cafe)
  'cancelled_with_voucher', -- cancelled 12 to 24 hours before; a 50% code was given
  'booking_forfeited',      -- cancelled less than 12 hours before; no credit
  'class_cancelled'         -- the cafe cancelled the class; a free transfer is offered
);

-- One row = one update for one client.
create table public.notifications (
  -- Random unique id.
  id           uuid primary key default gen_random_uuid(),
  -- Whose update it is. Deleting a profile deletes their updates.
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- The booking it's about (for a transfer: the NEW booking). Kept if empty.
  booking_id   uuid references public.bookings (id) on delete cascade,
  -- What happened (see the list above).
  kind         public.notification_kind not null,
  -- For 'cancelled_with_voucher': the personal 50% code that was given.
  voucher_code text,
  -- When it happened.
  created_at   timestamptz not null default now(),
  -- When the client opened their Notifications page after it. Empty = unread.
  read_at      timestamptz
);

comment on table public.notifications is 'In-app updates for a client (My Account > Notifications). Made only by database triggers; each person reads only their own.';
comment on column public.notifications.booking_id is 'The booking the update is about (for a transfer, the new booking).';
comment on column public.notifications.voucher_code is 'The 50% code given, for cancelled_with_voucher only.';
comment on column public.notifications.read_at is 'When the client saw it. Empty = unread (shows the dot on the person icon).';

-- "My updates, newest first" (the Notifications page).
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
-- "How many unread?" (the dot). Only unread rows are in this index.
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

-- Row Level Security: ON. Each person may READ their own rows only.
-- No insert / update / delete policies: the website can't make or change rows.
alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- Table rights: guests get nothing; logged-in users may only read (RLS above
-- limits it to their own rows). The server key keeps full access.
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;


-- -----------------------------------------------------------------------------
-- notify_booking_change()   TRIGGER on bookings
-- -----------------------------------------------------------------------------
-- Adds a notification when a booking that belongs to a user gets a new status.
-- Takes: the new (and, for an update, the old) bookings row.
-- Gives back: nothing (an "after" trigger).
-- Which change makes which update:
--   new booking, 'confirmed', moved from another one  -> booking_transferred
--   awaiting_verification -> confirmed                -> payment_approved
--   anything else -> confirmed (paid online, free, a walk-in with an account)
--                                                     -> booking_confirmed
--   -> awaiting_verification                          -> payment_checking
--   awaiting_verification -> expired                  -> payment_rejected
--   -> paid_needs_action                              -> payment_needs_action
--   -> cancelled_with_voucher (with the 50% code)     -> cancelled_with_voucher
--   -> forfeited                                      -> booking_forfeited
-- Nothing for: unpaid holds, holds running out, the old booking of a
-- transfer (the new booking has the update), attended and no_show.
-- security definer: it writes to notifications, which nobody else can.
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

-- Runs after a booking is added, or after its status changes.
create trigger bookings_notify_change
  after insert or update of status on public.bookings
  for each row execute function public.notify_booking_change();


-- -----------------------------------------------------------------------------
-- notify_class_cancelled()   TRIGGER on class_sessions
-- -----------------------------------------------------------------------------
-- When the cafe cancels a class, tells everyone who holds a seat in it.
-- Takes: the old and new class_sessions row.
-- Gives back: nothing (an "after" trigger).
-- "Holds a seat" = confirmed, awaiting_verification, paid_needs_action, or an
-- unpaid hold that is still running. (Expired holds, cancellations and
-- transfers away are not told.)
create or replace function public.notify_class_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.notifications (user_id, booking_id, kind)
    select b.user_id, b.id, 'class_cancelled'
    from public.bookings b
    where b.session_id = new.id
      and b.user_id is not null
      and (
        b.status in ('confirmed', 'awaiting_verification', 'paid_needs_action')
        or (b.status = 'pending_payment' and b.hold_expires_at > now())
      );
  end if;
  return null;
end;
$$;

-- Runs after a class's status changes.
create trigger class_sessions_notify_cancelled
  after update of status on public.class_sessions
  for each row execute function public.notify_class_cancelled();


-- =============================================================================
-- 4. FUNCTIONS FOR THE WEBSITE (the Notifications page and the unread dot)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_my_notifications(limit)   for the Notifications page
-- -----------------------------------------------------------------------------
-- The caller's own updates, newest first, with the class each one is about.
-- Takes: how many to give back (1 to 100, default 50).
-- Gives back: one row per update: id, kind, voucher_code, created_at,
-- read_at, booking_id, and the class's date, start and end time (empty if
-- the update has no booking).
-- Runs with the CALLER's rights (security invoker), so Row Level Security
-- applies too, and it filters on auth.uid() as well.
create or replace function public.get_my_notifications(p_limit integer default 50)
returns table (
  id           uuid,
  kind         public.notification_kind,
  voucher_code text,
  created_at   timestamptz,
  read_at      timestamptz,
  booking_id   uuid,
  class_date   date,
  start_time   time,
  end_time     time
)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.id, n.kind, n.voucher_code, n.created_at, n.read_at, n.booking_id,
         s.date, s.start_time, s.end_time
  from public.notifications n
  left join public.bookings b on b.id = n.booking_id
  left join public.class_sessions s on s.id = b.session_id
  where n.user_id = auth.uid()
  order by n.created_at desc, n.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;


-- -----------------------------------------------------------------------------
-- my_unread_notification_count()   for the dot on the person icon
-- -----------------------------------------------------------------------------
-- Takes: nothing.
-- Gives back: how many of the caller's updates are unread (0 for guests).
create or replace function public.my_unread_notification_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.notifications n
  where n.user_id = auth.uid() and n.read_at is null;
$$;


-- -----------------------------------------------------------------------------
-- mark_my_notifications_read()   when the Notifications page is opened
-- -----------------------------------------------------------------------------
-- Takes: nothing.
-- Gives back: how many updates were marked as read.
-- security definer: clients can't update the table themselves; this only
-- ever touches the caller's OWN unread rows, and only the read_at column.
create or replace function public.mark_my_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Guests: nothing to mark
  if auth.uid() is null then
    return 0;
  end if;

  update public.notifications n
    set read_at = now()
    where n.user_id = auth.uid() and n.read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- -----------------------------------------------------------------------------
-- Who may call what (same pattern as the earlier migrations)
-- -----------------------------------------------------------------------------

-- Take every right away first (Supabase gives all roles every new function).
revoke all on function
  public.protect_profile_locked_fields(),
  public.notify_booking_change(),
  public.notify_class_cancelled(),
  public.get_my_notifications(integer),
  public.my_unread_notification_count(),
  public.mark_my_notifications_read()
from public, anon, authenticated, service_role;

-- The trigger functions stay locked (only their triggers run them).
-- The three page functions: logged-in users only.
grant execute on function
  public.get_my_notifications(integer),
  public.my_unread_notification_count(),
  public.mark_my_notifications_read()
to authenticated;

-- Short descriptions that show up in the Supabase dashboard.
comment on function public.protect_profile_locked_fields() is 'Trigger: clients can''t change their email, and can save their birthday only once.';
comment on function public.notify_booking_change() is 'Trigger: adds a notification when a user''s booking changes status (confirmed, payment checked, transfer, cancel...).';
comment on function public.notify_class_cancelled() is 'Trigger: adds a class_cancelled notification for everyone holding a seat when the cafe cancels a class.';
comment on function public.get_my_notifications(integer) is 'The caller''s own notifications, newest first, with the class date and time.';
comment on function public.my_unread_notification_count() is 'How many of the caller''s notifications are unread.';
comment on function public.mark_my_notifications_read() is 'Marks all of the caller''s notifications as read. Gives back how many.';


-- =============================================================================
-- 5. "WHAT TO BRING" (booking step 1's Booking details card)
-- =============================================================================

-- The list from the revisions, one item per line. The FIRST line is the mat
-- (booking step 1 shows the "Rent a mat" tick under the line that mentions a
-- mat). Only replaced if it's still the original text from migration 4, so
-- an admin's own edits are never overwritten. (\r is removed before
-- comparing, in case the text was saved with Windows line endings.)
update public.site_content
set body = E'Workout mat\nWater bottle\nTowel\nComfortable workout clothes'
where page = 'booking'
  and section = 'what_to_bring'
  and replace(body, E'\r', '') = E'Mat (or rent one when you book)\nSmall towel\nWater bottle\nGrip socks';
