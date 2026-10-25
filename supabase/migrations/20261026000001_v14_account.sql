-- =============================================================================
-- Migration 17: Revisions "Version 1.4" (client side), My Profile and Home.
--
-- What this file does:
--   1. SELF-DEACTIVATED FLAG. A new column profiles.self_deactivated_at says
--      the CLIENT turned their own account off (My Profile > Deactivate).
--      Only those accounts may turn themselves back on by logging in again.
--      An account the CAFE deactivated (admin Users page) has no flag, so it
--      stays off until an admin reactivates it.
--   2. DEACTIVATE IS BLOCKED like Delete account: deactivate_my_account() now
--      refuses while my_account_deletion_blockers() (migration 16) finds an
--      upcoming class, a seat on hold or a payment being checked. It also
--      refuses staff accounts, and sets the new flag.
--   3. REACTIVATE: reactivate_my_account() turns the caller's OWN account
--      back on, only if they deactivated it themselves ("Welcome back!" page
--      after logging in).
--   4. THE FLAG IS PROTECTED: the profile guard trigger (migrations 2 and 10)
--      now also stops the website changing self_deactivated_at directly, and
--      clears the flag whenever an account is turned back on.
--      admin_set_user_active() clears it too, so when an admin deactivates an
--      account, only an admin can turn it back on.
--   5. HOME: the mat rental line becomes the text of a clickable card
--      ("Mat rental is {mat_price}, and 100% goes to ..."). Only replaced if
--      the admin hasn't edited the old text.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The website: src/lib/account/actions.ts (deactivate / reactivate),
-- src/lib/auth/actions.ts and src/app/auth/confirm/route.ts (login),
-- src/app/(auth)/reactivate/page.tsx, src/app/(client)/page.tsx (Home).
-- Tests: supabase/tests/19-v14-account.test.mjs.
-- =============================================================================


-- =============================================================================
-- 1. THE NEW COLUMN: profiles.self_deactivated_at
-- =============================================================================

-- When the client deactivated their own account (null = they didn't: either
-- the account is active, or the cafe deactivated it). Set only by
-- deactivate_my_account(); cleared when the account is turned back on.
alter table public.profiles add column if not exists self_deactivated_at timestamptz;
comment on column public.profiles.self_deactivated_at is
  'When the client deactivated their own account (Version 1.4). Only these accounts can reactivate themselves by logging in.';


-- =============================================================================
-- 2. THE PROFILE GUARD TRIGGER, with the new column
-- =============================================================================

-- Stops the website changing role, is_active or self_deactivated_at, except
-- an admin changing SOMEONE ELSE's account (same rules as migration 10, plus
-- the new column). Also clears self_deactivated_at whenever an account is
-- turned back on, however that happens.
-- Takes: the old and new profiles row (a "before update" trigger).
-- Gives back: the new row, or an error.
-- Our own database functions (security definer, e.g. deactivate_my_account)
-- and the SQL Editor run as a different role, so the first check skips them.
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.self_deactivated_at is distinct from old.self_deactivated_at)
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

  -- Turned back on (by anyone): it's no longer "deactivated by the client"
  if new.is_active then
    new.self_deactivated_at := null;
  end if;

  return new;
end;
$$;


-- =============================================================================
-- 3. DEACTIVATE (My Profile): blocked like Delete, sets the flag
-- =============================================================================

