Please read CLAUDE.md (sections 5 and 6) and docs/PROGRESS.md first.

We are on **Phase A (database), Step 4: booking functions**. Only do this step. Tables (migration 1) and security (migration 2) are already in Supabase.

Write a new migration in `supabase/migrations/` with Postgres functions that hold the booking rules, so the website just calls them. Use `security definer` with a safe `search_path` where a function must write to tables that clients can't write to directly. Inside each function, check who is calling (`auth.uid()`, `is_admin()`). All times use Philippine time (Asia/Manila).

1. `seats_left(session_id)`: returns capacity minus bookings that are `confirmed`, `awaiting_verification`, or `pending_payment` with `hold_expires_at` in the future.
2. `get_open_sessions(from_date, to_date)`: returns the sessions guests can see, with seats left, plus whether booking is still open (before the cutoff, not full, status `open`).
3. `book_seat(session_id, details...)`: the main one. In **one locked step** (`select ... for update` on the session row), it:
   - checks that the caller is logged in and active, the session is open, it's before the cutoff (`settings`, default 8:00 AM on class day), and a seat is free
   - checks that the not-pregnant box and the agreement are ticked
   - reads the class price, mat price and hold minutes from `settings`, and applies a voucher if one is given (valid, not expired, owned by the caller if it's personal, class fee only)
   - inserts the booking as `pending_payment` with `hold_expires_at = now() + hold minutes`
   - returns the booking id, total and hold expiry
   - gives clear error messages in plain English (for example "Sorry, this class is full.")
4. `cancel_my_booking(booking_id)`: applies the cancellation table in CLAUDE.md section 5 by itself:
   - more than 24h before class: it refuses and says to use transfer instead
   - 12 to 24h: sets `cancelled_with_voucher` and creates a personal 50% voucher, valid 60 days, one use
   - less than 12h: sets `forfeited`
5. `transfer_my_booking(booking_id, new_session_id)`: only if the class is more than 24h away, the booking hasn't been transferred before, and the new session has a seat. Locks both sessions. The old booking becomes `transferred`, and a new `confirmed` booking points back to it with the same inclusions and amounts.
6. `generate_sessions(weeks)` (admin or cron only): creates dated sessions from the active templates for the next N weeks and skips ones that already exist.
7. Admin-only functions:
   - `admin_walkin_booking(...)`: takes a seat, and records a cash or transfer payment as paid
   - `admin_set_attendance(booking_id, 'attended' | 'no_show')`
   - `admin_cancel_session(session_id)`: marks the session `cancelled` and leaves its bookings so clients can transfer for free
   - `admin_review_manual_payment(payment_id, approve boolean)`
8. A `deactivate_my_account()` function, because the profile trigger blocks clients from changing `is_active` directly.

Don't build the PayMongo confirmation yet. That comes in Phase D and runs on the server with the secret key.

Before pushing, test everything on the throwaway local Postgres:
- **Overbooking:** 5 people trying to book a 4-seat class, where only 4 should succeed.
- **Holds:** an expired hold frees the seat.
- **Cutoff:** a booking after the cutoff is refused.
- **Vouchers:** they never discount the mat.
- **Cancellation:** each time window (more than 24h, 12 to 24h, under 12h) gives the right result.
- **Transfer:** a second transfer is refused.
- **Admin-only:** clients can't call the admin functions.

Show me a results table. Then tell me to run `npx supabase db push`.

Comment every function in plain English: what it does, what it takes, and what it returns. Never run any git command. Update docs/PROGRESS.md and suggest a commit message.
