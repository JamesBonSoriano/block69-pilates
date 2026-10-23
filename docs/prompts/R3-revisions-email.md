Please read CLAUDE.md and docs/PROGRESS.md first. If PROGRESS.md shows this part is already half done, continue from where it stopped.

Revisions parts 1 and 2 are done. This is **Revisions part 3 of 3: everything that sends an email**, from the attached **revisions.pdf**. Only do this part. Day-before reminders and pg_cron stay in Step 14.

**Email sending (set this up first):**
- We don't own a domain, and Supabase's built-in email only reaches our own team, so use **Gmail SMTP with an App Password** from the project's Gmail account, through `nodemailer` (server only).
- The keys are `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM`. Tell me how to make the App Password and where to paste them. I'll paste the values myself.
- Auth links (password reset, email change) are made with the Supabase admin API (`generateLink`) on the server and sent through our own mailer, so we don't depend on Supabase's email limits.
- Add an `email_log` table (new migration, admin-read only) that records every email sent: to whom, type, booking or payment, and when. A failed email must never undo or block a booking or payment. Log the error and show a plain message.
- Make a simple branded HTML email layout in our colours, with a plain-text version.

**Wire up the buttons left as "Coming soon" in part 2:**
1. **Send receipt again** (admin receipt page): emails the receipt to the client.
2. **Send password reset link** (Manage Users, one user): emails the client a link to set a new password, which opens our `/auth/confirm` and reset page. Clients no longer have Change password in their profile, so this and "Forgot password" are the only ways.
3. **Change email** (Manage Users, one user): the admin types the new email, and the client gets a **verification link at the new address**. The email changes only after they click it. Show "Waiting for the client to confirm" until then.
4. **Communications** inside one user (Figma `241-2287`): send that client a short message by email. Also resend the confirmation for one of their bookings. Everything is logged and shown in that user's history.

**Automatic emails** (one each, never sent twice for the same booking and type, checked through `email_log`):
- booking confirmed (online payment, manual approval, or walk-in)
- manual payment rejected
- cancelled with a 50% code
- transfer done
- class cancelled by the cafe

Each should also appear in the client's in-app notifications from part 1.

Tests:
- database tests for `email_log` (a client can't read it)
- unit tests for the mailer that don't send real email, for example by checking the message that would be sent
- a test that only admins can trigger the user and receipt emails

Remember the Step 7 rule. Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. Keep `npm run test:db`, the type check, lint and `npm run build` passing. When it works, give me a checklist to test each email with my test client account, update docs/PROGRESS.md and suggest a commit message.
