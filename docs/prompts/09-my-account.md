Please read CLAUDE.md (sections 4 and 5) and docs/PROGRESS.md first.

Steps 6–9 are done. We are on **Phase C, Step 10: My Account**. Only do this step. Payments themselves are Step 12.

Match `docs/designs/PhoneMyBookings.html`, `Profile.html`, `Payments.html`, `Vouchers.html` and `Notifications.html`. Same style on phones and laptops (laptop can use a left sub-menu for the account pages, phone uses tabs or a simple menu).

1. **My Bookings** (`/account` or `/account/bookings`): Upcoming and Past tabs. Each booking shows date, time, drink, mat, total and a status badge in plain words (Waiting for payment, Checking your payment, Confirmed, Attended, No-show, Cancelled with voucher, Forfeited, Transferred). An unpaid hold links back to its pay page.
2. **Cancel:** before anything happens, show exactly what the policy means for **this** booking right now (for example "Class is in 18 hours: you'll get a 50% voucher valid for 60 days" or "More than 24 hours away: please transfer instead"). Then call `cancel_my_booking()` and show its plain-English result.
3. **Transfer:** only when allowed (more than 24 hours away, not transferred before). Let the person pick another open class with seats and call `transfer_my_booking()`. Explain that a transfer can only happen once and keeps the same drink and mat. If the class was cancelled by the cafe, make the free transfer obvious.
4. **Payments** (`/account/payments`): the person's own payments with amount, method, status and date. Transferred bookings show the payment from the original booking (`transferred_from`).
5. **Vouchers** (`/account/vouchers`): their personal vouchers, valid ones first, with code (copy button), discount, expiry and used or expired state. Never show other people's vouchers or the promo list.
6. **Notifications** (`/account/notifications`): there is no notifications table yet. Propose the simplest option in your plan (for example a list built from the person's own booking, payment and voucher events, or a small new table that Step 13 emails also write to) and recommend one. Don't build until I've seen the plan.
7. **Profile** (`/account/profile`): edit name and phone, change password, and "Deactivate my account" with a clear warning and a confirm step, using `deactivate_my_account()`.

Remember the Step 7 rule: server code that uses the logged-in Supabase client while drawing a page needs `await io()` first. Booking lists and seat counts are never cached.

Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. Add database tests for any new function. Keep `npm run test:db`, the type check, lint and `npm run build` passing.

When it works, give me a click-through checklist at 390px and 1440px with my test client account, including the SQL to quickly make test bookings at 30 hours, 18 hours and 6 hours before class so I can try each cancel rule, plus the cleanup SQL. Update docs/PROGRESS.md and suggest a commit message.
