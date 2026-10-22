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
- **Phase A, Step 3: Security** (2026-10-22): `supabase/migrations/20261022000002_security.sql` (**not pushed yet**: run `npx supabase db push`)
  - `is_admin()`: security definer, empty search_path; only an **active** admin counts
  - Trigger `protect_profile_admin_fields()`: browser users who aren't admins can't change `role` or `is_active` (fixes the Step 2 note)
  - New column `settings.is_public` (default **false** = admins only)
  - Grants: guests can only SELECT `schedule_templates`, `class_sessions`, `settings`, `site_content`; everything else revoked from guests
  - Policies: public read on templates/sessions/site content/public settings; clients read only their own profile, bookings, payments and personal vouchers; clients can edit their own profile; everything else admin only; `email_log` admin only
  - Tested on throwaway PGlite as guest / client A / client B / admin / server key: 36 actions × 5, all as expected

## Next
- Phase A, Step 4: Functions: `seats_left()`, `book_seat()`, `generate_sessions()`, cancel/transfer rules, voucher check

## Known problems / notes
- **For Step 4:** clients can't insert/update bookings, payments or vouchers directly, so `book_seat`, cancel, transfer, the voucher check and `seats_left` must be `security definer` functions (with `set search_path = ''`) that check `auth.uid()` themselves. Guests can't read bookings, so seats left must come from `seats_left()`.
- **For Step 5:** seed must set `is_public = true` on the settings the website reads (prices, cutoff, hold minutes, drink options, manual payment on/off, contact + GCash/BPI details). Private ones stay `false`.
- "Deactivate my account" (My Profile) can't be a direct update from the browser (trigger blocks `is_active`). Do it through a server route or a function later.
- Clients can still edit the `email` column of their own profile. It's only a display copy; real login email changes go through Supabase Auth. Sync it later if needed.
- Storage bucket policies (logo, page images, payment screenshots) are not done yet; they come with the pages that upload files.
- Users who have bookings can't be deleted (`bookings.user_id` is `on delete restrict`), on purpose. Deactivate them instead (`is_active = false`). Test users with no bookings can be deleted normally.
- Money is `numeric(10,2)` in pesos. Convert to centavos (× 100) only when calling PayMongo.
- Class `date` / `start_time` / `end_time` are Philippine time (Asia/Manila).
- Default settings, templates and the admin user are not added yet. They go in `supabase/seed.sql` (Step 5).
- `.env.local` must be made by hand from `.env.example` (keys are never pasted in chat).
