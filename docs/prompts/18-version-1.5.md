Please read CLAUDE.md, docs/PROGRESS.md and **`docs/Revisions/Version_1.5.pdf`** first.

The PDF is the group's revision list for **Version 1.5** (10 pages, client side then admin side). Each item has a page name, page link, concern and resolution, plus a screenshot. **Open every page of the PDF and look at the screenshots**, not just the text, so you change the exact spot shown. This file summarizes the items and adds the rules to follow. If this file and the PDF disagree, ask me.

Version 1.4 is done (see PROGRESS.md). **Only do the items below.**

---

## Client side

**C1. Login — Google sign-in error** (`/login`)
- The Google button errors because the Google provider isn't enabled in Supabase. That's a dashboard step for me, not code.
- Give me exact, current step-by-step instructions:
  - Google Cloud: OAuth consent screen, test users, Web client, origins
  - redirect URI `https://mbfshqndgiywphuannuw.supabase.co/auth/v1/callback`
  - Supabase → Authentication → Sign In / Providers → Google
- Check our code handles the provider-off error gracefully: a plain message, not a raw error.
- Once I say it's enabled, help me test it end to end, including "Finish your profile" for a new Google account.

**C2. Login — Google button text** (`/login`, and `/signup` if it has the same button)
- Remove the "Continue with" wording. The button shows only the Google logo and the word "Google".
- Keep the "or continue with" divider unless the PDF screenshot shows otherwise.

**C3. Home — mat rental note** (`/`)
- Move the mat rental note so it sits under the **"Ready for your first class?"** section.
- It stays clickable and goes to booking with mat rental pre-ticked (`/book?mat=yes`).

**C4. About Us — remove Chat With Us button** (`/about`)
- Remove the "Chat With Us" button inside the About page content. It's redundant with the floating chat button in the lower right.
- Keep the floating button.

**C5. About Us — "Thu to Sun" → "Thu to Sat"** (`/about`)
- Sessions only run **Thursday to Saturday**. Fix every client-facing "Thu to Sun" / "Thursday to Sunday", including the About class box, the Home hero kicker, FAQ, policies and emails.
- Where the text is built from the schedule, it must follow automatically once Sunday is switched off (see C6).
- Where it lives in `site_content`, update it in a migration, only if it was never edited.

**C6. Book a Class — next arrow shows no schedules** (`/book?month=…`)
- Clicking ▶ doesn't show the upcoming sessions for the following weeks and months. Find the **real cause** before changing anything. Check:
  - whether next month's classes exist in the live database
  - the month range passed to `get_open_sessions`
  - the `?month=` handling
  - time zone
- Fix it so ▶ shows the upcoming sessions with dates and times. **Add a test** that proves next month's open classes appear.
- Sessions are **Thursday to Saturday only** from now on. Sunday has to go from the weekly pattern and from future generated classes. In the plan, tell me what happens to **future Sunday classes that already have bookings** (for example: leave them, or cancel them through the normal cafe-cancel flow so clients get the free move). Don't delete anything with bookings.
- The 9-week "Open classes for booking" behavior stays.

**C7. Book a Class — button text** (`/book?session=…&mat=yes`)
- Rename the **"Proceed to payment"** button to **"Book Now"**, on laptop and on the phone sticky bar.
- Keep "Please pick a class first" for when nothing is picked.

**C8. My Bookings — rescheduling limit after a cafe-cancelled class** (`/account/bookings`; the PDF labels it About Us, but the link is bookings)
- When the cafe cancels a class, the client gets a free move. Right now that has no time limit, so a client could redeem it months or years later.
- Add a **rescheduling window**: the free move must be used within a set number of days after the cancellation. Propose the default in the plan, for example 30 days, and make it an admin setting.
- Show the deadline on the booking ("Move by Nov 30") and in the class-cancelled notification and email.
- In the plan, say what happens when the window passes. For example: the move is no longer offered and the booking becomes a final status; recommend whether the client gets a voucher, a refund note, or nothing.
- Apply the same rule in the database function, not only on the page. Add tests.

## Admin side

**A1. Bookings — past classes still "Confirmed"** (`/admin/bookings`)
- After a class has ended, a booking that's still "Confirmed" (attendance not marked) moves to **Needs Action**, under a status shown as **"Pending Attendance Verification"**.
- The admin does a final check-in to set **Attended** or **No-show**.
- Decide in the plan whether this is a real new status in the database or a computed view of "confirmed + class ended". Recommend the simpler one that still works without a scheduled job.

**A2. Bookings — Attended and No-show tabs** (`/admin/bookings`)
- Add **Attended** and **No-show** tabs/chips next to the existing ones, since the Attendance menu was removed in 1.4.
- If No-show is currently grouped under Forfeited, give it its own tab and tell me how Forfeited changes.

**A3. Bookings — pagination** (`/admin/bookings`)
- Add pagination to the bookings list, matching the other admin tables (10–20 per page, plus page controls).
- Keep the current search and filters in the URL when changing pages. It must work on phones (stacked cards under 768px).

**A4. Users → Communications — email sending** (`/admin/users/[id]/communications`)
- Admins can't send emails yet. The code is there (`src/lib/email.ts`, Gmail SMTP via nodemailer). What's missing is my `SMTP_*` / `EMAIL_FROM` keys in `.env.local`.
- Check the whole send path works, then give me the exact steps:
  - Gmail 2-Step Verification
  - App Password
  - the 5 keys
  - restart
  - a test send to my own email
  - the same Gmail as Supabase custom SMTP, if needed for the later Step 14 items
- If anything in the code is actually broken, fix it.

---

## How to work

1. **Before writing any code**, show me one short plan covering C1–C8 and A1–A4:
   - what already works
   - the real cause of C6
   - every new migration
   - your answers for Sunday classes with bookings (C6), the rescheduling window default and what happens after it (C8), and the new status vs. computed view (A1)
   - the dashboard / `.env.local` steps I must do myself (C1, A4)

   Wait for my OK.
2. Then do client side first, then admin side. Run `tsc`, lint, `test:unit` and `test:db` after each side, and `npm run build` at the end.
3. Comment every file and function in plain English. **Never run any git command.** Follow every rule in PROGRESS.md "Rules that still matter":
   - no `₱` in migrations
   - `npm run gen:types` after `db push`
   - `await io()`
   - no caching of seats or bookings
4. If a migration needs pushing, tell me and wait. I'm on Windows, so give commands as `npx.cmd` / `npm.cmd`.
5. When done, give me a click-through checklist at **390px and 1440px**, with setup and cleanup SQL in `supabase/manual-tests/` (`v15-setup.sql` / `v15-cleanup.sql`), for:
   - a past class pending attendance
   - the Attended and No-show tabs with pagination
   - a cafe-cancelled class near the end of its reschedule window
6. Update `docs/PROGRESS.md` (3–5 short lines, per its update rule) and suggest a commit message.
