Please read CLAUDE.md and docs/PROGRESS.md first. If PROGRESS.md shows this part is already half done, continue from where it stopped.

Steps 6–12 are done. Our group reviewed the site and made a list of revisions. It's in the attached **revisions.pdf** (screenshots with notes). This is **Revisions part 1 of 3: the client side** (PDF pages 1–6). Only do this part. The admin side is part 2, and anything that sends email is part 3.

**About the Figma links in the PDF:** if you can open them (Figma MCP), use them for layout only. Keep our fonts and colours from CLAUDE.md section 7. If you can't open them, tell me in your plan, and I'll attach screenshots of those frames.

The screenshots show my real email and phone number. Never copy them into code, tests or SQL files.

**1. Separate admin and client logins**
- Admin accounts can't log in on the client `/login` page. Show a plain message that sends them to the admin login.
- Make a separate admin login page, for example `/admin/login`. Client accounts can't log in there.
- When an admin is logged in, `/book` and `/account` are not available to them (redirect to `/admin`). Public pages (Home, About, Policies) still open.
- Remove the "Admin" link from the client header.
- Do this check on the server (proxy plus `requireUser` / `requireAdmin`), not only by hiding links.

**2. Chat With Us**
- Remove it from the nav bar and the phone menu.
- Make it a floating round button at the lower right of **every client page**. It must not cover buttons on phones, and it's hidden when there's no chat link in Settings.

**3. Home page**
- Change the layout to match Figma node `103-26` (layout only, not the font).
- Content still comes from `site_content` and settings.

**4. Booking, step 1 (Pick a class)**
- Remove the row of date chips at the top (the calendar-like buttons).
- Replace the right-hand "Class fee / Continue" card with a **Booking details** card, like the picture on PDF page 3:
  - Date and Session (filled in after picking a class)
  - **What to bring:** Workout mat (with a **Rent a mat** checkbox showing the mat price), Water bottle, Towel, Comfortable workout clothes
  - a **Proceed to payment >** button
- Mat rental is chosen here now, so step 2 doesn't ask again. Step 2 just shows it in the summary.
- On phones, the card sits below the class list, or as a sticky bottom bar. Pick whichever works better.

**5. Booking, step 2 (Your details)**
- Add a **breadcrumb** (for example `Pick a class > Your details > Payment`) so the client can go back. Going back keeps their choices.
- Name, mobile number and Instagram are **shown but not editable** here. They come from the profile. Add a small "Edit in My Profile" link.
- Remove "Is this your first Pilates class?" and its choices. Leave the database column alone.

**6. My Account**
- In the nav bar, "My Account" becomes a **person icon** (with an accessible label). Clicking it opens **My Profile**, not My Bookings.

**7. My Profile**
- Add a round profile-picture **placeholder** (initials are fine; no upload needed).
- Only **name, mobile number and Instagram** are editable. Each one has a **pen icon** that turns it into an input, with Save and Cancel.
- **Birthday becomes required**, and stays read-only after it's set. Any existing account without a birthday is asked for it once.
- Email is read-only, with the note "To change your email, message the cafe" (the admin does it in part 3).
- Remove the **Change password** section. The "Forgot password" link on the login page stays.
- Remove **Deactivate my account**. Keep the database function, but nothing on the client side calls it.

**8. Policies page:** add a **Back** button (go back in history, or to Home if there's no history).

**9. Notifications:** keep the email-reminder switch, and add an **in-app list** of the client's own updates, newest first. For example:
- booking confirmed
- payment being checked, approved or rejected
- transfer done
- cancelled with a 50% code
- class cancelled by the cafe

Recommend the simplest way in your plan, either built from their own booking and payment rows or a small `notifications` table filled by database triggers. A client must only ever see their own. Show an unread dot on the person icon if that's easy.

Database changes go in a new migration, with tests (including "a client can't see another client's notifications" and "an admin can't log in through the client login" where testable). Remember the Step 7 rule (`await io()` before the logged-in Supabase client). Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. Keep `npm run test:db`, the type check, lint and `npm run build` passing.

When it works, give me a click-through checklist at 390px and 1440px, and save any setup SQL in `supabase/manual-tests/`. Update docs/PROGRESS.md and suggest a commit message.
