Please read CLAUDE.md and docs/PROGRESS.md first. If PROGRESS.md shows this part is already half done, continue from where it stopped.

Revisions part 1 (client side) is done. This is **Revisions part 2 of 3: the admin side**, from the attached **revisions.pdf** (pages 6–13). Only do this part. Anything that **sends an email** (send receipt again, send a password link, change email, Communications) is part 3. For those, put the button in place now, disabled with "Coming soon", so part 3 only has to wire it up.

**About the Figma links in the PDF:** if you can open them (Figma MCP), use them for layout only. Keep our fonts and colours from CLAUDE.md section 7. If you can't open them, tell me in your plan, and I'll attach screenshots of those frames.

The screenshots show my real email and phone number. Never copy them into code, tests or SQL files.

**1. Remove the Attendance page**
- Remove the page and its menu item, plus the Attendance buttons and links everywhere (dashboard, bookings, walk-in result).
- Keep the database function and the `attended` / `no_show` statuses so old data still shows.
- The dashboard's "Today's classes" already lists each guest's drink and mat for the barista. Keep that, and make it printable if that's easy.

**2. Dashboard**
- In "Today's classes", remove the Attendance and Walk-in buttons. Keep Cancel class.
- "Next classes" shows only **2 cards**, then a **View all** link to the Schedule page.

**3. Bookings list:** remove the "Paid, needs action", "Attended" and "No-show" filter chips. Paid-needs-action bookings are still reachable from the dashboard's Needs action card and the Payments page.

**4. Walk-in booking**
- **Start with the client's account.** The admin types the client's email:
  - If an account exists, use it.
  - If not, the admin enters the full name, mobile, birthday and a **temporary password** (at least 8 characters), and the server creates the account. Use the Supabase admin API with the secret key, in a server action that checks `requireAdmin()` first. Mark the email as confirmed. Never log or store the password anywhere else.
  - Then the admin chooses the class and the rest, as now.
  - Show a note that the client can change the password with "Forgot password" later.
- Remove the "This is their first Pilates class" checkbox.
- After "Add walk-in booking", go to a **confirmation page**, like the client's "You're booked" page. It shows the booking details and payment, with a **Back** button to the walk-in form and a "See the booking" link. Remove the inline success box.
- Walk-in bookings now belong to that client's account, so they show up in the client's My Bookings. Update `admin_walkin_booking()` (new migration) to take the client's user id, and keep supporting old walk-ins that have no account.

**5. Payments**
- In the payments table, rename "View booking" to **View receipt** and open a receipt page for that payment (admin view). Add a **Send receipt again** button (disabled until part 3).
- **Move the payments card from Settings to here:** GCash and BPI details, and the manual-payment on/off switch.

**6. Schedule page:** change the layout to match Figma nodes `1-42` and `188-1323`, keeping all existing features (weekly templates, create classes, cancel a class, capacity). If those frames show something we don't support yet (for example editing one date's capacity or closing a whole day), build it if it's small and tell me in the plan.

**7. Pricing & Vouchers**
- The **Save prices** and **Create code** buttons stay greyed out until something actually changes, and grey out again after a save.
- Remove the "50% codes issued by the system" list from this page. Personal codes still work and still show in each client's My Vouchers.

**8. Content management:** change the layout to match Figma nodes `241-594`, `241-798` and `241-1122`, keeping everything that works now (text blocks, placeholders preview, photo upload, cache clearing).

**9. Manage Users:** change the layout to match Figma nodes `241-1897`, `241-1652`, `241-2096` and `241-2287`:
- the list
- one user's details with their booking history
- edit
- the Communications area inside one user (frame `241-2287`): build the layout now, sending comes in part 3

Keep the rule that an admin can't deactivate themselves or remove their own admin role.

**10. Settings**
- Cards: **Cafe information**, **Social links and Chat With Us**, and Drink options. The payments card moves to Payments (item 5).
- Remove the **Alerts** card.
- Remove the bottom "Save changes" bar. **Each card gets its own Save button**, greyed out until that card changes.
- Every editable field shows a **pen icon** to start editing.

**11. Admin sidebar:** remove the **View website** button.

Database changes go in a new migration with `is_admin()` checks and tests, including "a client can't create accounts or walk-ins". Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. Keep `npm run test:db`, the type check, lint and `npm run build` passing.

When it works, give me a click-through checklist at 390px and 1440px, and save any setup SQL in `supabase/manual-tests/`. Update docs/PROGRESS.md and suggest a commit message.
