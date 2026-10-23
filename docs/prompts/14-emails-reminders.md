Please read CLAUDE.md (sections 4–6) and docs/PROGRESS.md first. If PROGRESS.md shows this step is already half done, continue from where it stopped.

Steps 6–13 are done and the site is live on Vercel. We are on **Phase E, Step 14: emails and timed jobs**. Only do this step. **Revisions part 3 already set up Gmail sending, `email_log`, Communications and most automatic emails. Skip anything PROGRESS.md says is done, and focus on the day-before reminder, pg_cron and the Supabase auth email settings.**

**Email sending:**
- We don't own a domain, so Resend's free plan can only send to our own address. Instead, use **Gmail SMTP with an App Password** from the project's Gmail account (with `nodemailer`, server only).
- The keys are `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM`. Tell me how to make the App Password and where to paste the keys (`.env.local` and Vercel).
- If you think another option is clearly better for a free school demo, say so in the plan first.

1. **Automatic emails** (simple branded HTML that matches the site colours, with a plain-text version):
   - booking confirmed (date, time, drink, mat, total, address, what to bring, link to My Bookings)
   - manual payment received / approved / rejected
   - booking cancelled (with the 50% code and its expiry when there is one)
   - transfer done
   - class cancelled by the cafe (with a link to transfer for free)
   - paid-needs-action (the cafe will contact you)
2. **Never send twice:** write each sent email to `email_log` (create it in a new migration if it doesn't exist) and skip a send that's already logged for the same booking and type. A failed email must never undo or block a booking or a payment. Log the error and carry on.
3. **Reminder the day before:** respect the client's `email_reminders` setting. Make a protected route `src/app/api/cron/reminders/route.ts` that checks a `CRON_SECRET` header and emails everyone with a confirmed booking tomorrow (Philippine time), once only.
4. **Timed jobs with pg_cron** (in a migration, enabling `pg_cron` and `pg_net` if needed):
   - every night, run `generate_sessions(4)` so there are always 4 weeks of classes
   - every evening at a sensible time, call the reminders route with `pg_net` and the secret
   - Keep the secret out of the migration file (for example in Supabase Vault). Tell me exactly what to set by hand in the Supabase dashboard.
5. **Communications** (admin, small page or a section on the booking details page):
   - resend the confirmation email for one booking
   - send a short notice to everyone booked in one class (for example "Class moved to the garden")
   - all of it admin-only and logged
6. **Supabase auth emails:**
   - Write in docs/PROGRESS.md the exact steps for me to set the same Gmail SMTP as Supabase's custom SMTP.
   - Then switch the Reset password and Confirm signup templates to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` and `&type=email`.
   - Then turn **Confirm email** back ON.
   - Make sure `/auth/confirm` handles both kinds of link.

Tests: database tests for any new function or table (including "a client can't do this") and a unit test that the reminder route refuses a missing or wrong secret.

Remember the Step 7 rule. Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. Keep `npm run test:db`, the type check, lint and `npm run build` passing. When it works, give me a checklist to test each email (use my test client account), save any setup SQL in `supabase/manual-tests/`, update docs/PROGRESS.md and suggest a commit message.
