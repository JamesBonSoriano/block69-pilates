Please read CLAUDE.md and docs/PROGRESS.md first.

We are on **Phase A (database), Step 5: starting data and permanent tests**. This is the last database step. Only do this step.

0. Small fix first: update CLAUDE.md section 5 ("Seats left") so it also counts `attended` bookings, matching what you built in the functions migration.

1. **Data the real site needs** goes in a new **migration**, not in seed.sql, so it exists on the live project:
   - default `settings`, using `is_public` correctly. Public: class price 500, mat price 50, cutoff 08:00, hold minutes 15, drink options (Iced Matcha, Hot Matcha, Iced Spanish Latte, Hot Spanish Latte, Americano, Decide at the cafe), manual payment on/off (default on), cafe name, address, email, Instagram and Facebook links, GCash name and number, and BPI account name and number (use clear placeholders like `[GCASH NUMBER]` that the admin will edit). Private: anything only admins need.
   - the Thu–Sun `schedule_templates` for Session 1 (9:00–9:50) and Session 2 (10:15–11:05), capacity 4
   - starter `site_content` rows for Home and About Us, the what-to-bring list, the cancellation policy text and the Registration Agreement text, taken from docs/PROPOSAL.md
   - run `generate_sessions(4)` once so there are classes for the next 4 weeks
   - make it safe to run twice (no duplicates)
2. **Sample data for testing only** goes in `supabase/seed.sql`: a few sample bookings in different statuses, a promo code `WELCOME10` (10% off), and one expired voucher. Explain to me whether and how this gets onto the online project, and recommend whether we should push it, given we only have one Supabase project.
3. **My admin account:** walk me through it. I sign up a user in the dashboard (Authentication → Add user, auto-confirm), then give me the one SQL line to paste in the SQL Editor that makes that email an admin. Never put my email or password in a file.
4. **Permanent tests:** move the important checks from your scratchpad tests into the project at `supabase/tests/` (for example with a `package.json` script `npm run test:db` that starts the throwaway Postgres, applies all migrations and runs the checks). Include the 5-people-for-4-seats overbooking test. Add a short `supabase/tests/README.md` explaining how to run them. Our panel may ask how we tested, so this matters.
5. Run the tests, show me the results, then tell me to run `npx supabase db push`, and how to check the data in Table Editor.

Comment everything in plain English. Never run any git command. Update docs/PROGRESS.md: Phase A is complete, and next is Phase B (website setup). Suggest a commit message.
