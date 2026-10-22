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
  - RLS **on** for all 9 tables
- **Phase A, Step 3: Security** (2026-10-22): `supabase/migrations/20261022000002_security.sql`, pushed
  - `is_admin()`: security definer, empty search_path; only an **active** admin counts
  - Trigger `protect_profile_admin_fields()`: browser users who aren't admins can't change `role` or `is_active`
  - New column `settings.is_public` (default **false** = admins only)
  - Grants: guests can only SELECT `schedule_templates`, `class_sessions`, `settings`, `site_content`; everything else revoked from guests
  - Policies: public read on templates/sessions/site content/public settings; clients read only their own profile, bookings, payments and personal vouchers; clients can edit their own profile; everything else admin only; `email_log` admin only
- **Phase A, Step 4: Functions** (2026-10-22): `supabase/migrations/20261022000003_functions.sql`
  - Website calls (`supabase.rpc(...)`): `seats_left`, `get_open_sessions`, `check_voucher`, `book_seat`, `cancel_my_booking`, `transfer_my_booking`, `deactivate_my_account`, `generate_sessions`, `admin_walkin_booking`, `admin_set_attendance`, `admin_cancel_session`, `admin_review_manual_payment`
  - Private helpers (no browser role can call them): settings readers, `manila_today`, `at_manila`, `booking_closes_at`, `seats_taken`, `my_seat_status`, `require_active_user`, `require_admin`, `check_drink_choice`, `find_usable_voucher`, `voucher_discount`
  - `book_seat` locks the class row (`for update`), checks open / cutoff / one seat per person / seat free, reads prices + hold minutes from settings, applies the voucher to the class fee only, and saves `pending_payment` with the hold
  - Trigger `bookings_spend_voucher`: a voucher use is **reserved** while its booking holds a seat and **spent** (`uses_left - 1`) when the booking becomes `confirmed` / `paid_needs_action`, whoever confirms it
- **Phase A, Step 5: Default data, sample data and permanent tests** (2026-10-22)
  - CLAUDE.md section 5: "Seats left" now also counts `attended` (matches `seats_taken()`)
  - `supabase/migrations/20261022000004_default_data.sql` (real site data, safe to run twice, never overwrites admin edits):
    - 21 settings. **Public (19):** class_price 500, mat_price 50, cutoff_time "08:00", hold_minutes 15, drink_options (6), manual_payment_enabled true, cafe_name, cafe_address, cafe_email, cafe_phone, maps_url, logo_path (null), instagram_url, facebook_url, chat_url, gcash_name, gcash_number, bpi_account_name, bpi_account_number. **Private (2):** admin_alert_email, sessions_weeks_ahead
    - 8 templates (Thu–Sun × 9:00–9:50 / 10:15–11:05, 4 seats)
    - 16 `site_content` blocks: home (hero, about_class, location_drink, feature_1-3, health_note), about (cafe, instructor, visit, contact, health_safety), booking (what_to_bring, cancellation_policy, agreement), footer (strays_note). List blocks = one item per line. No prices in page text.
    - `generate_sessions(4)` → 32 classes from the day it's pushed
  - `supabase/seed.sql` (**test only, not pushed**): 3 sample clients who can't log in, `WELCOME10` (10%), expired `HALF-OLD001`, valid `HALF-BEA001`, 13 bookings covering all 10 statuses, 12 payments
  - Permanent tests: `npm run test:db` (`package.json`, `supabase/tests/`, README there). Throwaway **Postgres 17** via `embedded-postgres`, all migrations, a fresh database per test file. **157/157 passed**: default data 25, security 44, booking 36 (incl. 5 people / 4 seats at once), cancel + transfer 18, admin + account 21, seed 13
