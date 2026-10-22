# Block 69 Cafe Pilates Booking System Proposal

Group 6 PBL · 2026-10-22 · Jamis

## Overview

We will build a mobile-friendly web app where clients book and pay for Block 69 Cafe's Mindful Mat Pilates classes in one go, and the cafe runs schedules, prices and site content from an admin side.

**The business.** Block 69 Cafe (444 Kamagong St., Comembo, Taguig City) is a coffee shop that runs beginner Mat Pilates using the STOTT method. Classes run Thursday to Sunday in two sessions, 9:00 to 9:50 AM and 10:15 to 11:05 AM, with 3 to 4 guests per session. The fee is ₱500 and includes an upsized matcha or coffee. Mat rental is ₱50, and that money is donated to feed stray animals.

**The problem today.**

- Clients book through a Google Form, and the dates in the dropdown are typed in by hand each week.
- Clients pay by GCash or BPI transfer, then upload a screenshot. Staff check each screenshot against their account and reply by email or SMS.
- Nothing stops a session from being overbooked, because the form does not count seats.
- Cancellations, transfers and the 50% discount codes are tracked by hand.

**What the web app fixes.**

- Clients see only sessions that still have seats, and the seat count updates live.
- Payment by GCash, Maya or card happens on the site, and the booking confirms itself the moment the payment goes through.
- The cancellation policy is enforced by the system: it works out the transfer, the discount code or the forfeit on its own.
- The owner changes schedules, prices, page text and users from an admin side on a phone or laptop, without touching code.

## Tech stack

One language, JavaScript, covers the client pages, the admin pages and the payment handling, and every tool below has a free tier that is enough for a school demo.

| Part | Tool | What it does for us |
| --- | --- | --- |
| Website and server code | Next.js (React) | Builds every page, client and admin. Its built-in API routes act as our backend, so we need no separate PHP server. |
| Styling | Tailwind CSS | Ready-made style classes that make the layout responsive, so the same pages work on a phone and a laptop. |
| Database | Supabase (Postgres) | Stores users, sessions, bookings, payments, vouchers and page content. |
| Login | Supabase Auth | Sign up, log in, forgot password and email verification, already built. |
| File storage | Supabase Storage | Holds the logo, page images and backup payment screenshots. |
| Payments | PayMongo (test mode) | Takes GCash, Maya and card payments, then tells our server when a payment succeeds. Test mode uses fake money. |
| Emails | Resend (or Supabase email) | Sends booking confirmations, reminders and cancellation notices. |
| Hosting | Vercel | Puts the site online for free, and redeploys each time we push code to GitHub. |

**Why this over HTML, CSS and PHP.** Supabase's official libraries and guides are written for JavaScript, so login and live seat counts work with a few lines. PayMongo's server code fits in a Next.js API route. A real launch only needs the cafe to register a live PayMongo account; the code stays the same.

**Security basics.** Supabase Row Level Security makes sure a client can only read their own bookings and profile, and only admins can change schedules, prices and content. Secret keys (PayMongo secret key, Supabase service key) live in Vercel's environment settings, never in the code.

**Timed tasks.** Next.js on Vercel only runs code when someone visits a page, and Vercel's free plan runs scheduled jobs only once a day. So timed tasks run inside Supabase with pg_cron, which is free: each night it creates the next four weeks of sessions, and it triggers a small Supabase function that sends the day-before reminder emails. The 15-minute seat hold needs no timer at all (see Booking and slot rules, rule 4).

## User roles

There are three kinds of users, and the system checks the role on every page and every database request.

| Role | Who | What they can do |
| --- | --- | --- |
| Guest | Anyone who has not logged in | View Home and About Us, see the class schedule and open seats, and use Chat With Us. Must sign up or log in to book. |
| Client | A signed-up participant | Book and pay, apply a voucher code, view and cancel their own bookings, request a transfer, edit their profile, see their payment history. |
| Admin | Cafe owner or staff | Everything on the admin side: bookings, schedules, prices, vouchers, page content, users, payments and settings. |

If the cafe later wants staff who can check in guests but not change prices, we add a separate Staff role. For the school demo, one Admin role is enough.

