# Progress

Claude Code: update this file at the end of every step. Keep it short.

## Done
- Planning, proposal (`docs/PROPOSAL.md`) and designs (`docs/designs/`)
- Project overview written (`CLAUDE.md`)
- Decided: database first (see CLAUDE.md section 9)
- **Phase A, Step 1: Supabase CLI setup** (2026-10-22)
  - `npx supabase init` → `supabase/config.toml`
  - Logged in and linked to project `mbfshqndgiywphuannuw`
  - `.gitignore` (ignores `.env.local`, `node_modules`, `.next`, Supabase temp files)
  - `.env.example` with key names only (Supabase URL / publishable / secret, PayMongo, site URL, Resend)
- **Phase A, Step 2: Tables** (2026-10-22): `supabase/migrations/20261022000001_tables.sql`, pushed with `npx supabase db push`
  - Enums: `user_role`, `session_status`, `booking_status` (all 10), `payment_provider`, `payment_method`, `payment_status`, `voucher_source`, `email_type`
  - 9 tables: `profiles`, `schedule_templates`, `class_sessions`, `vouchers`, `bookings`, `payments`, `settings`, `site_content`, `email_log`
  - Checks: capacity > 0, money ≥ 0, `total = class_fee + mat_fee - discount`, discount ≤ class fee, user or walk-in name, not-pregnant + agreement required, one discount type per voucher, payment method fits provider, and more
  - `updated_at` trigger on every table that has it; sign-up trigger `handle_new_user()` creates a `profiles` row (always role `client`)
  - RLS **on** for all 9 tables, **no policies yet**, so the browser keys can't read anything until Step 3
  - Tested on a throwaway local Postgres before pushing: all checks reject bad data as expected
- **Phase A, Step 3: Security** (2026-10-22): `supabase/migrations/20261022000002_security.sql`, pushed
  - `is_admin()`: security definer, empty search_path; only an **active** admin counts
  - Trigger `protect_profile_admin_fields()`: browser users who aren't admins can't change `role` or `is_active` (fixes the Step 2 note)
  - New column `settings.is_public` (default **false** = admins only)
  - Grants: guests can only SELECT `schedule_templates`, `class_sessions`, `settings`, `site_content`; everything else revoked from guests
  - Policies: public read on templates/sessions/site content/public settings; clients read only their own profile, bookings, payments and personal vouchers; clients can edit their own profile; everything else admin only; `email_log` admin only
  - Tested on throwaway PGlite as guest / client A / client B / admin / server key: 36 actions × 5, all as expected
- **Phase A, Step 4: Functions** (2026-10-22): `supabase/migrations/20261022000003_functions.sql` (**not pushed yet**: run `npx supabase db push`)
  - Website calls (`supabase.rpc(...)`): `seats_left`, `get_open_sessions`, `check_voucher`, `book_seat`, `cancel_my_booking`, `transfer_my_booking`, `deactivate_my_account`, `generate_sessions`, `admin_walkin_booking`, `admin_set_attendance`, `admin_cancel_session`, `admin_review_manual_payment`
  - Private helpers (no browser role can call them): settings readers, `manila_today`, `at_manila`, `booking_closes_at`, `seats_taken`, `my_seat_status`, `require_active_user`, `require_admin`, `check_drink_choice`, `find_usable_voucher`, `voucher_discount`
  - `book_seat` locks the class row (`for update`), checks open / cutoff / one seat per person / seat free, reads prices + hold minutes from settings, applies the voucher to the class fee only, and saves `pending_payment` with the hold
  - Trigger `bookings_spend_voucher`: a voucher use is **reserved** while its booking holds a seat and **spent** (`uses_left - 1`) when the booking becomes `confirmed` / `paid_needs_action`, whoever confirms it
  - Every security definer function uses `search_path = ''` and checks the caller first; guests can only call `seats_left` and `get_open_sessions`
  - Tested on a throwaway **real** Postgres 18 (`embedded-postgres`, server clock in UTC): **64/64 passed**. Covered: 5 simultaneous connections on a 4-seat class (4 booked, 1 "Sorry, this class is full."), expired holds, cutoff, vouchers vs mat, all 3 cancel windows, transfer once, cafe-cancelled free transfer, admin-only, deactivate

## Next
- Phase A, Step 5: Seed and test: `supabase/seed.sql` (default settings with `is_public`, Thu–Sun templates, `generate_sessions(4)`, sample bookings, one admin) and a permanent test script in `supabase/tests/`

## Known problems / notes
- **Seats rule, small addition:** `attended` bookings also count as taking a seat (on top of confirmed / awaiting_verification / live pending). Otherwise, once the admin marks people attended on class day, a walk-in could overbook.
- **Unpaid hold, same class:** a client with a live `pending_payment` hold can't book the same class again until it ends ("finish paying"). Phase D should let them resume the existing booking's checkout.
- **Phase D must:** (1) the webhook just sets the booking to `confirmed` / `paid_needs_action`, and the trigger spends the voucher, so don't spend it in code too; (2) add a function for the manual transfer step (client uploads screenshot → booking `awaiting_verification` + a `manual` / `pending` payment row). `admin_review_manual_payment` already handles the admin side.
- After a transfer, payments stay on the **original** booking. Follow `transferred_from` to show them.
- `admin_cancel_session` leaves bookings as they are (including unpaid holds). A PayMongo payment for a cancelled class needs the late-payment rule in Phase D.
- Walk-ins can't use voucher codes (not in the spec). `book_seat` doesn't save name / mobile / Instagram: the booking page updates the profile itself (clients may edit their own profile).
- **For Step 5:** seed must set `is_public = true` on the settings the website reads (prices, cutoff, hold minutes, drink options, manual payment on/off, contact + GCash/BPI details). Private ones stay `false`.
- "Deactivate my account" (My Profile) calls `deactivate_my_account()`. A direct update is blocked by the trigger, on purpose.
- Clients can still edit the `email` column of their own profile. It's only a display copy; real login email changes go through Supabase Auth. Sync it later if needed.
- Storage bucket policies (logo, page images, payment screenshots) are not done yet; they come with the pages that upload files.
- Users who have bookings can't be deleted (`bookings.user_id` is `on delete restrict`), on purpose. Deactivate them instead (`is_active = false`). Test users with no bookings can be deleted normally.
- Money is `numeric(10,2)` in pesos. Convert to centavos (× 100) only when calling PayMongo.
- Class `date` / `start_time` / `end_time` are Philippine time (Asia/Manila).
- Default settings, templates and the admin user are not added yet. They go in `supabase/seed.sql` (Step 5).
- `.env.local` must be made by hand from `.env.example` (keys are never pasted in chat).
