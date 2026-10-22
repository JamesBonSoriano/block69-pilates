-- =============================================================================
-- Migration 2: security (Row Level Security policies) for every table.
--
-- What this file does:
--   1. Adds is_admin(), a helper that answers "is the logged-in user an admin?"
--   2. Adds a trigger so a client can never change their own role or is_active.
--   3. Adds settings.is_public, so some settings can stay admin-only.
--   4. Sets table permissions (grants) for the website's two browser roles.
--   5. Adds RLS policies: who may read / add / change / delete which rows.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
--
-- Words used below:
--   anon           = a guest (not logged in). Supabase uses this role for them.
--   authenticated  = any logged-in user (client OR admin). Policies decide which.
--   service_role   = our server code using the secret key. It skips RLS
--                    completely, so none of these policies limit it.
--   auth.uid()     = the id of the logged-in user (empty for guests).
--   using (...)    = which existing rows a user can see / change / delete.
--   with check(...)= what a new or changed row must look like to be saved.
--
-- If no policy allows something, it is BLOCKED. So anything not listed here
-- (for example a client adding a booking directly) is not allowed.
-- Bookings will be made by database functions in the next step (Step 4),
-- which check seats, cutoff and prices first.
--
-- Speed tip used everywhere: "(select auth.uid())" instead of "auth.uid()".
-- The select wrapper makes Postgres work the value out once per query
-- instead of once for every row.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- HELPER: is_admin()
-- -----------------------------------------------------------------------------

-- Checks if the person making this request is an active admin.
-- Takes: nothing (it looks up the logged-in user with auth.uid()).
-- Gives back: true for an active admin, false for everyone else (including guests).
--
-- "security definer" = it runs with the owner's rights, so it can read the
-- profiles table WITHOUT going through the profiles policies. Without this,
-- the profiles policy would call is_admin(), which would read profiles, which
-- would call the policy again... forever (an endless loop).
-- "set search_path = ''" = safety: it only uses the exact tables named below,
-- so nobody can trick it with a look-alike table.
-- "stable" = gives the same answer for the whole query, so Postgres can reuse it.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      -- A deactivated admin loses admin rights straight away.
      and p.is_active
  );
$$;

comment on function public.is_admin() is 'True if the logged-in user is an active admin. Used by RLS policies.';

-- Only these roles may call it (policies run as the guest or logged-in user,
-- so they need permission to call it).
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- TRIGGER: clients can't change their own role or is_active
-- -----------------------------------------------------------------------------

-- Stops a client from making themselves an admin, or reactivating a
-- deactivated account. (A policy can only allow or block a whole row, not
-- single columns, so this check needs a trigger.)
-- Takes: the old and new versions of the profiles row being updated.
-- Gives back: the new row unchanged if allowed; otherwise it stops the update with an error.
--
-- Who is allowed to change role / is_active:
--   - an active admin using the website
--   - our server code (service_role) and database functions / the SQL editor
--     (these run as a different role than the browser's anon/authenticated)
-- NOTE: "deactivate my account" on My Profile will therefore go through a
-- server route or a database function later, not a direct update.
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active)
     -- current_user is the role running this update. The browser's requests
     -- run as 'anon' or 'authenticated'; trusted server code runs as something else.
     and current_user in ('anon', 'authenticated')
     and not public.is_admin()
  then
    -- 42501 = Postgres' standard "permission denied" error code.
    raise exception 'Only an admin can change role or is_active'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Run the check before every update on profiles.
create trigger profiles_protect_admin_fields
  before update on public.profiles
  for each row execute function public.protect_profile_admin_fields();


-- -----------------------------------------------------------------------------
-- NEW COLUMN: settings.is_public
-- -----------------------------------------------------------------------------

-- true  = guests and clients can read this setting (prices, drink options,
--         cutoff time, contact details, GCash/BPI details for manual transfer...).
-- false = admins only.
-- The default is false (private), so a new setting is never shown by accident.
-- seed.sql (Step 5) marks the website's settings as public.
alter table public.settings
  add column is_public boolean not null default false;

comment on column public.settings.is_public is 'true = anyone can read it (website needs it). false = admins only.';


-- -----------------------------------------------------------------------------
-- TABLE PERMISSIONS (grants)
-- Grants decide which ACTIONS a role may try on a table at all.
-- Policies (further down) then decide which ROWS.
-- We first remove everything, then give back only what's needed. This is a
-- second safety net: even if a policy were written wrong, a guest still could
-- never add, change or delete anything.
-- -----------------------------------------------------------------------------

-- Start from zero for the browser roles on all 9 tables.
revoke all on table
  public.profiles, public.schedule_templates, public.class_sessions,
  public.vouchers, public.bookings, public.payments, public.settings,
  public.site_content, public.email_log
from anon, authenticated;

-- Guests may only READ the 4 public tables (and only the rows the policies allow).
grant select on table
  public.schedule_templates, public.class_sessions, public.settings, public.site_content
to anon;

-- Logged-in users may try reading and writing every table.
-- The policies below then limit clients to their own rows (or read-only),
-- and allow admins everything.
grant select, insert, update, delete on table
  public.profiles, public.schedule_templates, public.class_sessions,
  public.vouchers, public.bookings, public.payments, public.settings,
  public.site_content, public.email_log
to authenticated;

