-- =============================================================================
-- Migration 1: all tables for the Block 69 Cafe Pilates booking website.
--
-- What this file does:
--   1. Creates "enums" (fixed lists of allowed words, e.g. booking statuses).
--   2. Creates the 9 tables from CLAUDE.md section 6, with checks and indexes.
--   3. Adds a trigger that keeps every "updated_at" column up to date.
--   4. Adds a trigger that creates a profiles row when someone signs up.
--   5. Turns Row Level Security (RLS) ON for every table.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
--
-- IMPORTANT: RLS is on but there are NO policies yet (that's the next migration).
-- Until then, the website (browser keys) can't read or write any of these tables.
-- That's on purpose, so nothing is open by accident.
--
-- Time note: class dates and times (date, start_time, end_time) are Philippine
-- time (Asia/Manila). Columns ending in "_at" are exact moments (timestamptz).
--
-- Money note: all money is in pesos with 2 decimals, e.g. 500.00.
-- (PayMongo counts in centavos; we convert only when we talk to PayMongo.)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- ENUMS: lists of allowed values. Postgres rejects anything not on the list,
-- so a typo like 'confrimed' can never be saved.
-- -----------------------------------------------------------------------------

-- What kind of account a user has.
create type public.user_role as enum ('client', 'admin');

-- Whether a dated class can be booked.
--   open      = bookable (if seats and time allow)
--   closed    = the admin closed it (holiday etc.), nobody can book
--   cancelled = the cafe cancelled it after people booked (they get a free transfer)
create type public.session_status as enum ('open', 'closed', 'cancelled');

-- Every step a booking can be in (CLAUDE.md section 5).
--   pending_payment        = clicked Pay, seat held until hold_expires_at
--   awaiting_verification  = uploaded a manual transfer screenshot, admin must check
--   confirmed              = paid, seat is theirs
--   paid_needs_action      = payment arrived after the hold ended and the class is full
--   expired                = payment failed or the hold ran out
--   transferred            = moved to another session (a new booking was made)
--   cancelled_with_voucher = cancelled 12-24h before, got a 50% code
--   forfeited              = cancelled less than 12h before, no credit
--   no_show                = didn't come, marked by the admin
--   attended               = came to class, marked by the admin
create type public.booking_status as enum (
  'pending_payment',
  'awaiting_verification',
  'confirmed',
  'paid_needs_action',
  'expired',
  'transferred',
  'cancelled_with_voucher',
  'forfeited',
  'no_show',
  'attended'
);

-- Who handled the money.
--   paymongo = online checkout, manual = GCash/BPI transfer with screenshot,
--   cash     = paid at the cafe counter (walk-ins)
create type public.payment_provider as enum ('paymongo', 'manual', 'cash');

-- How the client actually paid.
create type public.payment_method as enum ('gcash', 'maya', 'card', 'bpi', 'cash');

-- Where one payment attempt is at.
--   pending  = started, not finished yet
--   paid     = money received
--   failed   = PayMongo said the payment failed
--   expired  = the checkout timed out
--   rejected = the admin rejected a manual transfer screenshot
--   refunded = money given back (only when the cafe caused the problem)
create type public.payment_status as enum ('pending', 'paid', 'failed', 'expired', 'rejected', 'refunded');

-- Where a voucher came from.
--   cancellation = the system gave a personal 50% code for a 12-24h cancellation
--   promo        = the admin created a promo code
create type public.voucher_source as enum ('cancellation', 'promo');

-- What kind of email was sent (for the email_log table).
create type public.email_type as enum (
  'confirmation',   -- "You're booked"
  'reminder',       -- day-before reminder
  'cancellation',   -- booking cancelled / forfeited
  'voucher',        -- a new 50% code was issued
  'session_notice', -- admin notice to everyone in a session (e.g. class cancelled)
  'admin_alert'     -- tells the admin something needs action (e.g. new screenshot)
);


-- -----------------------------------------------------------------------------
-- HELPER: keeps "updated_at" correct.
-- -----------------------------------------------------------------------------

-- Sets updated_at to the current time whenever a row is changed.
-- Takes: the row being updated (Postgres passes it in as "new").
-- Gives back: the same row with updated_at set to now().
-- Used by a "before update" trigger on every table that has updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''  -- safety: don't let anyone swap in look-alike tables/functions
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- TABLE: profiles
-- One row = one user. Linked 1-to-1 with Supabase's own auth.users table
-- (which holds the password). Created automatically on sign-up (see trigger below).
-- -----------------------------------------------------------------------------
create table public.profiles (
  -- Same id as the user's auth.users row. If the auth user is deleted, so is this profile.
  id              uuid primary key references auth.users (id) on delete cascade,
  -- The user's full name, shown on bookings and attendance lists.
  full_name       text not null default '',
  -- Copy of the login email, so we can show and search it without touching auth.users.
  email           text not null default '',
  -- Mobile number, e.g. 0917 123 4567 (stored as text so leading zeros stay).
  mobile          text,
  -- Instagram handle (optional).
  instagram       text,
  -- Birthday (optional).
  birthday        date,
  -- 'client' or 'admin'. Everyone starts as a client; only an admin can promote someone.
  role            public.user_role not null default 'client',
  -- false = account deactivated (can't log in to book). We deactivate instead of deleting.
  is_active       boolean not null default true,
  -- true = send the day-before reminder email (My Account > Notifications).
  email_reminders boolean not null default true,
  -- When the row was made / last changed.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Keep names a sensible length.
  constraint profiles_full_name_length check (char_length(full_name) <= 120)
);

comment on table public.profiles is 'One row per user, linked to auth.users. Holds role (client/admin) and contact details.';

-- Admin pages filter users by role (e.g. list all admins).
create index profiles_role_idx on public.profiles (role);
-- Admin User Management searches by email (lower() makes it case-insensitive).
create index profiles_email_idx on public.profiles (lower(email));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- TABLE: schedule_templates
-- One row = one weekly slot pattern, e.g. "every Thursday 9:00-9:50, 4 seats".
-- The system uses these to create the real dated sessions (class_sessions).
-- -----------------------------------------------------------------------------
create table public.schedule_templates (
  -- Random unique id for the template.
  id               uuid primary key default gen_random_uuid(),
  -- Day of the week: 0 = Sunday, 1 = Monday ... 4 = Thursday, 5 = Friday, 6 = Saturday.
  -- (Same numbering as Postgres extract(dow ...) and JavaScript getDay().)
  weekday          smallint not null,
  -- When the class starts and ends, e.g. 09:00 and 09:50.
  start_time       time not null,
  end_time         time not null,
  -- Seats for sessions made from this template (admin can change one date later).
  default_capacity integer not null default 4,
  -- false = stop making new sessions from this template (old ones stay).
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Weekday must be 0-6.
  constraint schedule_templates_weekday_range check (weekday between 0 and 6),
  -- A class must end after it starts.
  constraint schedule_templates_times_order check (end_time > start_time),
  -- At least 1 seat.
  constraint schedule_templates_capacity_positive check (default_capacity > 0),
  -- No two templates for the same day and start time.
  constraint schedule_templates_unique_slot unique (weekday, start_time)
);

comment on table public.schedule_templates is 'Weekly class pattern (day + times + default seats). Used to generate class_sessions.';

create trigger schedule_templates_set_updated_at
  before update on public.schedule_templates
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- TABLE: class_sessions
-- One row = one real class on one date, e.g. "Thu 5 Nov 2026, 9:00-9:50".
-- Bookings point at these rows.
-- -----------------------------------------------------------------------------
create table public.class_sessions (
  -- Random unique id for the session.
  id          uuid primary key default gen_random_uuid(),
  -- The template this session was made from. Empty if the admin added it by hand,
  -- or if that template was later deleted.
  template_id uuid references public.schedule_templates (id) on delete set null,
  -- The class date (Philippine time).
  date        date not null,
  -- When this class starts and ends.
  start_time  time not null,
  end_time    time not null,
  -- How many seats this one session has (copied from the template, admin can change it).
  capacity    integer not null default 4,
  -- open / closed / cancelled (see the session_status enum above).
  status      public.session_status not null default 'open',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A class must end after it starts.
  constraint class_sessions_times_order check (end_time > start_time),
  -- At least 1 seat.
  constraint class_sessions_capacity_positive check (capacity > 0),
  -- Only one session per date and start time, so the nightly job can't make duplicates.
  -- (This also works as an index for "find sessions on this date".)
  constraint class_sessions_unique_slot unique (date, start_time)
);

comment on table public.class_sessions is 'One dated class. Capacity and status can be changed per date by the admin.';

-- Pages show "open sessions from today onwards", so filter by status + date.
create index class_sessions_status_date_idx on public.class_sessions (status, date);
-- Find sessions made from a template (and speeds up the foreign key).
create index class_sessions_template_id_idx on public.class_sessions (template_id);

create trigger class_sessions_set_updated_at
  before update on public.class_sessions
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- TABLE: vouchers
-- One row = one discount code. Either a personal 50% code from a cancellation,
-- or a promo code the admin made. (Made before bookings, because bookings point here.)
-- -----------------------------------------------------------------------------
create table public.vouchers (
  -- Random unique id for the voucher.
  id          uuid primary key default gen_random_uuid(),
  -- The code the client types, e.g. HALF-7K2Q. Stored in CAPITALS so matching is easy.
  code        text not null,
  -- Percent off the CLASS FEE, e.g. 50.00. (Use this OR amount_off, not both.)
  percent_off numeric(5, 2),
  -- Pesos off the CLASS FEE, e.g. 100.00. (Use this OR percent_off, not both.)
  amount_off  numeric(10, 2),
  -- Who the code belongs to. Empty = anyone can use it (promo codes).
  owner_id    uuid references public.profiles (id) on delete cascade,
  -- 'cancellation' (system-made) or 'promo' (admin-made).
  source      public.voucher_source not null,
  -- How many more times it can be used. Cancellation codes start at 1.
  uses_left   integer not null default 1,
  -- When it stops working. Empty = never expires. Cancellation codes: now + 60 days.
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Codes are unique.
  constraint vouchers_code_unique unique (code),
  -- Codes are 3-32 characters of capital letters, numbers and dashes only.
  constraint vouchers_code_format check (code ~ '^[A-Z0-9-]{3,32}$'),
  -- Exactly one kind of discount: percent OR amount (not both, not neither).
  constraint vouchers_one_discount_type check ((percent_off is null) <> (amount_off is null)),
  -- Percent must be more than 0 and at most 100.
  constraint vouchers_percent_range check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  -- Amount must be more than 0.
  constraint vouchers_amount_positive check (amount_off is null or amount_off > 0),
  -- Uses can't go below zero.
  constraint vouchers_uses_not_negative check (uses_left >= 0),
  -- A cancellation code is always personal (must have an owner).
  constraint vouchers_cancellation_has_owner check (source <> 'cancellation' or owner_id is not null)
);

comment on table public.vouchers is 'Discount codes. Discounts apply to the class fee only, never the mat rental.';

-- "My Vouchers" lists a client's own codes.
create index vouchers_owner_id_idx on public.vouchers (owner_id);
-- Admin "Pricing & Vouchers" filters by source (promo vs system-issued).
create index vouchers_source_idx on public.vouchers (source);

create trigger vouchers_set_updated_at
  before update on public.vouchers
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- TABLE: bookings
-- One row = one seat in one session for one person.
-- Online bookings have a user_id. Walk-ins (added by the admin) have a name and
-- contact instead.
-- The seat check itself is done later by the book_seat() function (next steps).
-- -----------------------------------------------------------------------------
create table public.bookings (
  -- Random unique id for the booking.
  id                     uuid primary key default gen_random_uuid(),
  -- Which class this seat is in. Can't delete a session that has bookings.
  session_id             uuid not null references public.class_sessions (id) on delete restrict,
  -- The client who booked online. Empty for walk-ins.
  -- "restrict" = a user with bookings can't be deleted (deactivate them instead),
  -- so booking and payment history is never lost.
  user_id                uuid references public.profiles (id) on delete restrict,
  -- Walk-in guest's name and contact number (only when user_id is empty).
  walkin_name            text,
  walkin_contact         text,
  -- Where the booking is at (see the booking_status enum above).
  status                 public.booking_status not null default 'pending_payment',
  -- true = renting a mat (the mat fee is donated to feed stray animals).
  mat_rental             boolean not null default false,
  -- The free upsized drink they picked (options come from settings.drink_options).
  drink_choice           text,
  -- The voucher used on this booking, if any.
  voucher_id             uuid references public.vouchers (id) on delete set null,
  -- Prices copied from settings AT BOOKING TIME, so old bookings don't change
  -- if the admin changes prices later. The server works these out, never the browser.
  class_fee              numeric(10, 2) not null,
  mat_fee                numeric(10, 2) not null default 0,
  -- Pesos taken off by the voucher (class fee only).
  discount               numeric(10, 2) not null default 0,
  -- What the client pays: class_fee + mat_fee - discount.
  total                  numeric(10, 2) not null,
  -- Health questions from booking step 2.
  first_time             boolean not null default false,
  health_notes           text,
  not_pregnant_confirmed boolean not null default false,
  -- When they ticked the Registration Agreement.
  agreed_at              timestamptz,
  -- For 'pending_payment': the seat is held until this moment (now + 15 minutes).
  -- After this time the hold simply stops counting; no timer needed.
  hold_expires_at        timestamptz,
  -- If this booking was made by transferring another one, that old booking's id.
  transferred_from       uuid references public.bookings (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Every booking belongs to a user OR has a walk-in name.
  constraint bookings_user_or_walkin check (user_id is not null or nullif(btrim(walkin_name), '') is not null),
  -- No negative money.
  constraint bookings_class_fee_not_negative check (class_fee >= 0),
  constraint bookings_mat_fee_not_negative check (mat_fee >= 0),
  constraint bookings_discount_not_negative check (discount >= 0),
  -- A voucher can only discount the class fee, never the mat rental.
  constraint bookings_discount_max_class_fee check (discount <= class_fee),
  -- No mat rental = no mat fee.
  constraint bookings_mat_fee_needs_rental check (mat_rental or mat_fee = 0),
  -- The total must add up exactly.
  constraint bookings_total_matches check (total = class_fee + mat_fee - discount),
  -- Every booking (online or walk-in) needs the not-pregnant check and the agreement.
  constraint bookings_health_and_agreement check (not_pregnant_confirmed and agreed_at is not null),
  -- A booking waiting for payment must have a hold end time.
  constraint bookings_pending_has_hold check (status <> 'pending_payment' or hold_expires_at is not null),
  -- A booking can't be transferred from itself.
  constraint bookings_not_from_self check (transferred_from is null or transferred_from <> id),
  -- One old booking can only become ONE new booking (part of "transfer once").
  constraint bookings_transferred_from_unique unique (transferred_from)
);

comment on table public.bookings is 'One seat in one class session for one person (online client or walk-in).';

-- Counting seats left: "bookings in this session with these statuses".
create index bookings_session_status_idx on public.bookings (session_id, status);
-- "My Bookings" lists one client's bookings.
create index bookings_user_id_idx on public.bookings (user_id);
-- Admin Dashboard "Needs action" filters by status across all sessions.
create index bookings_status_idx on public.bookings (status);
-- Speeds up the voucher foreign key and "which bookings used this code".
create index bookings_voucher_id_idx on public.bookings (voucher_id);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- TABLE: payments
-- One row = one payment attempt for a booking (a booking can have several,
-- e.g. a failed GCash try and then a successful card payment).
-- We NEVER store card numbers or bank account digits.
-- -----------------------------------------------------------------------------
create table public.payments (
  -- Random unique id for the payment.
  id              uuid primary key default gen_random_uuid(),
  -- Which booking this pays for. "restrict" = money records are never deleted with a booking.
  booking_id      uuid not null references public.bookings (id) on delete restrict,
  -- paymongo / manual / cash.
  provider        public.payment_provider not null,
  -- gcash / maya / card / bpi / cash. Empty while a PayMongo checkout is still open
  -- (we only learn the method once the client pays).
  method          public.payment_method,
  -- Pesos for this attempt.
  amount          numeric(10, 2) not null,
  -- pending / paid / failed / expired / rejected / refunded.
  status          public.payment_status not null default 'pending',
  -- PayMongo's id for this checkout/payment (used by the webhook to find the row).
  paymongo_ref    text,
  -- Where the manual transfer screenshot is saved in Supabase Storage.
  screenshot_path text,
  -- The admin who approved or rejected a manual transfer.
  verified_by     uuid references public.profiles (id) on delete set null,
  -- When the money was received.
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- No negative amounts.
  constraint payments_amount_not_negative check (amount >= 0),
  -- Each PayMongo reference appears only once (stops the webhook counting a payment twice).
  constraint payments_paymongo_ref_unique unique (paymongo_ref),
  -- Methods must fit the provider:
  --   PayMongo -> GCash, Maya or card. Manual transfer -> GCash or BPI. Cash -> cash.
  constraint payments_method_fits_provider check (
    (provider = 'paymongo' and (method is null or method in ('gcash', 'maya', 'card')))
    or (provider = 'manual' and (method is null or method in ('gcash', 'bpi')))
    or (provider = 'cash' and method = 'cash')
  ),
  -- A paid payment must say when it was paid.
  constraint payments_paid_has_time check (status <> 'paid' or paid_at is not null)
);

comment on table public.payments is 'Payment attempts. Stores amount, method, status and PayMongo reference only: never card or bank numbers.';

-- Find all payments for one booking.
create index payments_booking_id_idx on public.payments (booking_id);
-- Admin Billings filters by status.
create index payments_status_idx on public.payments (status);
-- Earnings by day / week / month are grouped by paid_at.
create index payments_paid_at_idx on public.payments (paid_at);
-- Speeds up the verified_by foreign key.
create index payments_verified_by_idx on public.payments (verified_by);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- TABLE: settings
-- One row = one admin setting, stored as key -> value.
-- Examples: class_price = 500, mat_price = 50, cutoff_time = "08:00",
-- hold_minutes = 15, drink_options = ["Iced Matcha", ...], manual_payment_enabled = false.
-- (The default values are added in seed.sql in a later step.)
-- -----------------------------------------------------------------------------
create table public.settings (
  -- The setting's name, e.g. 'class_price'. Lowercase letters and underscores only.
  key        text primary key,
  -- The setting's value as JSON, so it can be a number, text, true/false or a list.
  value      jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Keep keys tidy, e.g. class_price (not "Class Price").
  constraint settings_key_format check (key ~ '^[a-z][a-z0-9_]*$')
);

comment on table public.settings is 'Admin settings as key/value pairs. Prices are always read from here, never hard-coded.';

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- TABLE: site_content
-- One row = one editable block of page text/image, e.g. page 'home', section 'hero'.
-- Edited on the admin Content Management page.
-- -----------------------------------------------------------------------------
create table public.site_content (
  -- Random unique id for the block.
  id         uuid primary key default gen_random_uuid(),
  -- Which page, e.g. 'home', 'about', 'booking'.
  page       text not null,
  -- Which part of the page, e.g. 'hero', 'what_to_bring', 'policy', 'agreement'.
  section    text not null,
  -- Heading text (optional).
  title      text,
  -- Main text (optional).
  body       text,
  -- Where the image is saved in Supabase Storage (optional).
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Each page section exists only once. (Also works as the index for "get this page's content".)
  constraint site_content_unique_block unique (page, section)
);

comment on table public.site_content is 'Editable text and images for Home, About Us, policy and agreement.';

create trigger site_content_set_updated_at
  before update on public.site_content
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- TABLE: email_log
-- One row = one email the system sent. Rows are only ever added, never changed,
-- so this table has sent_at instead of created_at/updated_at.
-- -----------------------------------------------------------------------------
create table public.email_log (
  -- Random unique id for the log entry.
  id         uuid primary key default gen_random_uuid(),
  -- Who got the email (empty for walk-ins or if the user was removed).
  user_id    uuid references public.profiles (id) on delete set null,
  -- Which booking it was about (empty for emails not about one booking).
  booking_id uuid references public.bookings (id) on delete set null,
  -- confirmation / reminder / cancellation / voucher / session_notice / admin_alert.
  type       public.email_type not null,
  -- When it was sent.
  sent_at    timestamptz not null default now()
);

comment on table public.email_log is 'History of emails sent. Used to avoid sending the same reminder twice.';

-- "Was a reminder already sent for this booking?"
create index email_log_booking_id_idx on public.email_log (booking_id);
-- A user's email history.
create index email_log_user_id_idx on public.email_log (user_id);


-- -----------------------------------------------------------------------------
-- SIGN-UP TRIGGER: create a profiles row automatically.
-- -----------------------------------------------------------------------------

-- Runs right after someone signs up in Supabase Auth (a new auth.users row).
-- Takes: the new auth user (Postgres passes it in as "new").
-- Gives back: the same row (required for triggers); its real job is the insert.
--
-- "security definer" = runs with the function owner's rights, because a brand
-- new user isn't allowed to write to profiles yet (RLS).
-- SECURITY: role is NOT read from sign-up data (the user could fake it).
-- Everyone starts as 'client'; only an admin can make someone an admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''  -- safety: always use the exact tables named below
as $$
begin
  insert into public.profiles (id, full_name, email, mobile)
  values (
    new.id,
    -- The sign-up form sends full_name; Google login sends "name". Fall back to ''.
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    -- Mobile number if the sign-up form sent one (empty text becomes null).
    nullif(btrim(new.raw_user_meta_data ->> 'mobile'), '')
  );
  return new;
end;
$$;

-- Connect the function to auth.users: run it once for every new sign-up.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY: switched ON for every table.
-- With RLS on and no policies, the website's keys can't see or change any rows.
-- Policies (who may read/write what) come in the next migration.
-- (Server code using the secret key skips RLS, so the admin tools still work later.)
-- -----------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.schedule_templates enable row level security;
alter table public.class_sessions     enable row level security;
alter table public.vouchers           enable row level security;
alter table public.bookings           enable row level security;
alter table public.payments           enable row level security;
alter table public.settings           enable row level security;
alter table public.site_content       enable row level security;
alter table public.email_log          enable row level security;
