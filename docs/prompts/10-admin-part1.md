Please read CLAUDE.md (sections 4–7) and docs/PROGRESS.md first.

Steps 6–10 are done. We are on **Phase C, Step 11 (part 1 of 2): admin daily work**. Only do this part. Part 2 (payments review, pricing, settings, content) comes next.

Match `docs/designs/PhoneAdminDashboard.html`, `AdminBookings.html` / `PhoneAdminBookings.html`, `AdminWalkIn.html`, `AdminAttendance.html` / `PhoneAdminAttendance.html`. Admin uses the admin colours from CLAUDE.md section 7 (admin-bg, admin-active), a left side menu on laptops and a simple menu on phones. The cafe staff will mostly use a phone at the counter, so phone view matters most.

1. **Admin layout** for `/admin/*`: side menu with Dashboard, Bookings, Walk-in, Attendance, and placeholders for Payments, Pricing, Settings (part 2). Protected by `requireAdmin()` on the server.
2. **Dashboard** (`/admin`): today's and the next classes with seats taken / capacity, who is booked, payments needing review (count), and quick links. Numbers are live, never cached.
3. **Bookings** (`/admin/bookings`): all bookings with filters (date, class, status) and search (name, email, phone, booking code). Each row opens a detail view: client details, drink, mat, voucher, payment, status history where available. Admin actions only through the existing `admin_*` functions.
4. **Walk-in** (`/admin/walk-in`): pick a class with a free seat, enter name and phone (no account needed), drink, mat, and cash or transfer, then call `admin_walkin_booking()`. Show the result and the seats left.
5. **Attendance** (`/admin/attendance`): pick a class (default: today's next class), list everyone booked, and mark each `attended` or `no_show` with big tap-friendly buttons via `admin_set_attendance()`. Show drink and mat next to each name so the barista knows what to make.
6. **Cancel a class** (from the dashboard or bookings): confirm box, then `admin_cancel_session()`. Explain that clients keep their bookings and can transfer for free.

If you need new admin-only database functions (for example a dashboard summary or a search), add them in a new migration with `is_admin()` checks and tests, including a test that a client can't call them.

Remember the Step 7 rule (`await io()` before the logged-in Supabase client). Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. Keep `npm run test:db`, the type check, lint and `npm run build` passing.

When it works, give me a click-through checklist at 390px and 1440px as my admin account (and one check that my test client gets sent away from `/admin`), with any setup SQL saved as a file in `supabase/manual-tests/` instead of only printed in the terminal. Update docs/PROGRESS.md and suggest a commit message.
