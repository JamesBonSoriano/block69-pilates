-- =============================================================================
-- Migration 16: Change 17, Part G - My Account
-- (docs/prompts/17-client-revisions-2.md).
--
-- What this file does:
--   1. BIRTHDAY CAN BE EDITED. protect_profile_locked_fields() (migration 12)
--      is replaced: a client may now change their birthday (it must still be a
--      real date from 1900 to today, and can't be emptied). The EMAIL column
--      still can't be changed directly from the website: the login email is
--      changed only through Supabase Auth's verified "change email" flow.
--   2. EMAIL KEPT IN SYNC. A new trigger on auth.users copies the new login
--      email into profiles.email as soon as Supabase confirms the change (both
--      6-digit codes entered). Deleted accounts are left alone.
--   3. DELETE ACCOUNT (the approach you approved). Bookings and payments are
--      kept for the cafe's records (bookings.user_id is "on delete restrict"
--      on purpose), so the account is closed like this:
--        - profiles.deleted_at (new column): when the person deleted it
--        - my_account_deletion_blockers(): what still stops it (upcoming
--          classes, seats on hold, payments being checked), for the page
--        - close_my_account(): checks again, then blanks the profile
--          ("Deleted user", no email / mobile / Instagram / birthday),
--          deactivates it, turns off their personal vouchers and deletes
--          their notifications. It gives back whether they have any bookings.
--        The website then removes the LOGIN with Supabase's admin API (server
--        only, the secret key): a "soft delete" (the row stays, nobody can log
--        in) if they have bookings, or a full delete if they never booked.
--      Admin accounts can't delete themselves this way.
--      admin_set_user_active() / admin_set_user_role() now refuse a deleted
--      account (so it can't be reactivated by mistake).
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website: src/lib/account/actions.ts (My Profile).
-- Tests: supabase/tests/18-r2-account.test.mjs.
-- =============================================================================


-- =============================================================================
-- 0. A NEW COLUMN: profiles.deleted_at
-- =============================================================================

-- When the person deleted their account (null = not deleted). Set only by
-- close_my_account(); the profile row itself stays when they have bookings.
alter table public.profiles add column if not exists deleted_at timestamptz;
comment on column public.profiles.deleted_at is
  'When the person deleted their account (Change 17). The row stays, blanked, if they have bookings.';


-- =============================================================================
-- 1. BIRTHDAY CAN BE EDITED (email still only through the verified flow)
-- =============================================================================

-- Stops clients from changing their email directly, and checks a birthday.
-- Takes: the old and new profiles row (a "before update" trigger).
-- Gives back: the new row, or an error with a plain-English message.
-- Only checks changes made by the WEBSITE as a client (the 'anon' and
-- 'authenticated' roles, and not an admin). Our own database functions
-- (security definer, like the email sync below) and server code are not affected.
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

  -- The email is a copy of the login email. It changes by itself once the
  -- person confirms a new login email with the two codes (sync below).
  if new.email is distinct from old.email then
    raise exception 'To change your email, use "Change email" in My Profile. We send codes to confirm it.'
      using errcode = '42501';
  end if;

  -- The birthday may be changed (Change 17), but not emptied, and only to a
  -- real date in the past (Philippine date), from 1900
  if new.birthday is distinct from old.birthday then
    if new.birthday is null then
      raise exception 'Please enter your birthday.' using errcode = '22023';
    end if;
    if new.birthday < date '1900-01-01' or new.birthday > (now() at time zone 'Asia/Manila')::date then
      raise exception 'Please enter a real date in the past for your birthday.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.protect_profile_locked_fields() is
  'Trigger: clients can''t change their email directly; a birthday change must be a real past date.';


-- =============================================================================
-- 2. KEEP profiles.email IN SYNC WITH THE LOGIN EMAIL
-- =============================================================================

-- Copies a changed login email into the person's profile.
-- Takes: the old and new auth.users row (an "after update" trigger).
-- Gives back: nothing that matters (after-triggers ignore it).
-- Skips deleted accounts: Supabase's soft delete scrambles the login email,
-- and the blanked profile must stay blank.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer  -- may update profiles whatever the caller is
set search_path = ''
as $$
begin
  if new.email is distinct from old.email
     and new.email is not null
     and new.deleted_at is null
  then
    update public.profiles p
    set email = new.email
    where p.id = new.id
      and p.deleted_at is null;
  end if;
  return new;
end;
$$;

-- Runs after every change to an auth.users row's email.
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();


-- =============================================================================
-- 3. DELETE ACCOUNT
-- =============================================================================

-- What still stops the logged-in client from deleting their account.
-- Takes: nothing (uses the logged-in user).
-- Gives back: one row per kind of problem (none = they may delete):
--   kind 'upcoming_class'   a confirmed / being-checked / late-paid seat in a
--                           class that hasn't ended, or a cafe-cancelled class
--                           whose free transfer isn't used yet
--   kind 'seat_on_hold'     an unpaid seat hold that is still running
--   kind 'payment_checking' a payment the cafe is still checking
-- with how many, and the earliest class date (to name it on the page).
create or replace function public.my_account_deletion_blockers()
returns table (kind text, how_many integer, first_date date)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select b.*, s.date, s.end_time, s.status as class_status
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    where b.user_id = auth.uid()   -- SECURITY: only the caller's own bookings
  )
  select 'upcoming_class', count(*)::integer, min(date)
  from mine
  where (status in ('confirmed', 'awaiting_verification', 'paid_needs_action')
         and public.at_manila(date, end_time) > now())
     or (status = 'confirmed' and class_status = 'cancelled')
  having count(*) > 0
  union all
  select 'seat_on_hold', count(*)::integer, min(date)
  from mine
  where status = 'pending_payment' and hold_expires_at > now()
  having count(*) > 0
  union all
  select 'payment_checking', count(*)::integer, min(m.date)
  from mine m
  join public.payments p on p.booking_id = m.id
  where p.status = 'pending' and p.provider = 'manual'
  having count(*) > 0;