## Booking and slot rules

A booking holds one seat in one session, and the system never lets a session go over its capacity.

- **Weekly schedule.** The admin sets a weekly pattern: Thursday to Sunday, Session 1 at 9:00 to 9:50 AM and Session 2 at 10:15 to 11:05 AM. The system creates the actual dated sessions from that pattern, for example four weeks ahead, so nobody types dates by hand.
- **Capacity.** Each session has a capacity, 4 by default. The admin can lower it to 3, or change it for one date only.
- **One seat per booking.** Each person books their own seat, because every participant must give their own health details, non-pregnancy check and agreement. Friends who want to come together book separately, and the seats-left count shows them whether two seats are open. To book two sessions, a client makes two bookings.
- **Seat hold while paying.** When a client clicks Pay, their seat is held for 15 minutes. If payment does not succeed in that time, the seat is released for others. This needs no background timer: the seat count only includes pending bookings whose hold time has not passed yet, so an old hold stops counting by itself the moment it expires.
- **No overbooking.** The seat check and the booking happen in one database step, so two people clicking the last seat at the same moment cannot both get it.
- **Booking cutoff.** Online booking for a session stays open until 8:00 AM on the day of the class, as long as seats are left. It closes when the session is full or when it turns 8:00 AM, whichever comes first. A client booking within 12 hours of class is already inside the forfeit window, so the booking page warns them that cancelling will give no credit.
- **Closed or cancelled sessions.** The admin can close a single session (holiday, instructor sick) or a whole day. If a session with bookings is cancelled by the cafe, those clients get a free transfer, and the system emails them.
- **Required details at booking.** Full name, contact number, email, Instagram (optional), first time or not, any injuries or medical conditions, and their pick for the free upsized drink (for example Iced Matcha, Hot Spanish Latte, or Decide at the cafe). The client must also confirm they are not pregnant, and tick the Registration Agreement.
- **Price.** ₱500 per session plus ₱50 if they add mat rental. A voucher code discounts only the ₱500 class fee, never the ₱50 mat rental, so the full mat rental still goes to the stray animal donation. Prices are read from the admin settings, never written into the page.
- **Private sessions.** These stay by appointment, through the Chat With Us button, and are not part of online booking.

## Cancellation policy as system rules

When a client cancels a confirmed booking, the system measures the time left before class and applies the cafe's policy on its own. A client's cancellation is never refunded in cash; refunds happen only when the problem is on the cafe's side.

| Time before class when the client cancels | What the system does | Booking status after |
| --- | --- | --- |
| More than 24 hours | Lets the client pick another session with an open seat. The paid amount carries over, no new payment. | Transferred |
| 12 to 24 hours | Cancels the booking and creates a one-time 50% discount code for the client's next session, shown in their profile and emailed. | Cancelled with voucher |
| Less than 12 hours | Cancels the booking with no credit. The Cancel button warns the client before they confirm. | Forfeited |
| Did not show up | The admin marks the booking as no-show after class. No credit. | No-show |

**Details the group should agree on.**

- A transfer is allowed once per booking, so a booking cannot be moved forever. It keeps exactly what was paid for: if the client did not rent a mat but needs one on the new date, they pay the ₱50 in cash at the cafe counter. If they paid for a mat and no longer need it, the ₱50 stays as a donation.
- The 50% discount code expires after 60 days and works only for the client who received it. It takes 50% off the class fee only, so the next booking costs ₱250, or ₱300 with a mat.
- If no session has an open seat when the client wants a transfer, they can keep the booking or cancel under the rules above.
- The policy text is shown on the Booking page and must be ticked in the Registration Agreement before paying.

## Payment flow

PayMongo confirms each payment automatically, so staff no longer check screenshots. Manual upload stays only as a backup.

A PayMongo payment confirms the booking on its own; a manual transfer waits for an admin, who can also reject it.

**Main flow: PayMongo (GCash, Maya, card).**

