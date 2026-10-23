# Block 69 Cafe Pilates Website: Project Overview

**Read this whole file before writing any code.** Then read `docs/PROGRESS.md` to see what's done and what's next. The full proposal is in `docs/PROPOSAL.md`, and the screen designs are in `docs/designs/`.

This is a school project (Group 6 PBL). We're building a booking and payment website for **Block 69 Cafe**, a coffee shop in Taguig City that runs beginner "Mindful Mat Pilates" classes. Clients book and pay online, and the cafe runs everything from an admin side.

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

### How we work
- I'm new to Next.js, Supabase and Claude Code. Explain things simply, with no jargon unless you explain it.
- Work in **small steps**: one feature at a time. Give me a short plan first, build it, tell me how to test it, then stop and wait for me.
- After each step, update `docs/PROGRESS.md` (done, next, known problems).
- Don't add features that aren't in this file or the proposal without asking me.
- If a rule in this file and something I say in chat disagree, ask me which one wins.

---

## 2. Tech stack

| Part | Tool | Notes |
| --- | --- | --- |
| Website and server code | **Next.js** (App Router, TypeScript, `src/` folder) | API routes are our backend. No PHP or XAMPP. |
| Styling | **Tailwind CSS** | Mobile-first, with brand colors as theme tokens |
| Database | **Supabase** Postgres | Changes are kept as SQL files in `supabase/migrations/` |
| Login | **Supabase Auth** | Email and password, plus forgot password. Google login is optional, so add it last. |
| File storage | **Supabase Storage** | Logo, page images, manual payment screenshots |
| Supabase in Next.js | `@supabase/ssr` + `@supabase/supabase-js` | Browser client, server client, middleware |
| Payments | **PayMongo, test mode only** | GCash, Maya and card through Checkout Sessions, plus a webhook |
| Emails | Resend or Supabase email | **Build last** |
| Timed jobs | Supabase `pg_cron` | Creates sessions 9 weeks ahead (so next month is always bookable), and sends reminders (**last**) |
| Hosting | Vercel | Done at the very end |

**Security rules**
- Secret keys go only in `.env.local`, never in code. These are the Supabase service role key, the PayMongo secret key and the webhook secret. Keep `.env.example` updated with key names but no values. `.env.local` must stay in `.gitignore`.
- Never use the service role key in browser code. Use it only in server code (API routes, server actions).
- Turn on **Row Level Security** for every table. Clients can read and change only their own rows. Only admins can change schedules, prices, content, users and settings.
- Check the user's role on the server for every admin page and admin API route, not only by hiding buttons.
- Never store card numbers or bank account digits. Store only the amount, method, PayMongo reference, status and time.

---

## 3. Business facts

- **Block 69 Cafe**, 444 Kamagong St., Comembo, Taguig City. Email block69cafe@gmail.com. Instagram and Facebook: @block69cafe.
- The class is **Mindful Mat Pilates**, a beginner class using the STOTT method. It runs **Thursday to Sunday**.
  - Session 1: 9:00 to 9:50 AM
  - Session 2: 10:15 to 11:05 AM
- **Capacity** is 4 per session by default. The admin can change it, for example to 3, for all sessions or for one date.
- **Price**: ₱500, which includes an upsized matcha or coffee. **Mat rental** is +₱50, and all of it is donated to feed stray animals.
- **Not suitable for pregnant participants.** This is stated in the Health and Safety Information on Home. Since Change 17 there is no "I am not pregnant" tick in online booking (walk-ins still confirm it in person).
- What to bring: mat (or rent one), small towel, water bottle, grip socks.
- Private sessions are by appointment through the "Chat With Us" button (a Messenger or Instagram link). They are not part of online booking.

---

## 4. Website flow

### Who can do what
| Role | Can do |
| --- | --- |
| Guest (not logged in) | See Home and About Us, see sessions with seats left, use Chat With Us. Must log in to book. |
| Client | Book and pay, use voucher codes, see, cancel or transfer their own bookings, edit their profile, see their payments and vouchers |
| Admin | Everything on the admin side |

### Client flow
```
Home ──> Book Now ──> (not logged in? ──> Log in / Sign up ──> back to booking)
     ──> Step 1: month (this month / next month) ──> date chip ──> session (seats left, full = greyed out), mat rental tick
     ──> Step 2: your details (prefilled from profile + health questions)
     ──> Step 3: review & pay (mat add-on, voucher, total, policy, agreement)
     ──> PayMongo checkout (GCash / Maya / card)
     ──> You're booked page + confirmation
         (or) Payment expired page ──> try again
         (or) Manual transfer page (backup, only if admin turned it on)
```

