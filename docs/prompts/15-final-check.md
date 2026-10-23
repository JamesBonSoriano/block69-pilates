Please read CLAUDE.md and docs/PROGRESS.md first. If PROGRESS.md shows this step is already half done, continue from where it stopped.

All build steps are done. We are on **Step 15: final check before the presentation**. Fix only real problems. Don't redesign anything.

1. **Gaps against CLAUDE.md section 4:** go through every client and admin page listed there and tell me in a table which ones are done, partly done or missing. Build small missing pieces only if each takes little work, for example:
   - Schedule: change the capacity of one dated class, or close a whole day
   - "Payment expired" page
   - Chat With Us button
   For anything bigger, list it as "future work" instead.
2. **Layout check at 390px and 1440px:** open every page, client and admin, as a guest, as my test client and as admin. Fix anything that overflows, overlaps, is cut off, or has buttons too small to tap. Use the browser if you can run one. Otherwise read the code carefully and list what I should look at.
3. **Plain-English messages:** every error a person can see should say what happened and what to do next. No raw database errors.
4. **Security pass:**
   - every `/admin` page and admin action checks `requireAdmin()` / `is_admin()`
   - no secret reaches the browser
   - RLS is on for every table
   - storage policies match Step 12
   - the webhook rejects bad signatures

   List anything you find, and fix the small ones.
5. **Demo data for the presentation:** write `supabase/manual-tests/demo-seed.sql` and `demo-cleanup.sql`:
   - a few bookings across the next classes (one full class, one with seats left)
   - a manual payment waiting for review
   - one `paid_needs_action`
   - a used and an unused voucher

   Use clear "DEMO" names, and make the cleanup remove only those rows. Never put real emails in the files. Use placeholders I replace in the SQL Editor.
6. **Write `docs/DEMO-SCRIPT.md`:** a 5–7 minute walkthrough in the best order to show the panel. Start with the cafe's problem, then the client flow on a phone, then paying, then the admin side, then the rules that protect the cafe (no overbooking, hold timer, cancellation policy). End with future work. Add a short "if something breaks during the demo" section (for example, use the PayMongo test card, or show the admin approving a manual payment instead).
7. **README.md:** what the project is, the tech stack, how to run it locally, the env variable names (no values), and the group members as placeholders.

Never run any git command. Comment any code you change in plain English. Keep `npm run test:db`, the type check, lint and `npm run build` passing. Update docs/PROGRESS.md and suggest a commit message.
