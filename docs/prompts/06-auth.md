Please read CLAUDE.md and docs/PROGRESS.md first.

Step 6 (website setup) is done. We are on **Phase B, Step 7: log in, sign up and accounts**. Only do this step.

1. **Pages** (match `docs/designs/PhoneLogin.html`, same style for the others):
   - `/login`: email + password
   - `/signup`: full name, phone number, email, password. The `handle_new_user` trigger already creates the profile row, so pass name and phone as sign-up metadata and check the trigger saves them.
   - `/forgot-password` and `/reset-password`
   - the route Supabase sends email links to (for example `/auth/confirm`), following the current `@supabase/ssr` docs for Next.js 16
   - a Log out button
2. **Header:** show "Log in" when logged out. When logged in, show "My Account" and Log out, plus an "Admin" link only for admins.
3. **Protect pages** (in `proxy.ts` and again on the server inside each page, never only in the browser):
   - `/account/*` needs a logged-in user, otherwise go to `/login?next=...`
   - `/admin/*` needs `is_admin()`. A client trying it gets sent home, not an error page.
   - after log in, go back to `next`, but only if it's a path on our own site (starts with a single `/`), so nobody can use our login page to send people to another website
   - a deactivated account (`is_active = false`) is logged out with a clear message
4. **Errors in plain English:** wrong password, email already used, weak password, too many tries. Never say whether an email exists on the forgot-password page.
5. **A small `/account` placeholder page** showing the user's name and email, so we can test. The real My Bookings pages are Step 10.
6. **Supabase dashboard settings:** walk me through what I must set by hand:
   - Authentication → URL Configuration (Site URL `http://localhost:3000` for now and the redirect URLs, Vercel is added later)
   - whether "Confirm email" should be on. Supabase's built-in email sender only allows a few emails per hour, so explain the trade-off and recommend what to do until we set up our own email sender in Phase E.
   - the email templates, if the link format needs changing for `/auth/confirm`

Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. Never print or log keys. Keep `npm run test:db`, the type check, lint and `npm run build` passing.

When it works, give me a test checklist I can click through at 390px and 1440px: sign up a new test user, log out, log in, wrong password, forgot password, open `/account` while logged out, open `/admin` as the test client, then open `/admin` as my admin account. Update docs/PROGRESS.md and suggest a commit message.