**Client pages**
- **Home** (guests can see it): hero with a Book Now button, about the class, location and free drink, feature cards, "Next open sessions" with seats left, and a footer with the address and the stray animals note.
- **About Us** (guests can see it): the cafe and the instructor, the address with a map link, contact details, and health and safety notes.
- **Log in, Sign up, Forgot password.** Admins who log in go to the admin Dashboard.
- **Booking:** a 3-step flow (above). Step 1 (Change 17): a month navigator limited to this month and next month, date chips for only the dates that have classes (days come from `schedule_templates`), that date's sessions with seat badges, and the Booking details card (what to bring, Rent a mat, total). Step 2 shows the name, mobile, email and Instagram from the profile, and collects injuries or medical notes, drink choice (options come from settings), a voucher code, and the Registration Agreement checkbox (there is **no** not-pregnant checkbox since Change 17). Step 3 is payment.
- **You're booked**, **Payment expired**, and **Manual transfer** (shows GCash and BPI details, plus a screenshot upload).
- **My Account** (with a side menu on desktop and a list on phone):
  - My Profile (Change 17), three cards:
    - Account Information: email (changed with two 6-digit codes, gmail/yahoo only), change password, forgot password
    - Personal Information: full name, mobile (09 + 11 digits), Instagram, birthday (editable, a real past date)
    - Account Management: deactivate account, delete account (bookings and payments are kept, the profile is blanked and the login removed)
  - My Bookings: upcoming bookings (status badge, Cancel and Transfer buttons) and past bookings. Transfer uses the same month navigator + date chips as booking step 1
  - Payments: payment history with receipts ("Payment Date"), with a Filter (status, method, month or date range)
  - My Vouchers: codes with their status and expiry date
  - Notifications: email settings only (the booking updates are in the header's bell)

The nav on every client page has Home, About Us, Book a Class, a notifications bell, the person icon (My Account), and Log in or Log out (far right; not in the My Account menu). On phones it collapses into a menu button. A floating **Chat With Us** button links to Messenger or Instagram.

### Admin flow
Admins use the same login page and are sent to `/admin`. On desktop the admin side has a brown sidebar. On phones it has a top bar with a menu.

**Admin pages**
- **Dashboard:** today's and this week's sessions with seats filled, and a "Needs action" list (awaiting verification, paid needs action, no-shows to mark). It also shows earnings for this week and this month, and shortcuts.
- **Bookings:** a table with filters (date, session, status) and search by name. It has a booking details panel. Actions: approve or reject a manual payment, cancel, transfer, mark attended or no-show.
- **Walk-in booking:** pick a session, enter name and contact, confirm the health check and agreement in person, and record a cash or transfer payment. It takes a seat like an online booking.
- **Attendance list** per session: each guest, their drink choice and their mat rental, so the barista can prepare. It should be printable and work on a phone.
- **Schedule Management:** the weekly pattern (days, times, default capacity) and a calendar of dated sessions. Here the admin can change capacity for one date, or close a session or a whole day.
- **Pricing & Vouchers:** the class price and the mat rental price, creating promo codes, and viewing the 50% codes the system has issued.
- **Manage Billings:** a payments list (method, amount, status, PayMongo reference), earnings by day, week and month, and the mat rental donation total shown separately.
- **Content Management:** edit the text and images on Home and About Us, the what-to-bring list, the policy text and the agreement text.
- **User Management:** search users, view their details and booking history, deactivate or reactivate them, and make someone an admin.
- **Communications:** resend a confirmation, or send a notice to everyone in a session. Build this last, with emails.
- **Settings:** logo, cafe name, contact details, social links, booking cutoff time, seat hold minutes, the manual payment backup on or off, and drink options.

---

## 5. Booking, payment and cancellation rules

These rules are enforced by the code and the database, not just shown as text.

**Seats**
- One booking = one seat = one person. Friends book separately.
- **Seats left** = capacity minus the bookings that are `confirmed`, `awaiting_verification`, `attended`, or `pending_payment` with `hold_expires_at` still in the future. (`attended` counts so a walk-in can't overbook a class after the admin marks people as here.)
- **15-minute seat hold:** when the client clicks Pay, create the booking as `pending_payment` with `hold_expires_at = now + 15 min`. No timer is needed, because expired holds simply stop counting.
- **No overbooking:** the seat check and the booking insert happen in **one Postgres function**, which locks the session row (`SELECT ... FOR UPDATE`). Two people can never get the last seat.
- **Cutoff:** online booking closes at **8:00 AM on class day** (a setting), or when the session is full.
- **How far ahead:** clients can book this month and next month. Dated classes must exist **9 weeks ahead** (setting `sessions_weeks_ahead`; "Create classes" on the admin Schedule page until the nightly job exists).
- **Required to book online:** only the Registration Agreement tick (`book_seat` and the `bookings_agreement_required` check). The not-pregnant tick was removed in Change 17.
- If the class is less than 12 hours away, warn the client that cancelling will give no credit.

**Prices**
- Always read prices from the `settings` table, never hard-code ₱500 or ₱50.
- The server calculates the total. Never trust a total sent from the browser.
- Vouchers discount **only the class fee**, never the mat rental.

**PayMongo payment (test mode)**
1. The client clicks Pay. The server works out the total, creates the booking (`pending_payment`, 15-minute hold), and creates a PayMongo Checkout Session that expires when the hold does.
2. The client is sent to PayMongo's page and pays with GCash, Maya or card.
3. PayMongo calls our **webhook**. We verify the signature, then set the payment to `paid` and the booking to `confirmed`.
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
| `profiles` | One user (linked to `auth.users`) | full_name, email, mobile, instagram, birthday, role (`client`/`admin`), is_active, email_reminders |
| `schedule_templates` | One weekly slot pattern | weekday, start_time, end_time, default_capacity, is_active |
| `class_sessions` | One dated class | date, start_time, end_time, capacity, status (`open`/`closed`/`cancelled`) |
| `bookings` | One seat for one person | user_id (or walkin_name + walkin_contact), session_id, status, mat_rental, drink_choice, voucher_id, class_fee, mat_fee, discount, total, first_time, health_notes, not_pregnant_confirmed (optional: null = not asked, online bookings since Change 17), agreed_at (required), hold_expires_at, transferred_from |
| `payments` | One payment attempt | booking_id, provider (`paymongo`/`manual`/`cash`), method (`gcash`/`maya`/`card`/`bpi`/`cash`), amount, status, paymongo_ref, screenshot_path, verified_by, paid_at |
| `vouchers` | One discount code | code, percent_off or amount_off, owner_id (if personal), source (`cancellation`/`promo`), uses_left, expires_at |
| `settings` | One setting | key, value (class_price, mat_price, cutoff_time, hold_minutes, drink_options, manual_payment_enabled, contact details) |
| `site_content` | One editable block of page content | page, section, title, body, image_path |
| `email_log` | One email sent | user_id, booking_id, type, sent_at |

Seed data: the Thu to Sun templates for both sessions, the default settings, and one admin account.

---

## 7. Design rules

**Fonts (whole site, client and admin)**
- **Poppins** for headings, the logo text, big numbers and buttons
- **Montserrat** for body text, forms, tables and labels
- Load both with `next/font/google`.

**Colors** (set them as Tailwind theme tokens in `globals.css` with `@theme`, and never repeat hex codes in components)

The **client side** (Change 17) uses a green / beige palette. The **admin side keeps the brown palette**: the admin frame and `/admin/login` have `data-theme="admin"`, which sets the same token names back to the admin values (see the top of `globals.css`).

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
- Buttons: fully rounded pills. Primary is a `primary` fill with light text (sage-dark on the client side, brown on the admin side). Secondary is a brown outline. Danger is a red outline.
- Inputs: rounded (12px), white, tan border, with the label above the field.
- Client header: sage-dark, with "Block 69 Cafe" (Poppins) and "MAT PILATES + CAFÉ" in small letter-spaced caps under it. It's 96px tall on desktop and 64px on phone, where it shows a menu button.
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
- `docs/designs/` has 21 HTML mockups: open them in a browser to look at them. (They link a missing `support.js`; ignore that.) Copy their **layout, spacing and colors**, but use our fonts (Poppins and Montserrat), not the fonts written in the mockups. **Client mockups:** copy layout and spacing only; their brown colors were replaced by the green / beige palette above (Change 17). Admin mockups keep their colors.
  - Client desktop: Profile, Payments, Vouchers, Notifications
  - Admin desktop: AdminPayments, AdminPricing, AdminBookings, AdminWalkIn, AdminAttendance, AdminSettings
  - Phone client: PhoneHome, PhoneMenu, PhoneBook1, PhoneBook2, PhoneBook3, PhoneBooked, PhoneMyBookings, PhoneLogin
  - Phone admin: PhoneAdminDashboard, PhoneAdminBookings, PhoneAdminAttendance
- Pages without a mockup (desktop Home, About, Login, Booking, admin Dashboard, Schedule, Content, Users, Communications) should **follow the same style** as the mockups.
- Use simple line icons (for example `lucide-react`), never emoji.

---

## 8. Suggested folder layout

```
src/
  app/
    (client)/          Home, About, booking, account pages
    (auth)/            login, signup, forgot-password
    admin/             all admin pages (role-protected)
    api/               API routes (checkout, paymongo webhook, etc.)
  components/          shared UI (Header, Footer, Button, Card, Badge...)
  lib/
    data/              functions pages call to read/write Supabase
    supabase/          browser + server Supabase clients
    paymongo.ts        PayMongo helpers (server only)
    booking-rules.ts   small helpers for showing rules in the UI (real checks are in the database)
  types/               TypeScript types for tables
supabase/
  migrations/          SQL files: tables, RLS policies, functions
  seed.sql             test data (settings, templates, sessions, sample bookings)
  tests/               SQL test scripts for the booking rules
docs/
  PROPOSAL.md, PROGRESS.md, designs/
```

---

## 9. Build order (one step at a time)

We build the **database first**, then the website on top of it. Every page reads **real data** from Supabase as soon as it's built, so there's no fake data to replace later.

**Database rules (important)**
- Every database change is a SQL file in `supabase/migrations/`, named with a timestamp (for example `20261022000001_tables.sql`). Never change the database only by clicking in the dashboard. The group must be able to rebuild it from these files.
- Business rules that must never break live **in the database**: the seat check and booking (one Postgres function with a row lock), seats left, and RLS policies. The website calls these functions instead of repeating the logic.
- Test data (sample sessions and bookings) goes in `supabase/seed.sql`, not in the migrations.
- Use the Supabase CLI through `npx supabase ...`. If the CLI gives trouble on Windows, give me the SQL to paste into the Supabase **SQL Editor** instead.

**Phase A: Database (Supabase)**
1. **Supabase project and CLI setup:** I create the project on supabase.com. Claude Code runs `npx supabase init`, links the project and makes `.env.example`.
2. **Tables:** all tables from section 6 with types, defaults, foreign keys, status enums, checks and indexes, plus a trigger that creates a `profiles` row when someone signs up.
3. **Security:** turn on RLS and write policies for every table, plus an `is_admin()` helper.
4. **Functions:** `seats_left(session_id)`, `book_seat(...)` (seat check, cutoff and 15-minute hold in one locked step), `generate_sessions(weeks)` from the templates, cancel and transfer rules, and the voucher check.
5. **Seed and test:** default settings, the Thu–Sun templates, 4 weeks of sessions, sample bookings, and one admin. Then a test script that proves overbooking can't happen and the cancellation rules work.

**Phase B: Website setup**

6. Next.js, Tailwind theme tokens, Poppins + Montserrat, shared components (Button, Card, Badge, Input, Header with phone menu, Footer), Supabase clients, generated TypeScript types (`npx supabase gen types`)
7. Auth: log in, sign up, forgot password, admin redirect, route protection (middleware)

**Phase C: Pages (connected to real data)**

8. Home and About Us, with live "next open sessions"
9. Booking flow: steps 1 to 3 (calls `book_seat`), You're booked, Payment expired
10. My Account: Profile, My Bookings (cancel and transfer), Payments, My Vouchers, Notifications
11. Admin: layout, Dashboard, Bookings, Walk-in, Attendance, Schedule, Pricing & Vouchers, Billings, Content, Users, Settings

**Phase D: Payments**

12. PayMongo test mode: checkout, webhook, the late payment rule, the manual transfer backup with screenshot upload

**Phase E: Finish**

13. Emails, pg_cron jobs (create sessions, reminders), Communications page, optional Google login
14. Final check of every page at 390px and 1440px, then deploy to Vercel
