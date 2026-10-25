# Block 69 Cafe Pilates Website: Project Overview

**Read this whole file before writing any code.** Then read `docs/PROGRESS.md` (what's done, what's next, rules learned along the way). Older step details are in `docs/progress-archive.md`, the proposal is `docs/PROPOSAL.md`, step prompts are in `docs/prompts/`, and the screen designs are in `docs/designs/`. Where the group's **Proposal 3** (Change 17, `docs/prompts/17-client-revisions-2.md`) disagrees with older text, Proposal 3 wins.

This is a school project (Group 6 PBL): a booking and payment website for **Block 69 Cafe**, a coffee shop in Taguig City that runs beginner "Mindful Mat Pilates" classes. Clients book and pay online, and the cafe runs everything from an admin side.

---

## 1. Rules for Claude Code (always follow these)

### Git: never touch it
- **Never run any git command.** That means no `git add`, `commit`, `push`, `pull`, `checkout`, `branch`, `reset`, `stash`, `merge`, `rebase` or `init`, and no `gh` commands.
- Never create, edit or delete anything inside the `.git` folder.
- I (Jamis) do all commits and pushes myself with **GitHub Desktop**.
- When a step is finished and working, tell me: "Good time to commit," and suggest a short commit message.

### Commands
- You may run any other command you need, such as `npm install`, `npm run dev`, `npm run build`, `npx` tools and Supabase CLI commands. Say in one line what each command does before you run it.
- I'm on **Windows**. Use commands that work in the VS Code terminal (PowerShell).

### Comments in every file (required)
I'm still learning, so every piece of code must explain itself:
- **At the top of every file:** a short comment saying what the file is for and where it's used.
- **Above every function, component, hook, API route and SQL function:** a comment saying what it does, what it takes in and what it gives back.
- **Inside the code:** comment any line or block that isn't obvious, especially database queries, the booking and seat logic, payment steps and security checks.
- Write comments in plain, simple English.
- SQL migration files get comments too: what each table, column, policy and function is for.

Example:
```ts
// Works out how many seats are still free in one class session.
// Takes: the session's capacity and its list of bookings.
// Gives back: a number from 0 up to the capacity.
function seatsLeft(capacity: number, bookings: Booking[]): number {
  // Only count bookings that are actually holding a seat right now
  const holding = bookings.filter(isHoldingSeat);
  return Math.max(0, capacity - holding.length);
}
```

### Tests (required)
- Every database change gets tests in `supabase/tests/` (`npm run test:db`); plain logic gets unit tests in `tests/unit/` (`npm run test:unit`).
- Before saying a step is done, run `npm run test:db`, `npm run test:unit`, the type check (`npx tsc --noEmit`), `npm run lint` and `npm run build`, and report the results honestly.

### How we work
- I'm new to Next.js, Supabase and Claude Code. Explain things simply, with no jargon unless you explain it.
- Work in **small steps**: one feature at a time. Give me a short plan first, build it, tell me how to test it, then stop and wait for me.
- After each step, update `docs/PROGRESS.md` with **3–5 short lines** (done, next, known problems). Don't add long details there.
- Don't add features that aren't in this file or the proposal without asking me.
- If a rule in this file and something I say in chat disagree, ask me which one wins.

---

## 2. Tech stack

