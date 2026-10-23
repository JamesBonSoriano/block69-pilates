Please read CLAUDE.md (sections 4–7) and docs/PROGRESS.md first.

Step 11 part 1 (dashboard, bookings, walk-in, attendance) is done. We are on **Step 11, part 2 of 2: admin setup pages**. Only do this part.

Match `docs/designs/AdminPayments.html`, `AdminPricing.html` and `AdminSettings.html`, phone and laptop, inside the admin layout from part 1.

1. **Payments** (`/admin/payments`): all payments with filters (status, method, date). A "Needs review" tab for manual GCash/BPI payments that shows the uploaded screenshot (from Supabase Storage, admin-only access) with Approve / Reject through `admin_review_manual_payment()`. Also list "Paid needs action" (late payments) clearly. The screenshot upload itself comes in Step 12, so make the review screen work with test rows for now.
2. **Pricing** (`/admin/pricing`): edit class price, mat price, hold minutes and booking cutoff (from `settings`). Promo codes: list, create (code, percent off, uses, expiry), turn off. Personal 50% vouchers are listed read-only. Show a clear note that a price change only affects new bookings.
3. **Schedule** (inside Settings or its own page): edit the weekly templates (days, times, capacity, on/off) and a button that runs `generate_sessions(weeks)`. Explain that existing dated classes are not changed.
4. **Settings** (`/admin/settings`): cafe name, address, email, phone, Instagram/Facebook, Chat With Us link, GCash and BPI details, manual-payment on/off. These are the placeholders still in [BRACKETS], so make them easy to find and fill.
5. **Content** (`/admin/content` or inside Settings): edit the `site_content` text blocks (Home, About, FAQ, what to bring, cancellation policy, Registration Agreement, instructor name and bio) with a preview of the `{placeholder}` words. Photo upload for the photo spots using a public Supabase Storage bucket `site-images` (only admins can upload or delete). Saving clears the page caches by tag so changes show right away.
6. **One booking, on a client's behalf:** from the booking details page, let the admin transfer or cancel a single booking (for example when a client messages the cafe). Add `admin_transfer_booking()` and `admin_cancel_booking()` that follow the same policy windows by default, with an admin-only "override" choice (for example a free transfer for a good reason) that needs a short note saved in the booking history.
7. **Users** (small): list client accounts with search, and deactivate / reactivate. Never let an admin remove their own admin role or deactivate themselves.

Any new tables, buckets, policies or functions go in a new migration with `is_admin()` checks and tests (including "a client can't do this"). Tell me if anything must be set by hand in the Supabase dashboard.

Remember the Step 7 rule (`await io()` before the logged-in Supabase client). Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. Keep `npm run test:db`, the type check, lint and `npm run build` passing.

When it works, give me a click-through checklist at 390px and 1440px, with any setup SQL saved in `supabase/manual-tests/`. Update docs/PROGRESS.md and suggest a commit message.
