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

## Next
- Phase A, Step 3: Security: RLS policies for every table, plus the `is_admin()` helper

## Known problems / notes
- **For Step 3:** a client must NOT be able to change their own `role` (or `is_active`) on `profiles`. The update policy alone allows any column, so we also need a column limit or a trigger.
- Users who have bookings can't be deleted (`bookings.user_id` is `on delete restrict`), on purpose. Deactivate them instead (`is_active = false`). Test users with no bookings can be deleted normally.
- Money is `numeric(10,2)` in pesos. Convert to centavos (× 100) only when calling PayMongo.
- Class `date` / `start_time` / `end_time` are Philippine time (Asia/Manila).
- Default settings, templates and the admin user are not added yet. They go in `supabase/seed.sql` (Step 5).
- `.env.local` must be made by hand from `.env.example` (keys are never pasted in chat).
