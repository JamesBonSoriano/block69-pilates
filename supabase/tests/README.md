# Database tests

These tests check that the booking rules in our database work: no overbooking, seat holds, the cutoff, prices, vouchers, cancel and transfer rules, admin tools, and security (who can read and change what).

They never touch our live Supabase project. Each run starts a **throwaway Postgres 17** (the same version Supabase uses) on your own computer, builds it from our migration files, runs the checks, and deletes it.

## How to run

You need Node.js. In the project folder, run this once to install the test tools:

```
npm install
```

Then run the tests whenever you like:

```
npm run test:db
```

To run only some files, add a word from their name:

```
npm run test:db -- booking
npm run test:db -- security
```

A full run takes about 15 seconds. It prints `PASS` or `FAIL` for every check, then a summary like `157/157 checks passed`. If anything fails, the last lines list what failed, and the command exits with an error code.

## What gets tested

| File | What it proves |
| --- | --- |
| `01-default-data.test.mjs` | Migration 4 adds every setting, and only the right ones are public. It adds the Thu–Sun templates, 32 classes for 4 weeks, and all the page text. Running it twice adds nothing and keeps the admin's changes. |
| `02-security.test.mjs` | 35 actions tried as a guest, client A, client B, an admin and the server key, such as reading another client's booking or changing a price. Each one is allowed or blocked exactly as planned. A client can't make themself admin. RLS is on for all 9 tables. Guests can only call `seats_left`, `get_open_sessions` and `is_admin`. |
| `03-booking.test.mjs` | **5 people book a 4-seat class at the same moment:** 4 get in and 1 is told "Sorry, this class is full." It also covers the 15-minute hold, the 8:00 AM cutoff, prices read from settings, both required ticks, drink choices, and vouchers (they discount the class fee only, never the mat). |
| `04-cancel-transfer.test.mjs` | Cancelling more than 24h before class is refused (Transfer instead). 12 to 24h gives a 50% code for 60 days. Under 12h is forfeited. A booking can be transferred only once, and only more than 24h before class. If the cafe cancels a class, the transfer is free. |
| `05-admin-account.test.mjs` | Only admins can use admin tools. A walk-in takes a seat like an online booking. Attendance can be marked, and `attended` still holds a seat. Manual payments can be approved or rejected. A client can deactivate their account but can't reactivate it. |
| `06-seed.test.mjs` | `seed.sql` loads cleanly and covers all 10 booking statuses. `WELCOME10` works, the expired code is refused, and running it twice adds nothing. |

## How it works (in simple words)

1. `run.mjs` starts Postgres 17 in a temporary folder, using the `embedded-postgres` package.
2. It adds the few Supabase parts our migrations need: the `anon`, `authenticated` and `service_role` roles, a small `auth.users` table, and `auth.uid()`. These are in `helpers.mjs`.
3. It runs every file in `supabase/migrations/` in order, the same way `npx supabase db push` does.
4. Each test file gets its **own fresh copy** of that database, so tests can't affect each other.
5. To act as someone, a test does what Supabase does for a real website request. It switches to the `anon` role (guest) or the `authenticated` role with a user id (client or admin), and then the RLS policies decide what's allowed.
6. The overbooking test opens **5 separate connections**, like 5 phones, and makes them all call `book_seat` at once. The row lock in `book_seat` makes them wait in line, so only 4 can get a seat.
7. The database clock is set to UTC (like Supabase's servers), which proves our Philippine-time rules (cutoff, 24h and 12h windows) don't depend on the server's time zone.

**Limits:** this is real Postgres running our real SQL, but not the whole of Supabase. Supabase Auth (passwords, emails) and Storage (file uploads) aren't included. We'll test those on the website itself.

## Adding a test

Add a check to the right `*.test.mjs` file, or make a new file like `07-something.test.mjs`. It's picked up automatically. Each file exports a `title` and one function that gets a toolbox `t`:

```js
// Example: a guest can see seats left for a class.
const left = await t.seatsLeft(sessionId);
t.check('Guest sees seats left', '4', left === 4, left);
```

`helpers.mjs` explains every tool: `t.as(...)`, `t.attempt(...)`, `t.book(...)`, `t.addUser(...)`, `t.sessionIn(...)` and the rest.

## About `seed.sql` (sample data) and our live project

- `seed.sql` holds **fake** clients (Bea, Carlo, Dana) and bookings in every status. It's only for testing.
- `npx supabase db push` sends **only the migrations** to the live project, never `seed.sql`. The only way the sample data gets there is `npx supabase db push --include-seed`. **Don't run that:** we have one Supabase project, and the fake bookings would take real seats on the real Home page and add fake earnings to the admin pages.
- `seed.sql` is still useful: these tests load it and check it. If someone sets up a local Supabase (`npx supabase start` with Docker), `npx supabase db reset` loads it there automatically.
- **Never run `npx supabase db reset --linked`.** It wipes the live project's database, real bookings included, and then loads the fake data.
- To get test data on the live project, make real test bookings through the website or the admin Walk-in page. You can cancel or expire them afterwards.

## If something goes wrong

- **`Cannot find module 'embedded-postgres'`**: run `npm install` first.
- **Windows asks to allow "postgres" through the firewall**: you can click Cancel. The test database only talks to your own computer.
- **Time of day doesn't matter**: the tests pass at any hour, including around midnight in Manila. The `sessionIn()` and `sessionToday()` helpers in `helpers.mjs` make sure a test class never crosses midnight in a way that would change the result.
- **`SETUP FAILED: Migration ... failed`**: a migration file has an error. The message says which file, and what went wrong.
