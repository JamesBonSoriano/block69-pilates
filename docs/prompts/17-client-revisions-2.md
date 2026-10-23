Please read CLAUDE.md (sections 4 and 5) and docs/PROGRESS.md first.

Revisions part 1 and Change 16 are done. This is **Change 17: Client revisions round 2**, from the group's updated proposal (GROUP 6 PBL PROPOSAL 3). Only do what's listed here. **The admin pages don't change**, apart from anything they need to keep working.

Some of these items **undo choices we made in Revisions part 1**: the not-pregnant tick, the locked email and birthday, the removed Change password and Deactivate, and the removed date chips. The new proposal wins. Where it clashes with a database rule, change the rule in a new migration. Don't work around it in the page code.

Do the parts in order (A to H). Run the checks at the end of each part before moving on.

---

## Part A — Client color scheme (green / beige)

Change the **client side only** (all pages under `src/app/(client)`, the login and sign-up pages, the header, the footer and the floating chat button) to this palette. **Leave the admin colors as they are.**

| Name | Hex | Use |
|---|---|---|
| Sage Green | `#7A8F78` | Primary buttons, active nav pill, selected date, header bar |
| Light Sage | `#E8EFE6` | Side menu, soft panels, "Available" badges |
| Cream | `#FFF9F2` | Page background |
| Beige | `#F3E7D8` | Cards and secondary surfaces |
| Brown | `#5B3F2E` | Accents, secondary button outline, footer |
| Text | `#2E2A24` | Body text and headings |

- Add these as `@theme` tokens in `src/app/globals.css` and switch the client components over to them. Don't hard-code hex values in components.
- Keep the status colors (success, info, warning, error) readable on the new background. "Fully booked" and "Booking closed" stay red- or beige-toned, as in the reference.
- Check contrast: white text on Sage Green buttons must stay readable (WCAG AA for button text). If it's too light, darken the button shade slightly and tell me.
- Keep the fonts (Poppins for headings, Montserrat for body).

## Part B — Header, navigation and notifications

1. **Nav links (logged in):** Home, About Us, Book a Class, then a **bell button**, the **person icon** (Client Profile → `/account/profile`), then **Log out** in the far upper-right. Make sure every link goes to the right page.
2. **Bell button:** move the notification **Updates** list out of My Account and into the bell, which opens a dropdown or panel on laptops and a full-screen sheet on phones. Each update keeps the colored icon, title, sentence, time and link. The **unread red dot / count moves from the person icon to the bell**. Opening the bell marks updates as read (reuse `get_my_notifications`, `my_unread_notification_count`, `mark_my_notifications_read`).
3. **My Account → Notifications** now holds **settings only**: the email switches (Booking confirmations "Always on", Day-before reminder toggle, Class changes "Always on") and any other alert options. No updates list on this page.
4. **Log out:** remove the Log out button under the My Account side menu. It only lives in the header. On phones, keep Log out reachable from the phone menu.
5. **Login and sign-up pages:** the upper-right "Log in" button becomes **"Book Now"** (links to `/book`).

## Part C — Login and sign-up

**Login page (`/login`):**
- Center the card on the page, vertically and horizontally, with balanced spacing.
- Below the form add an **"or continue with"** divider, then a **"Continue with Google"** button. Use "Sign up with Google" on the sign-up page.
- **Password show/hide** eye button.
- **"Save login next time"** choice with **Never** / **Always**, implemented securely:
  - Never = a session that ends when the browser closes (session cookies).
  - Always = the normal long-lived Supabase session.
  - Never store the password. Explain the approach in the plan (for example, adjusting the Supabase SSR cookie `maxAge` based on a small preference cookie).

**Sign-up page (`/signup`) validation**, both in the browser and in the server action:
- **Phone:** exactly 11 digits, starting with `09` (PH mobile). Apply the same rule wherever the mobile number is edited (My Profile).
- **Birthday:** `MM/DD/YYYY`, four-digit year, a real calendar date, in the past. The current screenshot accepts `03/12/275760`, which must fail.
- **Email:** valid format and **only `@gmail.com` or `@yahoo.com`** for this version.
- **Password:** at least 8 characters, with a show/hide button.

**Google sign-in:** use **real Supabase Google OAuth** (`signInWithOAuth({ provider: 'google' })` → our `/auth/confirm` or callback route). **Do not fake it.**
- Write the exact setup steps for me (Google Cloud OAuth client, redirect URIs for localhost and production, Supabase → Authentication → Providers → Google).
- Google accounts arrive with no mobile number or birthday. Extend the existing `/account/birthday` step into a **"Finish your profile"** step that asks for whatever is missing (mobile and birthday) before booking, since `holdSeat()` needs the mobile number.
- In the plan, tell me how the gmail/yahoo-only rule should apply to Google accounts and recommend one option.

## Part D — Home page

1. **Hero:**
   - Headline **"Mat Pilates For Beginners"**.
   - Description: "Start your day by slowing down, moving with intention, and reconnecting with your body. Designed for beginners and those looking to refine their foundation using the STOTT method. Through mindful movement, you'll learn proper alignment, core engagement, and breathing techniques while building strength safely and effectively."
   - Main button **"Book Your Session"** → `/book`. **Take the ₱500 off the hero button**; the proposal calls it redundant.
2. **"Next open sessions"**: already removed (Change 16). Keep it gone.
3. **Replace "About the class" and its three cards** with one **Class Details & Location** section:
   - a brief description of the class
   - the class location and complete address
   - an **"Open in Google Maps"** link to the correct location
   - the line **"Don't have a mat? Add mat rental to your booking."**
   - Merge in the existing location block so the address and Maps button aren't shown twice.
