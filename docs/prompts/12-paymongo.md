Please read CLAUDE.md (sections 4–7) and docs/PROGRESS.md first. If PROGRESS.md shows this step is already half done (for example because the last session hit its usage limit), continue from where it stopped instead of starting over.

Steps 6–11 are done. We are on **Phase D, Step 12: payments**. Only do this step. Emails come later, and deploying to Vercel is Step 13.

Match `docs/designs/PhoneBook3.html`, `PhoneBooked.html`, `Payments.html` and `AdminPayments.html`.

**Before you start:**
- Check PayMongo's current API docs on the web (Checkout Sessions, Retrieve a Checkout Session, Webhooks and the `Paymongo-Signature` header) if you can. Don't guess field names. If you can't reach the docs, tell me which parts you're unsure about.
- Tell me exactly which keys to add to `.env.local` and `.env.example`. You'll probably need `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (if it isn't there yet) and `NEXT_PUBLIC_SITE_URL`. I will paste the values myself. Never print or log a secret.

1. **Pay with PayMongo (test mode):**
   - On `/book/pay/[bookingId]`, replace the "coming in Step 12" placeholder with a Pay button.
   - The button calls a server action that re-reads the booking from the database (owner only, still `pending_payment`, hold not expired) and creates a PayMongo Checkout Session for the booking's `total`. Use GCash, Maya and card. Never trust an amount from the browser. Amounts are in centavos.
   - Save the Checkout Session id on the payment row (`paymongo_ref`) and redirect to PayMongo's checkout page.
   - `success_url` goes to `/book/pay/[bookingId]/return` and `cancel_url` goes back to the pay page.
   - Pressing Pay twice must not create two Checkout Sessions. Reuse the live one.
2. **One database function confirms a payment:** add `confirm_online_payment(...)` in a new migration.
   - Only the server can call it (service role). Revoke it from `anon` and `authenticated`.
   - It is idempotent: running it twice for the same PayMongo reference does nothing the second time.
   - If the hold is still live, the payment becomes `paid` and the booking `confirmed`.
   - **Late payment rule** (CLAUDE.md section 5): if the hold has already ended, lock the session row. If a seat is still free, confirm as normal. If the class is now full or the cafe cancelled it, set the booking to `paid_needs_action`.
   - If the amount paid does not equal the booking total, set `paid_needs_action` too.
   - The existing trigger already spends the voucher, so don't spend it again in code.
3. **Two ways to call it, both through that one function:**
   - **Webhook** `src/app/api/paymongo/webhook/route.ts`: read the raw body, verify the `Paymongo-Signature` with `PAYMONGO_WEBHOOK_SECRET` (test-mode signature), reject anything else with 401, and handle `checkout_session.payment.paid`. Always answer quickly with 200 for events we ignore.
   - **Return page check** `/book/pay/[bookingId]/return`: on the server, retrieve the Checkout Session from PayMongo with the secret key. If it is paid, call the same function, then redirect to `/book/done/[bookingId]`. If not paid yet, show "Checking your payment…" with a refresh button.

   The return check makes payments work on localhost (webhooks can't reach my laptop). The webhook makes them work even if the client closes the tab. Both must be safe to run together.
4. **Manual GCash/BPI backup** (only shown when the manual-payment setting is on):
   - Show the GCash and BPI details from `settings`, and the exact amount to send.
   - Upload a screenshot (image only, max 5 MB) to the private `payment-screenshots` bucket under a folder named by the client's user id. Add storage policies: a client can upload and read only their own folder, an admin can read all, nobody can list other clients' files.
   - Add `submit_manual_payment(booking_id, method, screenshot_path)`. It works only for the owner, only while the hold is live, and only for a `pending_payment` booking. It sets the booking to `awaiting_verification` (which keeps the seat) and the payment to the manual status your schema uses.
   - Show a clear "We're checking your payment" page. The admin review screen from Step 11 should now show the real screenshot.
5. **Client side after paying:** My Bookings, Payments and the receipt page show the new statuses correctly. A `paid_needs_action` booking tells the client in plain words that the cafe will contact them.
6. **Admin Billings** (`/admin/payments`, or a "Billings" tab next to it, matching `AdminPayments.html`):
   - Earnings for today, this week and this month (Philippine time), counting only paid money.
   - The **mat rental donation total** shown separately.
   - Each payment's PayMongo reference.
   - A `paid_needs_action` list with a short note on what to do (transfer them for free with the override, or arrange a refund). Use one admin-only database function for the totals, with tests.

**Tests:** add database tests for `confirm_online_payment` (normal, twice in a row, late with a free seat, late and full, wrong amount, a client can't call it) and `submit_manual_payment` (owner only, expired hold refused, another client refused). Add a small unit test for the webhook signature check (a good signature passes, a changed body fails).

Remember the Step 7 rule (`await io()` before the logged-in Supabase client). The service-role client is used only in the webhook and return route, never in a page or client component. Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. Keep `npm run test:db`, the type check, lint and `npm run build` passing.

When it works, give me a click-through checklist at 390px and 1440px:
- paying with a PayMongo test card and test GCash
- cancelling on PayMongo's page
- a late payment (tell me a quick SQL way to fake it)
- the manual screenshot upload and admin approve and reject
- the Billings totals

Save any setup SQL in `supabase/manual-tests/step12-setup.sql`, plus a cleanup file. Tell me what the webhook URL will be once we deploy (Step 13). Update docs/PROGRESS.md and suggest a commit message.