$$;


-- Closes the logged-in client's account (the first half of Delete account;
-- the website then removes the login with the secret key).
-- Takes: nothing (uses the logged-in user).
-- Gives back: has_bookings = true if they ever booked (the website then
-- "soft deletes" the login so their bookings and payments stay), false if
-- they never did (the login and profile can be removed completely).
-- Refuses (plain English): guests, admins, an already-deleted account, and
-- anyone with something from my_account_deletion_blockers().
create or replace function public.close_my_account()
returns table (has_bookings boolean)
language plpgsql
volatile
security definer  -- runs as the owner, so the profile triggers let it through
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_block   record;
  v_problem text := '';
begin
  if v_user_id is null then
    raise exception 'Please log in first.' using errcode = '42501';
  end if;

  -- Lock their profile, so two clicks can't both run this
  select p.* into v_profile from public.profiles p where p.id = v_user_id for update;
  if not found or v_profile.deleted_at is not null then
    raise exception 'This account has already been deleted.';
  end if;
  if v_profile.role = 'admin' then
    raise exception 'Staff accounts can''t be deleted here. Ask another admin to change your account first.';
  end if;

  -- Anything still going on? Say what to do first, all in one message.
  for v_block in select * from public.my_account_deletion_blockers() loop
    v_problem := v_problem || case v_block.kind
      when 'upcoming_class' then ' You have an upcoming class: cancel it in My Bookings, or wait until after it.'
      when 'seat_on_hold' then ' You have a seat on hold: pay for it or let the hold run out.'
      else ' The cafe is still checking a payment: wait until it is approved or rejected.'
    end;
  end loop;
  if v_problem <> '' then
    raise exception 'Your account can''t be deleted yet.%', v_problem;
  end if;

  -- Blank the profile (bookings and payments keep pointing to this row)
  update public.profiles p
  set full_name       = 'Deleted user',
      email           = '',
      mobile          = null,
      instagram       = null,
      birthday        = null,
      email_reminders = false,
      is_active       = false,
      deleted_at      = now()
  where p.id = v_user_id;

  -- Their personal codes (50% codes) can't be used any more
  update public.vouchers v
  set disabled_at = now()
  where v.owner_id = v_user_id and v.disabled_at is null;

  -- Their in-app updates are no longer needed
  delete from public.notifications n where n.user_id = v_user_id;

  return query
  select exists (select 1 from public.bookings b where b.user_id = v_user_id);
end;
$$;


-- -----------------------------------------------------------------------------
-- Admins: a deleted account can't be reactivated or made an admin
-- (same functions as migration 10, with one extra check each)
-- -----------------------------------------------------------------------------

-- Deactivates or reactivates someone's account (admin Users page).
-- Takes: the user id and true (active) / false (deactivated).
-- Gives back: the saved value. Refuses your own account and deleted accounts.
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
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is not null) then
    raise exception 'This person deleted their account, so it can''t be changed.';
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
-- Gives back: the saved role. Refuses your own account and deleted accounts.
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
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.deleted_at is not null) then
    raise exception 'This person deleted their account, so it can''t be changed.';
  end if;

  update public.profiles p set role = p_role where p.id = p_user_id;
  if not found then
    raise exception 'Sorry, we couldn''t find that account.';
  end if;
  return p_role;
end;
$$;


-- -----------------------------------------------------------------------------
-- Who may call what (same pattern as the earlier migrations)
-- -----------------------------------------------------------------------------
revoke all on function
  public.sync_profile_email(),
  public.my_account_deletion_blockers(),
  public.close_my_account()
from public, anon, authenticated, service_role;

-- The two My Profile functions: logged-in users only. (The trigger function
-- stays locked; only its trigger runs it. The two admin functions keep the
-- rights migration 10 gave them.)
grant execute on function
  public.my_account_deletion_blockers(),
  public.close_my_account()
to authenticated;

comment on function public.sync_profile_email() is 'Trigger: copies a confirmed new login email into profiles.email.';
comment on function public.my_account_deletion_blockers() is 'What still stops the caller deleting their account (upcoming classes, holds, payments being checked).';
comment on function public.close_my_account() is 'Delete account, step 1: blanks and deactivates the caller''s profile; gives back whether they have bookings.';