| Part | Tool | Notes |
| --- | --- | --- |
| Website and server code | **Next.js 16** (App Router, TypeScript, `src/` folder) | API routes and Server Actions are our backend. Middleware is `src/proxy.ts` (Next.js 16's name for it). No PHP or XAMPP. |
| Styling | **Tailwind CSS 4** | Mobile-first, with brand colors as theme tokens |
| Database | **Supabase** Postgres | Changes are kept as SQL files in `supabase/migrations/` |
| Login | **Supabase Auth** | Email and password, forgot password, Google login, "Save login" (Never / Always) |
| File storage | **Supabase Storage** | Buckets `site-images` (public) and `payment-screenshots` (private) |
| Supabase in Next.js | `@supabase/ssr` + `@supabase/supabase-js` | Browser, server, guest and service clients in `src/lib/supabase/` |
| Payments | **PayMongo, test mode only** | GCash, Maya and card through Checkout Sessions, plus a webhook |
| Emails | Gmail SMTP with an App Password (`nodemailer`, server only) | **Build last** (Step 14) |
| Timed jobs | Supabase `pg_cron` | Creates sessions 9 weeks ahead, and sends reminders (**last**) |
| Hosting | Vercel | Step 13 |

**Security rules**
- Secret keys go only in `.env.local`, never in code: `SUPABASE_SECRET_KEY` (the service role key), `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` and the email password. Keep `.env.example` updated with key names but no values. `.env.local` must stay in `.gitignore`.
- Never use the secret (service role) key in browser code. Use it only in server code (API routes, server actions).
- Turn on **Row Level Security** for every table. Clients can read and change only their own rows. Only admins can change schedules, prices, content, users and settings.
- Check the user's role on the server for every admin page and admin API route, not only by hiding buttons.
- Never store card numbers or bank account digits. Store only the amount, method, PayMongo reference, status and time.

---

## 3. Business facts

- **Block 69 Cafe**, 444 Kamagong St., Comembo, Taguig City. Email block69cafe@gmail.com. Instagram and Facebook: @block69cafe.
- The class is **Mindful Mat Pilates**, a beginner class using the STOTT method, taught by **Mhay Florence Corpuz**. Class days come from `schedule_templates` (currently **Thursday to Sunday**, never hard-coded).
  - Session 1: 9:00 to 9:50 AM
  - Session 2: 10:15 to 11:05 AM
- **Capacity** is 4 per session by default. The admin can change it, for example to 3, for all sessions or for one date.
- **Price**: ₱500, which includes an upsized matcha or coffee. **Mat rental** is +₱50, and all of it is donated to feed stray animals.
- **Not suitable for pregnant participants.** This is stated in the Health and Safety Information on Home. Online booking has no "I am not pregnant" tick (walk-ins still confirm it in person).
- What to bring: mat (or rent one), water bottle, towel, comfortable workout clothes (editable on admin Content).
- Private sessions are by appointment through the "Chat With Us" button (a Messenger or Instagram link). They are not part of online booking.

---

## 4. Website flow

### Who can do what
| Role | Can do |
| --- | --- |
| Guest (not logged in) | See Home, About Us, Policies and the classes with seats left on `/book`, use Chat With Us. Must log in to book. |
| Client | Book and pay, use voucher codes, see, cancel or transfer their own bookings, edit their profile, see their payments, vouchers and updates |
| Admin | Everything on the admin side. Admins can't use the client booking or My Account pages. |

### Client flow
```
Home ──> Book Your Session ──> Step 1: month (this month / next month) ──> date chip ──> session (seats left, full = greyed out), Rent a mat tick
     ──> (not logged in? ──> Log in / Sign up / Google ──> Finish your profile if mobile or birthday is missing ──> back to booking)
     ──> Step 2: your details (name, mobile, email, Instagram shown from the profile; drink, notes, voucher, Registration Agreement tick)
     ──> Step 3: review & pay (total, 15-minute countdown, GCash / Maya / card)
     ──> PayMongo checkout
     ──> You're booked page
         (or) Seat released / payment expired ──> try again
         (or) Manual transfer (backup, only if admin turned it on): GCash / BPI details + screenshot upload
```

**Client pages**
- **Home** (guests can see it): hero "Mat Pilates For Beginners" with a "Book Your Session" button (no price), Class Details & Location (description, full address, Open in Google Maps, the mat rental line), What's included + What to bring, How it works, a call-to-action box, and **Health and Safety Information** last before the footer. No "Next open sessions" list.
- **About Us** (guests can see it): the cafe, the class (quick facts), the instructor, a short cancellation policy, FAQ, visit us, and contact (email, Instagram, Facebook, Chat With Us; no phone number).
- **Policies**: the full cancellation policy and the Registration Agreement.
- **Log in** (`/login`), **Sign up**, **Forgot password**: password show / hide, "Save login next time" (Never / Always), Continue / Sign up with Google. Sign-up rules: mobile is 11 digits starting with 09, birthday MM/DD/YYYY (a real past date), email @gmail.com or @yahoo.com only, password 8+.
- **Booking:** the 3-step flow above. Step 1 has a month navigator (this month and next month only), date chips for only the dates that have classes, that date's sessions with seat badges, and the Booking details card (what to bring, Rent a mat, total).
- **You're booked**, **seat released / Payment expired**, and **Manual transfer**.
- **My Account** (side menu on desktop, list on phone):
  - My Profile, three cards:
    - Account Information: email (changed with two 6-digit codes, gmail/yahoo only), change password, forgot password
    - Personal Information: full name, mobile, Instagram, birthday (editable, a real past date)
    - Account Management: deactivate account, delete account (bookings and payments are kept, the profile is blanked and the login removed)
  - My Bookings: upcoming (status badge, Cancel and Transfer) and past. Transfer uses the same month navigator + date chips as booking step 1
  - Payments: payment history with receipts ("Payment Date"), with a Filter (status, method, month or date range)
  - My Vouchers: codes with their status and expiry date
  - Notifications: email settings only (the booking updates are in the header's bell)

The client nav has Home, About Us, Book a Class, a notifications bell, the person icon (My Account), and Log in or Log out (far right). On the login and sign-up pages the guest button says "Book Now". On phones the nav collapses into a menu button. A floating **Chat With Us** button (lower right, never covering the footer) links to Messenger or Instagram.

### Admin flow
Admins log in at **`/admin/login`** (separate from the client `/login`; each page refuses the other kind of account) and land on `/admin`. On desktop the admin side has a brown sidebar. On phones it has a top bar with a menu and a bottom tab bar.

**Admin pages**
- **Dashboard:** today's and this week's sessions with seats filled, a "Needs action" list (awaiting verification, paid needs action, no-shows to mark), earnings for this week and this month, and shortcuts.
- **Bookings:** a table with filters (date, session, status) and search. A booking details page with: approve or reject a manual payment, cancel or transfer (an override of the normal rule needs a reason), mark attended or no-show.
- **Walk-in booking:** pick a session, enter name and contact, confirm the health check and agreement in person, and record a cash or transfer payment. It takes a seat like an online booking.
- **Attendance list** per session: each guest, their drink choice and their mat rental, so the barista can prepare. Printable and works on a phone.
- **Schedule:** the weekly pattern (days, times, default capacity), "Create classes", and the dated classes (change capacity for one date, close or cancel a session).
- **Pricing & Vouchers:** the class price and the mat rental price, creating promo codes, and viewing the 50% codes the system has issued.
- **Payments (Billings):** a payments list (method, amount, status, PayMongo reference), earnings by day, week and month, and the mat rental donation total shown separately.
- **Content:** edit the text and images on Home and About Us, the what-to-bring list, the policy text and the agreement text.
- **Users:** search users, view their details and booking history, deactivate or reactivate them, and make someone an admin.
- **Communications:** resend a confirmation, or send a notice to everyone in a session. Build this last, with emails.
- **Settings:** cafe name, contact details, social links, booking cutoff time, seat hold minutes, the manual payment backup on or off, and drink options.

---

## 5. Booking, payment and cancellation rules

These rules are enforced by the code and the database, not just shown as text.

**Seats**
- One booking = one seat = one person. Friends book separately.
- **Seats left** = capacity minus the bookings that are `confirmed`, `awaiting_verification`, `attended`, or `pending_payment` with `hold_expires_at` still in the future. (`attended` counts so a walk-in can't overbook a class after the admin marks people as here.)
- **15-minute seat hold:** when the client confirms, create the booking as `pending_payment` with `hold_expires_at = now + 15 min`. No timer is needed, because expired holds simply stop counting.
- **No overbooking:** the seat check and the booking insert happen in **one Postgres function**, which locks the session row (`SELECT ... FOR UPDATE`). Two people can never get the last seat.
- **Cutoff:** online booking closes at **8:00 AM on class day** (a setting), or when the session is full.
- **How far ahead:** clients can book this month and next month. Dated classes must exist **9 weeks ahead** (setting `sessions_weeks_ahead`; "Create classes" on the admin Schedule page until the nightly job exists).
- **Required to book online:** only the Registration Agreement tick (`book_seat` and the `bookings_agreement_required` check).
- If the class is less than 12 hours away, warn the client that cancelling will give no credit.

**Prices**
- Always read prices from the `settings` table, never hard-code ₱500 or ₱50.
- The server calculates the total. Never trust a total sent from the browser.
- Vouchers discount **only the class fee**, never the mat rental.

**PayMongo payment (test mode)**
1. The client clicks Pay. The server works out the total, the booking already holds the seat (`pending_payment`, 15-minute hold), and the server creates a PayMongo Checkout Session.
2. The client is sent to PayMongo's page and pays with GCash, Maya or card.
3. PayMongo calls our **webhook** (and the return page checks too). We verify the signature, then set the payment to `paid` and the booking to `confirmed`.
4. If a payment arrives **after** the hold has ended and the class is now full, the booking becomes `paid_needs_action` and shows at the top of the admin Dashboard.
5. If payment fails or the time runs out, the booking becomes `expired`.

**Manual transfer (backup, the admin turns it on or off)**
- Show the GCash and BPI details. The client uploads a screenshot to Supabase Storage. The booking becomes `awaiting_verification` and the seat stays held. The admin approves the booking (`confirmed`) or rejects it.

**Client cancels a confirmed booking**
| Time before class | What happens | New status |
| --- | --- | --- |
| More than 24 hours | Client picks another open session. Same paid inclusions, no new payment. **Allowed once per booking.** | `transferred` (a new booking is made for the new session) |
| 12 to 24 hours | Cancelled, and the client gets a personal **50% code** (class fee only, valid **60 days**, one use) | `cancelled_with_voucher` |
| Less than 12 hours | Cancelled, no credit. The Cancel button warns the client first. | `forfeited` |
| Didn't show up | The admin marks it, no credit | `no_show` |

- If the client transfers and now wants a mat, they pay the ₱50 in cash at the cafe. There are no cash refunds, unless the cafe caused the problem.
- **If the cafe cancels a session,** booked clients get a free transfer.

**All booking statuses:** `pending_payment`, `awaiting_verification`, `confirmed`, `paid_needs_action`, `expired`, `transferred`, `cancelled_with_voucher`, `forfeited`, `no_show`, `attended`.

---

## 6. Database tables (Supabase)

| Table | One row is | Main columns |
| --- | --- | --- |
| `profiles` | One user (linked to `auth.users`) | full_name, email, mobile, instagram, birthday, role (`client`/`admin`), is_active, email_reminders, deleted_at |
| `schedule_templates` | One weekly slot pattern | weekday, start_time, end_time, default_capacity, is_active |
| `class_sessions` | One dated class | date, start_time, end_time, capacity, status (`open`/`closed`/`cancelled`) |
| `bookings` | One seat for one person | user_id (or walkin_name + walkin_contact), session_id, status, mat_rental, drink_choice, voucher_id, class_fee, mat_fee, discount, total, first_time, health_notes, not_pregnant_confirmed (null = not asked, online bookings), agreed_at (required), hold_expires_at, transferred_from |
| `payments` | One payment attempt | booking_id, provider (`paymongo`/`manual`/`cash`), method (`gcash`/`maya`/`card`/`bpi`/`cash`), amount, status, paymongo_ref, screenshot_path, verified_by, paid_at |
| `vouchers` | One discount code | code, percent_off or amount_off, owner_id (if personal), source (`cancellation`/`promo`), uses_left, expires_at, disabled_at |
| `settings` | One setting | key, value, is_public (class_price, mat_price, cutoff_time, hold_minutes, drink_options, manual_payment_enabled, sessions_weeks_ahead, contact details) |
| `site_content` | One editable block of page content | page, section, title, body, image_path |
| `email_log` | One email sent | user_id, booking_id, type, sent_at |
| `notifications` | One update in a client's bell | user_id, booking_id, kind, voucher code, created, read |
| `booking_admin_actions` | One admin cancel / transfer (admins only) | who, when, action, normal rule, override, reason, 50% code |

Default data (settings, the Thu–Sun templates, page text) is in the migrations. `supabase/seed.sql` and `supabase/manual-tests/` are test data only.

---

## 7. Design rules

**Fonts (whole site, client and admin)**
- **Poppins** for headings, the logo text, big numbers and buttons
- **Montserrat** for body text, forms, tables and labels
- Load both with `next/font/google`.

**Colors** (Tailwind theme tokens in `globals.css` with `@theme`; never repeat hex codes in components)

The **client side** uses a green / beige palette. The **admin side keeps the brown palette**: the admin frame and `/admin/login` have `data-theme="admin"`, which sets the same token names back to the admin values (see the top of `globals.css`).

| Token | Client | Admin | Used for |
| --- | --- | --- | --- |
| `primary` | `#5F735D` (sage-dark) | `#43271B` | Primary buttons, client header bar, active pill, selected date, anything with white text on it |
| `on-primary` | `#FFFFFF` | `#FAF7F3` | Text on a `primary` fill |
| `heading` | `#2E2A24` | `#43271B` | Headings (h1–h4) |
| `brown` | `#5B3F2E` | `#43271B` | Accents, secondary button outline, client footer, admin sidebar |
| `cream` | `#FFF9F2` | `#FFEBC5` | Page background |
| `card` | `#F3E7D8` (beige) | `#FAF7F3` | Cards |
| `line` | `#E2D0B8` | `#E6D3AE` | Card borders, dividers, input borders |
| `tan-soft` | `#E8EFE6` (light sage) | `#F2DFBB` | Active nav item, chips, avatar circles, soft panels |
| `tan` | `#7A8F78` (sage) | `#DAC49B` | Muted accents |
| `ink` | `#2E2A24` | `#273429` | Main text |
| `muted` | `#565D59` | `#565D59` | Secondary text |
| `sage` / `sage-dark` / `sage-light` / `beige` | `#7A8F78` / `#5F735D` / `#E8EFE6` / `#F3E7D8` | (client only) | The proposal's named colors |
| `admin-bg` | | `#F3EEE4` | Admin page background (admin cards are white with border `#EFE6D6`) |
| `admin-active` | | `#E3D2AE` | Active admin sidebar item |

Sage Green `#7A8F78` with white text is only 3.5:1 (fails WCAG AA), so anything with white text on it uses **sage-dark `#5F735D`** (5.1:1). Plain `#7A8F78` is for borders, icons and accents only.

Status badge colors (background / text):
- Success (confirmed, paid, active): `#E4ECE3` / `#2F6B3F`
- Available (a class with free seats, client): `#E8EFE6` / `#2F6B3F`
- Info (awaiting verification): `#E3E9F2` / `#2F4E7A`
- Warning (few seats left, pending): `#FBE9C0` / `#8A5A00`
- Error (needs action, expired, forfeited, fully booked): `#F8DEDA` / `#B3261E`
- Neutral (used, transferred, booking closed): client `#EAD8C1` / `#5B3F2E`, admin `#F2DFBB` / `#43271B`

**Shapes and layout**
- Cards: rounded corners (20 to 24px), cream-white fill, thin tan border, no heavy shadows.
- Buttons: fully rounded pills. Primary is a `primary` fill with light text. Secondary is a brown outline. Danger is a red outline.
- Inputs: rounded (12px), white, tan border, with the label above the field.
- Client header: sage-dark, with "Block 69 Cafe" (Poppins) and "MAT PILATES + CAFÉ" in small letter-spaced caps under it. 96px tall on desktop, 64px on phone (with a menu button).
- Footer: brown (`#5B3F2E`), with the address, contact details, quick links and the stray animals note.
- Admin: a brown sidebar (280px) on desktop and a top bar with a menu on phone. Content goes on white cards.

**Responsive (required)**
- Build **mobile-first**. Every page must work at **390px** (phone) and **1440px** (laptop).
- On phones: forms are one column, tables become cards or scroll inside their box, there's no sideways page scrolling, and buttons are at least 44px tall.
- The booking flow on phones has a sticky bottom bar with the total and the Continue or Pay button.

**Accessibility**
- Use real `<button>`, `<a>`, `<label>` and `<input>` elements.
- Keep text contrast readable, and give icon-only buttons an `aria-label`.

**Designs to follow**
- `docs/designs/` has 21 HTML mockups (open them in a browser; ignore the missing `support.js`). Copy their **layout, spacing and colors**, but use Poppins and Montserrat. **Client mockups:** copy layout and spacing only; their brown colors were replaced by the green / beige palette. Admin mockups keep their colors.
- Pages without a mockup follow the same style. Use simple line icons (`lucide-react`), never emoji.

---

## 8. Folder layout

```
src/
  proxy.ts             login refresh + route protection (Next.js 16 "middleware")
  app/
    (client)/          Home, About, Policies, booking, account pages
    (auth)/            login, signup, forgot-password, reset-password
    admin/login/       admin login (no admin menu)
    admin/(panel)/     all other admin pages (role-protected)
    api/               API routes (PayMongo webhook)
    auth/              /auth/confirm, /auth/deactivated
  components/          shared UI (ui/, layout/, booking, admin...)
  lib/
    auth/ booking/ account/ admin/   Server Actions and guards
    data/              functions pages call to read Supabase
    supabase/          browser, server, guest and service clients
    paymongo.ts        PayMongo helpers (server only)
    booking-rules.ts   helpers for showing rules in the UI (real checks are in the database)
  types/               database.ts (generated) and app types
tests/unit/            unit tests (npm run test:unit)
supabase/
  migrations/          SQL files: tables, RLS policies, functions
  seed.sql             test data only, never pushed
  tests/               database tests (npm run test:db)
  manual-tests/        setup / cleanup SQL pasted by hand for click-throughs
docs/
  PROPOSAL.md, PROGRESS.md, progress-archive.md, HANDOFF.md, prompts/, designs/
```

---

## 9. Build order and database rules

Phases A to D (steps 1–12), Revisions part 1, Change 16 and Change 17 are done; see `docs/PROGRESS.md`. Still to do: **Step 13** deploy to Vercel, **Step 14** emails, pg_cron jobs (create sessions, reminders) and the Communications page, **Step 15** final check at 390px and 1440px. Each has a prompt in `docs/prompts/`.

**Database rules (important)**
- Every database change is a new SQL file in `supabase/migrations/`, named with a timestamp (for example `20261022000001_tables.sql`). Never change the database only by clicking in the dashboard. The group must be able to rebuild it from these files.
- Business rules that must never break live **in the database**: the seat check and booking (one Postgres function with a row lock), seats left, and RLS policies. The website calls these functions instead of repeating the logic. If a new decision clashes with a database rule, change the rule in a new migration; don't work around it in page code.
- Test data goes in `supabase/seed.sql` or `supabase/manual-tests/`, not in the migrations.
- Use the Supabase CLI through `npx supabase ...` (`db push`, then `npm run gen:types`). If the CLI gives trouble on Windows, give me the SQL to paste into the Supabase **SQL Editor** instead.