-- Lets a client deactivate their own account (My Profile > Deactivate).
-- Takes: nothing (uses the logged-in user).
-- Gives back: nothing.
-- Refuses (plain English): guests, staff accounts, deleted accounts, and
-- anyone with something from my_account_deletion_blockers() (an upcoming
-- class, a seat on hold, a payment being checked), all named in one message.
-- Marks the account as SELF-deactivated, so logging in again can turn it on.
create or replace function public.deactivate_my_account()
returns void
language plpgsql
volatile
security definer  -- runs as the owner, so the profile guard trigger lets it through
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
    raise exception 'Sorry, we couldn''t find your account.';
  end if;
  if v_profile.role = 'admin' then
    raise exception 'Staff accounts can''t be deactivated here. Ask another admin.';
  end if;

  -- Anything still going on? The same checks as Delete account.
  for v_block in select * from public.my_account_deletion_blockers() loop
    v_problem := v_problem || case v_block.kind
      when 'upcoming_class' then ' You have an upcoming class: cancel it in My Bookings, or wait until after it.'
      when 'seat_on_hold' then ' You have a seat on hold: pay for it or let the hold run out.'
      else ' The cafe is still checking a payment: wait until it is approved or rejected.'
    end;
  end loop;
  if v_problem <> '' then
    raise exception 'Your account can''t be deactivated yet.%', v_problem;
  end if;

  -- Already off: nothing to do (and an admin's deactivation stays an admin's)
  if not v_profile.is_active then
    return;
  end if;

  update public.profiles p
  set is_active = false,
      self_deactivated_at = now()
  where p.id = v_user_id;
end;
$$;


-- =============================================================================
-- 4. REACTIVATE (the "Welcome back!" page after logging in)
-- =============================================================================

-- Turns the logged-in client's OWN account back on, if they deactivated it
-- themselves.
-- Takes: nothing (uses the logged-in user; there is no way to name anyone else).
-- Gives back: true (the account is active now).
-- Refuses (plain English): guests, deleted accounts, and accounts the CAFE
-- deactivated (no self_deactivated_at), which only an admin can turn back on.
-- An account that is already active just gives back true.
create or replace function public.reactivate_my_account()
returns boolean
language plpgsql
volatile
security definer  -- runs as the owner, so the profile guard trigger lets it through
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Please log in first.' using errcode = '42501';
  end if;

  select p.* into v_profile from public.profiles p where p.id = v_user_id for update;
  if not found or v_profile.deleted_at is not null then
    raise exception 'Sorry, we couldn''t find your account.';
  end if;
  if v_profile.is_active then
    return true;
  end if;
  if v_profile.self_deactivated_at is null then
    raise exception 'Your account was turned off by the cafe. Please message us with Chat With Us to turn it back on.'
      using errcode = '42501';
  end if;

  -- (the guard trigger clears self_deactivated_at as it turns back on)
  update public.profiles p set is_active = true where p.id = v_user_id;
  return true;
end;
$$;


-- =============================================================================
-- 5. ADMIN Users page: deactivating / reactivating clears the flag
-- =============================================================================

-- Deactivates or reactivates someone's account (admin Users page).
-- Takes: the user id and true (active) / false (deactivated).
-- Gives back: the saved value. Refuses your own account and deleted accounts.
-- Same as migration 16, plus: self_deactivated_at is cleared, so an account
-- an admin deactivates can only be turned back on by an admin.
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

  update public.profiles p
  set is_active = p_active,
      self_deactivated_at = null
  where p.id = p_user_id;
  if not found then
    raise exception 'Sorry, we couldn''t find that account.';
  end if;
  return p_active;
end;
$$;


-- -----------------------------------------------------------------------------
-- Who may call what (same pattern as the earlier migrations)
-- -----------------------------------------------------------------------------
revoke all on function public.reactivate_my_account() from public, anon, authenticated, service_role;
-- Logged-in users only (it only ever touches the caller's own account).
-- deactivate_my_account() and admin_set_user_active() keep their old rights.
grant execute on function public.reactivate_my_account() to authenticated;

comment on function public.deactivate_my_account() is 'Client deactivates their own account (refused while something is still going on; marks it self-deactivated).';
comment on function public.reactivate_my_account() is 'Client turns their own self-deactivated account back on (Welcome back page).';


-- =============================================================================
-- 6. HOME: the mat rental card text
-- =============================================================================
-- The page adds the "Add it to your booking" link and the arrow. Only the old
-- default text is replaced, so an admin's own wording is kept.
update public.site_content
set body = 'Mat rental is {mat_price}, and 100% goes to feeding stray animals in Taguig.'
where page = 'home'
  and section = 'mat_note'
  and body = 'Don''t have a mat? Add mat rental to your booking.';
