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
- 2026-10-25: docs trimmed (this file, CLAUDE.md); old PROGRESS kept as `progress-archive.md`
- 2026-10-26 Version 1.4 (client): no Save login (always remembered), Log out only on My Profile, one-code email change (password first), Deactivate blocked like Delete + "Welcome back!" self-reactivation (`/reactivate`), payments filter tidy, Notification Settings, 11-digit phone box, Home mat card -> `/book?mat=yes` (migration 17, pushed 2026-10-26, types regenerated)
- 2026-10-26 Version 1.4 (admin part 1): split `/admin/login`, no cross-login links, admin Log out -> `/admin/login`, no View website, Walk-in + Attendance pages removed, Dashboard 2 cards + View all + Overview grid, Bookings chips (Forfeited incl. no-show), booking details: "Class cancelled", cancel-only box (no admin transfer), Attendance only when paid, printable `/admin/receipt/[id]` (migration 18 `v14_admin`, pushed 2026-10-26, types regenerated)
- 2026-10-26 Late payments: clients move their own `paid_needs_action` booking free, any time ("Move to another class" on My Bookings), only if paid covers the total (migration 19 `late_transfer`, pushed, types regenerated)
- 2026-10-26 Version 1.4 (admin part 2): Schedule = 2 tables (weekly pattern with Edit pop-up; upcoming classes, 10 per page) + Create classes; Content = hub of 5 cards -> `/admin/content/<section>` (no Fill-in sidebar); Users = table with search / sort / pages, View, Edit (name, mobile, Instagram, birthday), Communications (email message, resend confirmation, history); no Deactivate / Make admin buttons
- Emails: Gmail SMTP via nodemailer (`src/lib/email.ts`, never throws), admin-only `communications` log; email-changed alert to the OLD email is ours now (migration 20 `v14_admin_users`, pushed 2026-10-26, types regenerated)
- 2026-10-26 Admin phones: Schedule rows and other admin tables (Pricing 50% codes, Payments weekly earnings) are stacked cards under 768px; every admin grid has `grid-cols-1` so nothing widens the page; "Open classes for booking" always makes 9 weeks and says how many were new
- 2026-10-26 My Profile: Log out sits in the profile header card (full width under the name on phones)
- 2026-10-26 Receipts: shop-style narrow sheet (`src/components/receipt/ReceiptSheet.tsx`) on `/account/payments/[id]` and `/admin/receipt/[id]`; "Download receipt (PDF)" made on the server with **pdf-lib** (`src/lib/receipt-pdf.ts`, routes `.../pdf`, owner or admin only, `Block69-Receipt-<no>.pdf`)
- 2026-10-26 Receipts: Print button removed (print the PDF instead; `PrintButton` deleted); admin booking link now says "View receipt"; `@page { margin: 0 }` stays for Ctrl+P
- PDF limit: its built-in Helvetica font can't draw the peso sign, so the PDF says "PHP 550.00" (the web page still shows the peso sign)
- 2026-10-26 Login security: wrong password, unknown email, admin on `/login`, client on `/admin/login` and an admin Google account all get one message, "Incorrect email or password." (signed out at once, no staff hint; `INCORRECT_LOGIN_MESSAGE` in `src/lib/auth/login-portal.ts`); role checked before the deactivated check
- 2026-10-27 Fix "Can't resolve 'nodemailer'": packages were listed but not installed; `npm install` fixed it. `sendEmail()` now also logs when the SMTP keys are missing. After pulling new packages, always run `npm install`
- 2026-10-27 Remote check: `migration list` shows all 20 on Local and Remote (nothing to push); `gen:types` unchanged; live guest checks: old `book_seat` -> PGRST202, new `book_seat` / `my_account_deletion_blockers` / `close_my_account` -> 42501 (exist, guests refused)
- 2026-11-02 Version 1.5 client: Google button = logo + "Google", plain "Google sign-in isn't available yet" when the provider is off; mat card under "Ready for your first class?"; no About Chat button; "Book Now"; ▶ month arrow fixed (next/form dropped the clicked button's `show_month`; arrows now build the URL); classes Thu–Sat only (Sunday templates off, empty future Sundays deleted); free move after a cafe cancel has a window (`reschedule_window_days`, default 30, from the later of cancel day / class day; "Move by …"; after it: Past, no credit) (migration 21 `v15_client`, pushed, types regenerated)
- 2026-11-02 Version 1.5 admin: "Pending Attendance Verification" = confirmed + class ended (worked out, no new status, under Needs action); Attended and No-show chips (Forfeited = real forfeits only); Bookings 10 per page (`p_offset`) (migration 22 `v15_admin`, pushed, types regenerated). Email code checked, only the SMTP keys are missing
- 2026-11-02 Client footer = header green (`bg-primary`), cream text / white headings (AA on sage-dark; sage-light text fails there), Chat button has a cream ring so it never blends into the footer; admin unchanged
- 2026-11-02 Home "Ready for your first class?" box = header green (`bg-primary`), cream body text; it was the last brown block on the client side (brown stays only for text accents, secondary outlines, neutral badges, focus rings)
- 2026-11-15 Version 1.6 client: /login Google button only logs in existing accounts (a brand-new one is deleted again, "No account found"; `?mode=login|signup`), Log out on Finish your profile; 18+ birthday everywhere + DB trigger `profiles_zz_check_birthday_age` (old rows untouched); cafe cancel releases unpaid holds ("not charged"), awaiting_verification stays with its own update; "Awaiting verification" + hourglass, "Payment rejected" + Book again; logged-in admins sent to /admin from Home / About / Policies too (migration 23 `v16_client`, pushed, types regenerated)
- 2026-11-15 Version 1.6 admin: Bookings -> **Appointments** (/admin/appointments; old links redirect), 6 chips (All / Pending + count / Confirmed / Done / Cancelled / Re-scheduled; DB statuses unchanged, map in `src/lib/admin/display.ts`), Action column (eye = read-only view + Download PDF, pencil = manage: Confirm with full screenshot, Reject with reason, Cancel, Re-schedule with reason + email + bell); Cancel class only on Schedule; Payments -> **Earnings** (view-only) (migration 24 `v16_admin`: `admin_reschedule_booking`, `admin_reject_payment`; pushed, types regenerated)
- **Version 1.7 Prompt C** (2026-11-16): birthday 18 to 100 (form + server + DB trigger, migration 25 `v17_birthday`); "Transfer" -> "Re-schedule" in every visible word (old DB messages swapped in `src/lib/reschedule-wording.ts`; columns, enums, routes and GCash / BPI "transfer" unchanged); Change email shows the real reason + logs the full error (`src/lib/auth/email-change-errors.ts`)
- Version 1.7 Prompt C admin: Guest card = no First time / Not pregnant, "Booked <date time>"; eye view = one "Download Receipt" + payment screenshots; Earnings = no "By payment method" card, Method filter All / PayMongo / GCash transfer / BPI transfer (`p_provider`, migration 26 `v17_payments_filter`); Users 5 per page. Both migrations pushed, types regenerated
- **Version 1.7 Prompt D** (2026-11-16): Appointments "All" = every status (ended holds too), 5 per page, Show defaults to All dates (upcoming first, then past); old re-scheduled rows never listed (no "Re-scheduled" chip), the new booking shows "Moved from" (migration 27 `v17_appointments`)
- Prompt D cancel: `CancelAppointmentBox` = Free re-schedule (100% FREE- code, preselected) / Normal policy (>24h = 100%, 12-24h = 50%, <12h = none) / Refunded outside the website (payment -> `refunded`, Earnings drops it, status stays `forfeited`); reason required; one bell update + email; logged. My Bookings says "Cancelled by the cafe" + what they got
- Prompt D schedule: "Open classes" card removed, "Add class time" -> "Add class"; a trigger opens 9 weeks when the pattern is saved and removes never-booked future classes on a day/time change or Off; pg_cron `block69-keep-classes-open` at 00:05 Manila (migration 28 `v17_schedule`, job confirmed active). Both migrations pushed, types regenerated
- Last checks: `test:db` 888/888, `test:unit` 69/69, `tsc` / `lint` / `build` clean

## Version 1.8

- Batch 1 (PDF pp. 1–3, 5–6): Next.js 16.4.6, test-only PayMongo guard, verified account deletion, and typed signup email codes.
- Account-closure migration passed locally (890/890); it changes function access only. Live push needs separate approval. Unit tests 70/70; TypeScript, lint and build passed.
- Pending provider checks: PayMongo test key/webhook, Google OAuth branding (the provider is on), and hosted OTP template, SMTP and Confirm email (currently off).
- Batch 2 (PDF pp. 4, 7–8, 15–16): dated classes, future-month booking, five-row lists, owned receipts and scrollable policy dialogs.
- Batch 3 (PDF pp. 9–14): manual transfer proof and cutoff, booking sort and Done, action emails, and five-row Earnings pages.
- Verified account closure is staged: server function in migrations; legacy revoke held in supabase/rollout until after deployment.
- Batch 4 (PDF pp. 16–22): voucher dialogs and paging, live content preview, user editing and recovery, settings pencils.
- Final verification (2026-11-21 Manila): DB 921/921, unit 71/71, TypeScript, lint and Next.js 16.4.6 production build passed.
- Read-only linked history matched through 20261117000002. Pending migrations are 20261121000001 through 20261121000005. The legacy closure revoke is outside the push.
- The linked database had one ended appointment eligible for the manual-transfer expiry and no future eligible appointments at the snapshot. Its nightly generator was active at 00:05 Manila and the manual-transfer expiry job was absent.
- Rollout: apply closure stage 1 before deploying; revoke the legacy closure only after the updated app is verified. Pause manual-transfer submissions for the reference migration and app cutover.
- The production build served HTTP on port 3023. Home, signup, policies and admin login returned 200. Both booking URLs returned the class-loading fallback against the linked database. Protected admin URLs redirected to login. Browser access was unavailable, so neither viewport nor the Next.js warning was visually checked.
- Calendar follow-up: both booking requests hit the same server error. PostgREST could not find public.bookable_class_months(), which is added by 20261121000002. All five migrations applied in disposable Postgres and the focused Version 1.8 suite passed 27/27. Local Supabase status confirmed Docker and Podman are unavailable, so the app-facing retest remains pending.
- End-to-end Auth, email and recovery need isolated Supabase Auth with test inboxes and SMTP. Staff email changes use replacement-inbox confirmation. PayMongo test checkout needs a test key, webhook signing secret and reachable test endpoint.

## Version 1.9 (2026-11-21)

- Client: My Bookings View / Manage (eye / pen icons) and Payments receipt (icon, "Action" header) open pop-ups (`RouteModal`, `?view=` / `?manage=` / `?receipt=`); Home blocks moved to `HomeSections`, also used by the admin Home "Live preview" (`data-theme="client"`, inert)
- Admin: Appointments Sort no longer cut off; Earnings "Action" header + Newest / Oldest sort; Schedule "Sort by date" under the title (intro line removed); new booking (PayMongo paid, screenshot sent, free, late payment) emails Settings > Alert email via `after()` (`src/lib/booking/admin-booking-alert.ts`)
- PayMongo "couldn't open" cause: **`PAYMONGO_SECRET_KEY` is empty in `.env.local`** (and no `SMTP_*` keys there either). Pay now checks the set-up first and logs the fix + PayMongo's full error answer in the `npm run dev` terminal
- Migration `20261121000006_v19_admin_sorting` (p_sort on `admin_list_payments`, `admin_upcoming_classes`) pushed 2026-11-21; `gen:types` matched the hand edit. The 5 Version 1.8 migrations were already live; the stage-2 closure revoke (`supabase/rollout/`) is still held. Checks: DB 930/930, unit 79/79, tsc / lint / build clean

## Next
- **You:** click-through Prompt C + D at 390px and 1440px (admin cancel all 3 choices on a test booking, then My Bookings / bell / My Vouchers as that client; Schedule add / edit / Off a class time); try Change email once and read the `Change email (send code) failed:` line in the `npm run dev` terminal
- **You:** click-through Version 1.6 admin (Appointments chips, eye / pencil, PDF, re-schedule, reject; Earnings) at 390px and 1440px
- **You:** click-through Version 1.6 at 390px and 1440px (needs Google ON and `SUPABASE_SECRET_KEY` in `.env.local` for the "No account found" delete)
- **You:** click-through Version 1.5 at 390px and 1440px (`supabase/manual-tests/v15-setup.sql` / `v15-cleanup.sql`, test classes end in :15 seconds); enable Google (then test a new Google account + Finish your profile)
- **You:** click-through Version 1.4 (client + admin part 1) at 390px and 1440px
- **Transfer bug:** some open dates seemed missing on the transfer page (Thu Oct 29 10:15). Find the real cause and add a test that every open class with seats shows
- **You:** click-through Version 1.4 admin part 2 (Schedule, Content, Users, Communications, plus no sideways scroll on every admin page) at 390px and 1440px
- Email: `SMTP_*` + `EMAIL_FROM` set in `.env.local`, Communications test send worked (2026-11-02). **You, for Step 14:** the same Gmail as Supabase custom SMTP; add the 5 keys to Vercel at deploy (Step 13)
- **Home page** to match Figma node 103-26 (a bigger export would help); reminders + pg_cron still Step 14
- **Step 13** deploy (`docs/prompts/13-deploy.md`), **Step 14** emails + pg_cron + Communications (`14-emails-reminders.md`), **Step 15** final check (`15-final-check.md`)
- **You, `.env.local`:** add `SUPABASE_SECRET_KEY` (webhook, PayMongo return, Delete account) and `PAYMONGO_SECRET_KEY`, then restart `npm run dev`
- **You, Supabase dashboard:** turn ON "Require current password when updating"; enable the Google provider (Google Cloud OAuth client, redirect `https://mbfshqndgiywphuannuw.supabase.co/auth/v1/callback`); delete the throwaway `step10-check-…@example.com` users
- **You, after SMTP (Step 14):** turn OFF "Secure email change" (one code, new email only); Change Email template shows `{{ .Token }}`; leave Supabase's "Email address changed" notification OFF (we send our own alert); Reset password → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`; Confirm signup → same with `type=email`; then turn Confirm email ON and retest
- **You, after deploy:** add the Vercel URL to Supabase Site URL + Redirect URLs (`https://<site>/**`, keep localhost); add the PayMongo webhook `https://<site>/api/paymongo/webhook` (event `checkout_session.payment.paid`) and put its secret in Vercel as `PAYMONGO_WEBHOOK_SECRET`
- **You:** click-throughs at 390px and 1440px for Step 11 (both parts), Step 12, R1 and Change 17 (SQL in `supabase/manual-tests/`, setup + cleanup, pasted by hand); fill in the [PLACEHOLDERS] on admin Settings and Content

## Rules that still matter
- **`await io()`** (from `next/cache`) before `createClient()` from `src/lib/supabase/server.ts` in page code, inside `<Suspense>`. Server Actions and route handlers don't need it
- **Caching:** Cache Components is on; nothing is cached without `'use cache'`. Never cache seats, `get_open_sessions()` or bookings. Cookies / live data go inside `<Suspense>`. After admin saves, call `updateTag('settings' | 'schedule' | 'site-content')`
- **No `₱` or other non-English characters in migration files**, even in comments (the Windows test database reads them as WIN1252). Use `{class_price}` in page text and "pesos" in comments
- **Types:** `npm run gen:types` after every `db push`, never `npx ... > file` in PowerShell (saves UTF-16)
- **New fill-in word:** add it to `FILL_INS` (`src/lib/content-text.ts`) **and** `KNOWN_FILL_INS` (`supabase/tests/08-page-content.test.mjs`)
- **Env keys** (`.env.example`, values only in `.env.local`, made by hand): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server only), `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` (can stay empty on localhost), `NEXT_PUBLIC_SITE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (Gmail App Password, server only)
- Never rewrite files with PowerShell `Get-Content | Set-Content` (garbles `…` `·` `₱`); use the editor or python
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
- Version 1.7: a weekly pattern seat change only applies to NEW classes (existing ones keep their seats; edit them under Upcoming classes). The cancel email needs SMTP (if it fails, the cancel still happens and the admin is told)
- Online bookings save `first_time = false` (Version 1.7: no longer shown on the admin Guest card; still in the DB)
