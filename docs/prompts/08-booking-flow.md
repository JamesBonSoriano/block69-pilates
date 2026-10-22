Please read CLAUDE.md (especially sections 4 and 5) and docs/PROGRESS.md first.

Steps 6–8 are done. We are on **Phase C, Step 9: the booking flow**. Only do this step. Real payment (PayMongo and the manual screenshot upload) is Step 12, so this step stops at the payment page.

Match `docs/designs/PhoneBook1.html`, `PhoneBook2.html`, `PhoneBook3.html` and `PhoneBooked.html` on phones, same style wider on laptops.

1. **Step 1, pick a class** (`/book`): open sessions from `get_open_sessions()` grouped by date, with seats-left badges (never cached). Full, closed-after-cutoff and cancelled classes show clearly but can't be picked. Guests can browse; choosing a class needs a login (`/login?next=...`, then come back to the same class).
2. **Step 2, your details:**
   - name and phone pre-filled from the profile (editable)
   - drink choice from the `drink_options` setting
   - mat rental add-on (₱50, donated to stray animals), price from settings
   - voucher or promo code box that shows the discount **before** booking. If you need a read-only "preview price" database function for this, add it in a new migration, with tests, and make sure it never reveals other people's personal vouchers.
   - "I am not pregnant" checkbox and "I agree to the Registration Agreement" checkbox (link to `/policies` in a new tab)
   - a clear price summary: class fee, discount (class fee only), mat, total
3. **Confirm:** call `book_seat()` from a server action. Prevent double clicks. Show its plain-English errors (full, after cutoff, etc.) nicely and send the person back to pick another class when it's full.
4. **Step 3, payment page** (`/book/pay/[bookingId]`): only the booking's owner can open it. Show the summary and a live 15-minute countdown from `hold_expires_at`. Show where the payment buttons go (PayMongo, and the manual GCash/BPI option only if the manual-payment setting is on) as disabled "coming in Step 12" placeholders. When the timer hits zero, say the seat was released and offer to pick a class again.
5. **Unpaid hold:** if the person already has a live unpaid hold for that class, take them to that payment page instead of showing an error.
6. **Booked page** (`/book/done/[bookingId]`, matching PhoneBooked.html): build it now and show it for bookings that are already `confirmed` (for example a walk-in made in the SQL editor), so Step 12 only has to redirect here.
7. Wire the header and Home "Book a class" buttons to `/book`.

Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. Remember the Step 7 rule: any server code that uses the logged-in Supabase client while drawing a page needs `await io()` first. Keep `npm run test:db`, the type check, lint and `npm run build` passing, and add database tests for anything new.

When it works, give me a click-through checklist at 390px and 1440px using my test client account, including: booking as a guest (asked to log in, then returned), a voucher that is invalid, the WELCOME10 promo if it exists online (or tell me how to add one), a full class, and letting the 15-minute timer run out (tell me a quick way to test that without waiting). Update docs/PROGRESS.md and suggest a commit message.