-- Our server code (secret key) keeps full access. It skips RLS anyway.
grant all on table
  public.profiles, public.schedule_templates, public.class_sessions,
  public.vouchers, public.bookings, public.payments, public.settings,
  public.site_content, public.email_log
to service_role;


-- =============================================================================
-- POLICIES
-- =============================================================================


-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

-- READ: a client sees only their own profile. Admins see everyone's.
-- Guests see nothing (no guest policy and no guest grant).
create policy "Users read own profile, admins read all"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

-- CHANGE: a client can edit only their own profile, and can't turn it into
-- someone else's (with check). Admins can edit anyone's.
-- The trigger above also blocks clients from changing role and is_active.
create policy "Users update own profile, admins update all"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- No ADD policy: profiles are only made by the sign-up trigger.
-- No DELETE policy: we deactivate users instead of deleting them.


-- -----------------------------------------------------------------------------
-- schedule_templates (the weekly class pattern)
-- -----------------------------------------------------------------------------

-- READ: anyone, including guests, can see the weekly pattern.
create policy "Anyone can read schedule templates"
  on public.schedule_templates
  for select
  to anon, authenticated
  using (true);

-- ADD / CHANGE / DELETE: admins only.
create policy "Admins add schedule templates"
  on public.schedule_templates
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update schedule templates"
  on public.schedule_templates
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins delete schedule templates"
  on public.schedule_templates
  for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- class_sessions (the dated classes)
-- -----------------------------------------------------------------------------

-- READ: anyone, including guests, can see the classes (date, time, capacity, status).
-- "Seats left" comes from a function in Step 4, because guests can't read bookings.
create policy "Anyone can read class sessions"
  on public.class_sessions
  for select
  to anon, authenticated
  using (true);

-- ADD / CHANGE / DELETE: admins only (for example changing capacity or closing a day).
create policy "Admins add class sessions"
  on public.class_sessions
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update class sessions"
  on public.class_sessions
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins delete class sessions"
  on public.class_sessions
  for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- settings
-- -----------------------------------------------------------------------------

-- READ: anyone can read the PUBLIC settings (prices, drink options, contact
-- details...). Private settings (is_public = false) are for admins only.
create policy "Anyone reads public settings, admins read all"
  on public.settings
  for select
  to anon, authenticated
  using (is_public or (select public.is_admin()));

-- ADD / CHANGE / DELETE: admins only.
create policy "Admins add settings"
  on public.settings
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update settings"
  on public.settings
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins delete settings"
  on public.settings
  for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- site_content (editable text and images on Home, About Us, policy, agreement)
-- -----------------------------------------------------------------------------

-- READ: anyone, including guests, so the pages can show it.
create policy "Anyone can read site content"
  on public.site_content
  for select
  to anon, authenticated
  using (true);

-- ADD / CHANGE / DELETE: admins only (Content Management page).
create policy "Admins add site content"
  on public.site_content
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update site content"
  on public.site_content
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins delete site content"
  on public.site_content
  for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- bookings
-- -----------------------------------------------------------------------------

-- READ: a client sees only their own bookings. Admins see all (including walk-ins).
create policy "Clients read own bookings, admins read all"
  on public.bookings
  for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ADD / CHANGE / DELETE: admins only.
-- Clients can NOT add or change bookings directly. Booking, cancelling and
-- transferring will go through database functions (Step 4), which check
-- seats, cutoff time and prices first.
create policy "Admins add bookings"
  on public.bookings
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update bookings"
  on public.bookings
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins delete bookings"
  on public.bookings
  for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- payments
-- -----------------------------------------------------------------------------

-- READ: a client sees only payments for their OWN bookings. Admins see all.
-- (payments has no user_id, so we look up the booking it belongs to.
-- The bookings policy above also applies inside this lookup, which is fine:
-- a client can see their own bookings.)
create policy "Clients read own payments, admins read all"
  on public.payments
  for select
  to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.bookings b
      where b.id = payments.booking_id
        and b.user_id = (select auth.uid())
    )
  );

-- ADD / CHANGE / DELETE: admins only. The PayMongo webhook (Step 12) uses the
-- server's secret key, which skips RLS, so it doesn't need a policy.
create policy "Admins add payments"
  on public.payments
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update payments"
  on public.payments
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins delete payments"
  on public.payments
  for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- vouchers
-- -----------------------------------------------------------------------------

-- READ: a client sees only their own personal codes (My Vouchers).
-- Promo codes have no owner, so clients can't list them; a typed promo code is
-- checked by a function in Step 4 instead. Admins see all codes.
create policy "Clients read own vouchers, admins read all"
  on public.vouchers
  for select
  to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

-- ADD / CHANGE / DELETE: admins only. (The 50% cancellation codes will be made
-- by the cancel function in Step 4, which doesn't need a policy.)
create policy "Admins add vouchers"
  on public.vouchers
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update vouchers"
  on public.vouchers
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins delete vouchers"
  on public.vouchers
  for delete
  to authenticated
  using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- email_log
-- -----------------------------------------------------------------------------

-- READ / ADD / CHANGE / DELETE: admins only. (The email sender in Step 13 runs
-- on the server with the secret key, so it doesn't need a policy.)
create policy "Admins read email log"
  on public.email_log
  for select
  to authenticated
  using ((select public.is_admin()));

create policy "Admins add email log"
  on public.email_log
  for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins update email log"
  on public.email_log
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins delete email log"
  on public.email_log
  for delete
  to authenticated
  using ((select public.is_admin()));