- **Phase A (database) is complete**: all 4 migrations are pushed (checked with `npx supabase migration list`)
- **Phase B, Step 6: Website setup** (2026-10-23)
  - **Next.js 16.4.2** (App Router, TypeScript, Tailwind 4, ESLint, `src/`), made in a temp folder and merged in. `package.json` keeps `test:db`, `embedded-postgres` and `pg`, and adds `@supabase/ssr`, `@supabase/supabase-js`, `lucide-react` and the `supabase` CLI (devDependency). Tailwind/PostCSS packages are exactly as create-next-app made them (`@tailwindcss/turbopack`, no postcss config)
  - Scripts: `dev`, `build`, `start`, `lint`, `test:db`, `gen:types` (writes `src/types/database.ts`; **use `npm run gen:types`, not `npx ... > file` in PowerShell**, which saves the file as UTF-16, and TypeScript can't read that)
  - `.gitignore`: `.env`, `.env.local`, `.env*.local` ignored; `!.env.example` keeps the template visible; added `*.pem`, `coverage/`
  - Design system: all colors from CLAUDE.md §7 as `@theme` tokens in `src/app/globals.css` (+ `admin-line`, `brown-line`, `caramel`, status `success/info/warning/error(-bg)`), Poppins (`font-heading`) + Montserrat (`font-sans`, default) via `next/font/google`
  - `src/components/ui/`: Button + ButtonLink (primary, secondary, danger, light, lightOutline), Card, Badge (success, info, warning, error, neutral), Input, Select, Checkbox (labels above, 44px tap targets, 16px text on phones so iPhones don't zoom)
  - Layout: `src/app/(client)/layout.tsx` = skip link + Header + page + Footer. Header (brown, 64px phone / 96px laptop, nav, Chat With Us from `chat_url`, Log in; full-screen phone menu like PhoneMenu.html). Footer (address, email, IG/FB, quick links, strays note from `site_content`)
  - Supabase: `src/lib/supabase/` `client.ts` (browser), `server.ts` (reads login cookies), `public.ts` (guest client, no cookies, for public data), `proxy.ts` + **`src/proxy.ts`** (Next.js 16's new name for middleware: refreshes the login with `getClaims()`)
  - Data: `src/lib/data/settings.ts` (`getPublicSettings`, cached `minutes` + tag `settings`), `content.ts` (`getPageContent`, cached `hours` + tag `site-content`), `sessions.ts` (`getUpcomingSessions`, **never cached**: `connection()` + `<Suspense>`, so seats left are always live)
  - Home page (`src/app/(client)/page.tsx`): hero text from `site_content`, price from `settings`, "Next open sessions" (6) from `get_open_sessions()` with seat badges, What's included + health note. Phone: one column; laptop: two-column hero, 3 sessions per row
  - Checked: `tsc` and `lint` clean, `npm run build` OK (`/` = Partial Prerender: shell revalidates every 1 min, sessions stream live), the built site showed real classes (Fri 23 to Sun 25, "4 left")
  - DB tests made time-of-day proof: `sessionIn()` never pushes a still-running class onto yesterday, new `sessionToday()`, cutoff checks no longer skip near midnight; the Windows `EBUSY` crash when deleting the temp database folder is fixed (`persistent: true` + retrying delete). **157/157 passed at 12:19 AM Manila**, 3 runs in a row
- **Fix: `AbortError` in the `npm run dev` terminal on Home** (2026-10-23): this was dev-mode noise. Next.js stops an extra check render early, and that cancels the session list's database call. `SessionList` in `src/app/(client)/page.tsx` now passes an `AbortError` on quietly instead of logging it. Real database errors are still logged

## Next
- **Phase B, Step 7: Auth**: log in, sign up, forgot password, admin redirect, route protection in `src/proxy.ts`, and the logged-in Header (initials, My Account sub-links, Log out)

## Known problems / notes
- **Caching rule (Next.js Cache Components is on):** nothing is cached unless it says `'use cache'`. Seats left / `get_open_sessions()` / bookings must **never** be cached. Anything reading cookies or live data goes inside `<Suspense>`. When admin pages save settings or page text (Step 11), call `updateTag('settings')` / `updateTag('site-content')` in the server action so the change shows at once.
- `AGENTS.md`: `npm run dev` creates it in the project root (Next.js notes for AI tools). It never touches `CLAUDE.md`. Fine to commit.
- Home page bits still typed in the code (Step 8 should move them to `site_content` or settings if wanted): the "Mindful Mat Pilates · Thu to Sun" line and the "What's included" list (its mat price already comes from settings).
- Links to `/about`, `/book`, `/account` and `/login` show "page not found" until Steps 7 to 10. No favicon yet (comes with the logo upload).
- `npm audit`: 0 problems in website packages; 5 "high" in dev-only tools (old `braces`). Don't run `npm audit fix --force` (it would install breaking versions).
- **Placeholders to fill in** (Settings / Content pages later, or Table Editor now): `[CAFE PHONE NUMBER]`, `[GCASH ACCOUNT NAME]`, `[GCASH NUMBER]`, `[BPI ACCOUNT NAME]`, `[BPI ACCOUNT NUMBER]`, `[INSTRUCTOR NAME]` + bio. Also check `chat_url` (guessed `m.me/block69cafe`) and the Registration Agreement wording (a draft; the cafe should review it).
- **Unpaid hold, same class:** a client with a live `pending_payment` hold can't book the same class again until it ends ("finish paying"). Phase D should let them resume the existing booking's checkout.
- **Phase D must:** (1) the webhook just sets the booking to `confirmed` / `paid_needs_action`, and the trigger spends the voucher, so don't spend it in code too; (2) add a function for the manual transfer step (client uploads screenshot → booking `awaiting_verification` + a `manual` / `pending` payment row). `admin_review_manual_payment` already handles the admin side.
- After a transfer, payments stay on the **original** booking. Follow `transferred_from` to show them.
- `admin_cancel_session` leaves bookings as they are (including unpaid holds). A PayMongo payment for a cancelled class needs the late-payment rule in Phase D.
- Walk-ins can't use voucher codes (not in the spec). `book_seat` doesn't save name / mobile / Instagram: the booking page updates the profile itself (clients may edit their own profile).
- "Deactivate my account" (My Profile) calls `deactivate_my_account()`. A direct update is blocked by the trigger, on purpose.
- Clients can still edit the `email` column of their own profile. It's only a display copy; real login email changes go through Supabase Auth. Sync it later if needed.
- Storage bucket policies (logo, page images, payment screenshots) are not done yet; they come with the pages that upload files.
- Users who have bookings can't be deleted (`bookings.user_id` is `on delete restrict`), on purpose. Deactivate them instead (`is_active = false`). Test users with no bookings can be deleted normally.
- Money is `numeric(10,2)` in pesos. Convert to centavos (× 100) only when calling PayMongo.
- Class `date` / `start_time` / `end_time` are Philippine time (Asia/Manila).
- Classes only exist 4 weeks ahead until the nightly pg_cron job is added (Phase E). Until then, an admin (or the SQL Editor) can run `select public.generate_sessions(4);` to add more.
- `.env.local` must be made by hand from `.env.example` (keys are never pasted in chat).