- The client picks a session, adds mat rental if needed, enters a voucher code, ticks the agreement and clicks **Pay**.
- Our server works out the total from the admin prices, holds the seat for 15 minutes and creates a PayMongo checkout set to expire at the same moment as the hold, so the client cannot pay after their seat is released. The booking is now **Pending payment**.
- The client is sent to PayMongo's secure payment page and pays with GCash, Maya or card. Card numbers are typed on PayMongo's page, never on ours.
- PayMongo sends our server a message called a **webhook** saying the payment succeeded. Our server checks the message is really from PayMongo, then marks the payment **Paid** and the booking **Confirmed**.
- The client lands on a "You're booked" page and gets a confirmation email with the date, time, venue and what to bring.
- If payment fails or the 15 minutes run out, the booking becomes **Expired** and the seat opens again.

**Late payments.** If a payment still reaches our server after the hold ended, the server checks the session again. If a seat is still free, the booking is confirmed as normal. If the class has filled up, the booking is marked **Paid, needs action** and shows at the top of the admin Dashboard, so the admin can move the client to another session or arrange a refund, since the problem was on our side.

**Backup flow: manual transfer.** If PayMongo is down, or the cafe turns it off, the client sees the cafe's GCash and BPI details, pays by transfer and uploads a screenshot. The booking becomes **Awaiting verification**, the seat stays held, and the system emails the admin right away, so a fake or blank screenshot does not block a seat in a 4-person class for long. The admin approves or rejects it from the Bookings page. The admin can switch this backup on or off in Settings.

**What we store.** Only the amount, the method (GCash, Maya, card, BPI), PayMongo's payment ID, the status and the time. We never store card numbers or account digits; PayMongo keeps those.

**Test mode.** For the demo we use PayMongo's test keys, so payments use fake money and test cards. Going live means the cafe registers a business account with PayMongo and we swap in the live keys.

## Proposed system flow

This keeps the pages from our original flow and fills in what each one does. Every page has the same nav bar (Home, About Us, Book a Class, My Account) that collapses into a menu on phones, and a Chat With Us button that opens the cafe's Messenger or Instagram.

### Client side

- **Home** (open to guests)
- Hero: headline, tagline and a Book Now button that goes to the Booking page
- About the class: beginner STOTT Mat Pilates, what to expect
- Location and complimentary drink (upsized matcha or coffee, seating note)
- Feature cards: low-impact, all levels, mat rental for stray animals
- Next open sessions, showing seats left
- **About Us** (open to guests)
- The cafe and the instructor
- Venue address with a map link
- Contact: block69cafe@gmail.com, phone, Facebook and Instagram @block69cafe
- Health and safety: not for pregnant participants, tell us about injuries
- **Sign up and Log in**
- Sign up with email and password, or Google
- Forgot password by email link
- Shown when a guest clicks Book Now, then sends them back to booking
- **Booking page**
- Step 1, pick a date: a calendar or list of Thursday to Sunday dates with open seats
- Step 2, pick a session: Session 1 or Session 2, with seats left; full sessions are greyed out
- Step 3, your details: filled in from the profile, plus first time, injuries, drink choice, and the not-pregnant check
- Step 4, review: what to bring (mat, small towel, water bottle, grip socks), mat rental add-on, voucher code, total, cancellation policy and the Registration Agreement checkbox
- Step 5, pay: goes to PayMongo, then back to a confirmation page
- **My Account**
- Profile: name, email, mobile number, Instagram, birthday; change password; deactivate account
- My Bookings: upcoming (status, Cancel or Transfer button) and past bookings
- Payments: history of payments with receipts
- My Vouchers: discount codes and their expiry
- Notifications: turn email reminders on or off

### Admin side