4. **Health and Safety Information** section near the bottom of the page, just before the footer.
5. Keep the existing footer.
6. **Chat With Us** floating button: right side, sitting **above the footer**. When the page is scrolled to the bottom it must not cover the footer.
7. Page text lives in `site_content`. Add a migration that updates the Home blocks (headline, description, the new section, health and safety) **only where they were never edited by an admin**, the same way earlier content migrations work.

## Part E — About Us page

- Instructor name: **Mhay Florence Corpuz**. Description: **"STOTT-trained mat Pilates instructor."** (Replaces the `[INSTRUCTOR NAME]` placeholder, via a content migration that only fills untouched or placeholder values.)
- Keep the contact information section, but **remove the cafe's phone number** from it.
- **Remove** the Health and Safety section and the Class Schedule section from About Us. Health and Safety now lives on Home.

## Part F — Booking flow

**Step 1 (Pick a class):**
- Add a **month navigator** at the top (◀ October 2026 ▶), limited to **the current month and next month**.
- Under it, show **only the dates that have classes** in that month as a row of date chips (day name + number), like the reference design. Selecting a date shows that date's sessions below it, with time, class name, and a seats badge (e.g. "3 of 4 left", "Fully booked", "Booking closed").
- Don't list every class card one by one as it does now.
- The proposal says "Thurs–Sat", but the class days come from `schedule_templates`. Use those and don't hard-code days.
- Classes are only generated 4 weeks ahead. Next month must show its real classes, so tell me in the plan whether `generate_sessions` needs to run further ahead (about 9 weeks) and how.
- Keep the Booking details card, Rent a mat tick and Proceed to payment.

**Step 2 (Your details):**
- **Remove the "I am not pregnant" checkbox.** The `bookings` table has a check that requires not-pregnant. Change it in a new migration so only the Registration Agreement tick is required, and update `book_seat` / `holdSeat()` and the tests to match.
- Keep the Registration Agreement tick (links to `/policies#agreement` and `#cancellation`).
- **Mat rental:** confirm the ₱50 mat fee is clearly shown and the total updates correctly when it's ticked or unticked (it should already work; fix it if not).

**Registration Agreement** (`/policies#agreement`, and anywhere else it's shown): replace the 5 numbered points with this text:

> By submitting this registration form and completing your payment, you acknowledge that you have read, understood, and agreed to all of the class policies, including the booking and cancellation terms, health and safety requirements, and liability waiver.
>
> You confirm that you are participating voluntarily, are physically able to join the class, and accept full responsibility for your participation. You release the instructor, Block 69 Cafe, its staff, partners, and organizers from any liability for injuries, accidents, illnesses, or losses that may occur during or as a result of participating in the class, except where required by law.
>
> Your registration and payment serve as your acceptance of these terms and conditions.
>
> You may also reach us through our social media accounts facebook/instagram: @block69cafe

(The social handles should link to the Facebook and Instagram links already in settings.)

## Part G — My Account

**My Profile** is split into three cards:
1. **Account Information:**
   - **Email** can be changed, with a **verification code**: use Supabase Auth's email change and confirm it with the 6-digit OTP (`verifyOtp`, type `email_change`). Tell me which email template needs `{{ .Token }}`.
   - Keep `profiles.email` in sync after the change.
   - **Change password** (current password + new password, 8+ characters).
   - **Forgot password** link (reuses `/forgot-password`).
2. **Personal Information:** Full name, Mobile number (09 + 11 digits), Instagram (optional), Birthday.
   - **Birthday can now be edited** by the client (still a real past date).
   - Update `protect_profile_locked_fields()` in a new migration so clients may change birthday, and email only through the verified flow.
3. **Account Management** (below Personal Information):
   - **Deactivate account:** warning + confirm step, then `deactivate_my_account()`.
   - **Delete account:** users with bookings can't be hard-deleted (`bookings.user_id` is `on delete restrict`, on purpose, for payment records). Propose a safe option in the plan, for example deleting the login and anonymizing the profile while keeping bookings and payments. **Don't build Delete until I've approved it.**

**My Bookings → Transfer a booking:**
- Fix the layout so it matches the new booking step 1 (month navigator, date chips, sessions below, summary card on the right). Keep it under the "Transfer a booking" heading with the "moving this booking" card and the once-only note.
- **Bug:** some dates don't appear even though their sessions still have free seats. For example, admin shows Thu Oct 29 10:15 with 3 of 4 seats free, but it's missing or partly missing in the transfer list.
  - Find the real cause (query filters, limit, date grouping, time zone, the 24-hour rule applied to the wrong class, etc.) and fix it.
  - Add a database or unit test that proves every open session with seats shows up.

**Payments:**
- Rename the **"Date"** column to **"Payment Date"**.
- Add a **Filter** button: status, payment method, and month or date range. Propose the exact filters in the plan.

## Part H — Checks and handoff

- Before you start, show me **one short plan covering all parts** (A–H), including:
  - every new migration
  - the Google setup steps
  - the "Save login" approach
  - your recommendations for Delete account and the Google email-domain question

  Wait for my OK.
- Comment every file and function in plain English. **Never run any git command.**
- Add tests for every database change (pregnancy check removed, birthday editable, email sync, transfer bug, anything for delete). Keep `npm run test:db`, `npm run test:unit`, the type check, lint and `npm run build` passing.
- When it works, give me a click-through checklist at **390px and 1440px** with my test client account. It should cover the colors, the bell, login and sign-up validation, Google sign-in, Home, About, booking with a month switch, transfer, profile edits, payments filter and the account management actions. Include setup and cleanup SQL in `supabase/manual-tests/` (`r2-setup.sql` / `r2-cleanup.sql`) if test data is needed.
- List every **manual step I must do** in a dashboard (Google Cloud, Supabase providers, email templates, redirect URLs).
- Update `docs/PROGRESS.md` and suggest a commit message.
