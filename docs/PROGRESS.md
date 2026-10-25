# Progress

Short status only. Full details of every step (files, tests, checks, old notes) are in `docs/progress-archive.md` (frozen copy up to Change 17, 2026-10-23).
**Update rule:** after each step, add **3–5 short lines** here (done, next, any new rule or problem). Long details don't go here.

## Done
- A1 Supabase CLI set up, linked to project `mbfshqndgiywphuannuw`, `.env.example` (2026-10-22)
- A2 Tables, enums, checks, sign-up trigger, RLS on (migration 1)
- A3 Security: `is_admin()`, RLS policies, profile guard trigger, `settings.is_public` (migration 2)
- A4 Functions: `book_seat` (locked), seats, cancel / transfer, vouchers, walk-in, attendance (migration 3)
- A5 Default data (migration 4), test-only `seed.sql`, `npm run test:db`
- B6 Next.js 16 + Tailwind 4 tokens, Poppins / Montserrat, UI components, Supabase clients, `src/proxy.ts`
- B7 Login, sign-up, forgot / reset password, `/auth/confirm`, route protection (proxy + `requireUser` / `requireAdmin`)
- C8 Home, About Us, Policies, 404, `{fill-in}` words in page text (migration 5)
- C9 Booking steps 1–3, hold countdown, You're booked, Change details (migrations 6–7)
- C10 My Account: bookings (cancel / transfer), payments + receipts, vouchers, notifications, profile (migration 8)
- C11.1 Admin frame, Dashboard, Bookings, Walk-in, Attendance, Cancel class (migration 9)
- C11.2 Admin Payments, Pricing & Vouchers, Schedule, Settings, Content, Users, admin cancel / transfer with override reason (migration 10)
- D12 PayMongo test mode: checkout, return check, webhook, late-payment rule, manual transfer upload (migration 11)
- R1 Separate `/admin/login`, floating Chat button, notifications table, birthday on sign-up (migration 12)
- Change 16: "Next open sessions" removed from Home
- Change 17 (Proposal 3): green / beige client theme, bell, Google login + Save login, new Home / About text, month navigator + date chips, no not-pregnant tick, 9 weeks of classes, My Profile 3 cards (email, password, deactivate, delete), payments filter (migrations 13–16, all pushed 2026-10-23)
- Last checks: `test:db` 570/570, `test:unit` 40/40, `tsc` / `lint` / `build` clean
- 2026-10-25: docs trimmed (this file, CLAUDE.md); old PROGRESS kept as `progress-archive.md`

## Next
- **Transfer bug:** some open dates seemed missing on the transfer page (Thu Oct 29 10:15). Find the real cause and add a test that every open class with seats shows
- **Home page** to match Figma node 103-26 (a bigger export would help), then Revisions part 2 (admin) and part 3 (emails)
- **Step 13** deploy (`docs/prompts/13-deploy.md`), **Step 14** emails + pg_cron + Communications (`14-emails-reminders.md`), **Step 15** final check (`15-final-check.md`)
- **You, `.env.local`:** add `SUPABASE_SECRET_KEY` (webhook, PayMongo return, Delete account) and `PAYMONGO_SECRET_KEY`, then restart `npm run dev`
- **You, Supabase dashboard:** turn ON "Require current password when updating"; enable the Google provider (Google Cloud OAuth client, redirect `https://mbfshqndgiywphuannuw.supabase.co/auth/v1/callback`); delete the throwaway `step10-check-…@example.com` users
- **You, after SMTP (Step 14):** Change Email template shows `{{ .Token }}` (keep Secure email change ON); Reset password → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`; Confirm signup → same with `type=email`; then turn Confirm email ON and retest
- **You, after deploy:** add the Vercel URL to Supabase Site URL + Redirect URLs (`https://<site>/**`, keep localhost); add the PayMongo webhook `https://<site>/api/paymongo/webhook` (event `checkout_session.payment.paid`) and put its secret in Vercel as `PAYMONGO_WEBHOOK_SECRET`
- **You:** click-throughs at 390px and 1440px for Step 11 (both parts), Step 12, R1 and Change 17 (SQL in `supabase/manual-tests/`, setup + cleanup, pasted by hand); fill in the [PLACEHOLDERS] on admin Settings and Content

## Rules that still matter
- **`await io()`** (from `next/cache`) before `createClient()` from `src/lib/supabase/server.ts` in page code, inside `<Suspense>`. Server Actions and route handlers don't need it
- **Caching:** Cache Components is on; nothing is cached without `'use cache'`. Never cache seats, `get_open_sessions()` or bookings. Cookies / live data go inside `<Suspense>`. After admin saves, call `updateTag('settings' | 'schedule' | 'site-content')`
- **No `₱` or other non-English characters in migration files**, even in comments (the Windows test database reads them as WIN1252). Use `{class_price}` in page text and "pesos" in comments
- **Types:** `npm run gen:types` after every `db push`, never `npx ... > file` in PowerShell (saves UTF-16)
- **New fill-in word:** add it to `FILL_INS` (`src/lib/content-text.ts`) **and** `KNOWN_FILL_INS` (`supabase/tests/08-page-content.test.mjs`)
- **Env keys** (`.env.example`, values only in `.env.local`, made by hand): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server only), `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` (can stay empty on localhost), `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY` (unused; Step 14 plans Gmail SMTP keys `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`)
- `supabase/manual-tests/*.sql` and `seed.sql` are test data, pasted by hand, never pushed. Test promo codes start with TEST so cleanup removes them
- Client Server Actions refuse admins (`STAFF_ACCOUNT_ERROR`); admin actions re-check `is_admin()` before calling the database
- Money is `numeric(10,2)` pesos (× 100 only for PayMongo). Class dates and times are Manila time
- After a transfer, payments stay on the **original** booking (follow `transferred_from`)
- Users with bookings are never hard-deleted (`on delete restrict`): deactivate, or `close_my_account()` (soft delete)
- Don't run `npm audit fix --force`

## Known limits (details in the archive)
- PayMongo checkouts never expire by themselves; late payments go through the late-payment rule. PayMongo refuses totals of about ₱1–19
- Until Step 14 SMTP: Confirm email is OFF, reset links work only in the same browser, few emails per hour, Change email can't be tested
- Deactivated check runs only at login, `/account/*` and `/admin/*` (the database still refuses their bookings)
- On purpose (ask before adding): no logo upload or favicon, no walk-in transfer reference, no status log table, no cash refunds in the site, closing a day = close its classes one by one
- Online bookings save `first_time = false`; admin pages still show "first time"