- **Admin login**: same login page; admin accounts are sent to the Dashboard
- **Dashboard**
- Today's and this week's sessions with seats filled
- Bookings waiting for action (awaiting verification, paid but needs action, no-show to mark)
- Earnings this week and month
- Shortcuts: add schedule, view bookings, edit prices
- **Bookings**
- Table of all bookings, filter by date, session and status, search by name
- Booking details: client info, health notes, mat rental, payment
- Actions: create a walk-in booking, approve or reject a manual payment, cancel, transfer, mark attended or no-show. A walk-in booking is for a client at the counter or in DMs: the admin picks the session, types their name and contact number, confirms the health check and agreement in person, and records a cash or transfer payment. It takes a seat like any online booking
- Attendance list per session with each guest's drink choice and mat rental, so the barista can prepare drinks ahead, ready to print or view on a phone
- **Schedules**
- Weekly pattern: days, session times, default capacity
- Calendar of dated sessions: change capacity for one date, close a session or a whole day
- **Pricing and vouchers**
- Class price (₱500) and mat rental price (₱50)
- Create promo codes; view the 50% codes the system issued
- **Payments**
- List of payments with method, amount, status and PayMongo reference
- Earnings by day, week and month, with mat rental totals shown apart for the stray animal donation
- **Content (CMS)**
- Edit text and images on Home and About Us, the what-to-bring list, the policy text and the agreement text
- **Users**
- Search users, view details and booking history, deactivate or reactivate accounts, make a user an admin
- **Communications**
- Resend a booking confirmation; send a notice to everyone in a session (for example, class cancelled)
- Automatic emails: confirmation, a reminder the day before, cancellation and voucher emails
- **Settings**
- Logo, cafe name, contact details, social links
- Booking cutoff time (8:00 AM on class day), seat hold minutes, manual payment backup on or off, drink options shown at booking

## Database tables

Nine tables in Supabase hold everything the app needs. This is the plan in words; the actual tables get built in the coding step.

| Table | What one row is | Main fields |
| --- | --- | --- |
| profiles | One user | full name, email, mobile, Instagram, birthday, role (client or admin), active or deactivated |
| schedule_templates | One weekly slot pattern | weekday, start time, end time, default capacity, active |
| class_sessions | One dated class | date, start time, end time, capacity, status (open, closed, cancelled) |
| bookings | One seat for one client | client (or walk-in name and contact), session, status, mat rental yes or no, drink choice, voucher used, total, first time, health notes, agreed to terms at, seat hold expires at, transferred from |
| payments | One payment attempt | booking, provider (PayMongo, manual transfer, or cash at the counter), method (GCash, Maya, card, BPI, cash), amount, status, PayMongo reference, screenshot link (manual only), verified by, paid at |
| vouchers | One discount code | code, percent or fixed amount, owner (if personal), source (cancellation or promo), uses left, expires at |
| settings | One admin setting | key and value, such as class price, mat rental price, cutoff time, hold minutes, drink options, logo |
| site_content | One editable block of page content | page, section, title, text, image |
| email_log | One email sent | client, booking, type (confirmation, reminder, cancellation), sent at |

**Booking statuses:** Pending payment, Awaiting verification, Confirmed, Paid needs action, Expired, Transferred, Cancelled with voucher, Forfeited, No-show, Attended.

Seats left in a session = capacity minus bookings that are Pending payment (still within the hold), Awaiting verification or Confirmed.

## What changed from the original flow

| Original item | Change | Why |
| --- | --- | --- |
| Login and Sign Up as the first page | Home and About Us are open to guests; login is asked only at Book Now | Visitors can see the class before making an account |
| Billing: Payment methods (Auto-Pay) | Removed | Clients pay per class through PayMongo; nothing is charged automatically |
| Admin Billings: last 4 digits of the client's card | Removed; store only the PayMongo reference and method | Storing card details is a security and privacy risk, and PayMongo already keeps them |
| Gender and address in the profile | Removed | The class does not need them; collect less personal data |
| Instagram, first time, health notes | Added to booking | They were in the Google Form and the cafe uses them |
| Chat With Us | Links to Messenger or Instagram | A live chat system is a big build for little gain |
| Admin Bookings: Confirm or Decline | Confirmation is automatic; admin only reviews manual payments | PayMongo confirms payments itself |
| Communications: resend appointment details | Kept, plus automatic confirmation, reminder and cancellation emails | Replaces the manual email and SMS replies |
| Not in original | Pricing and vouchers page, attendance and no-show marking, booking statuses, seat hold | Needed to run the policy and stop overbooking |

## Next steps

- The group reviews this proposal and comments on anything to change.
- Step 2: design and page layouts for each page above, phone and laptop.
- Step 3: build the client side.
- Step 4: build the admin side.

Planning is done (2026-10-22). We are now building.
