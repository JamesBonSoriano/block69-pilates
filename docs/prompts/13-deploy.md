Please read CLAUDE.md and docs/PROGRESS.md first. If PROGRESS.md shows this step is already half done, continue from where it stopped.

Steps 6–12 are done. We are on **Step 13: get the site ready for Vercel**. Only do this step. I will do the Vercel, Supabase and PayMongo dashboard clicks myself, so your job is to make the code deploy-ready and write me exact instructions.

1. **Deploy check:**
   - Run `npm run build` and fix any warnings that would break on Vercel.
   - Search the code for hard-coded `localhost` or `127.0.0.1` URLs. Links in redirects, PayMongo `success_url`/`cancel_url` and auth emails must come from `NEXT_PUBLIC_SITE_URL` (or the request's own origin where that is safer).
   - Make sure no secret is used in a client component or in any `NEXT_PUBLIC_` variable.
2. **Environment list:** list every environment variable the site needs, which ones are secret, and which ones must be different on Vercel (for example `NEXT_PUBLIC_SITE_URL`). Make sure `.env.example` has all the names and no values.
3. **Security headers:** add sensible headers in `next.config` (no framing of the site, nosniff, a referrer policy), as long as they don't break PayMongo's redirect or Supabase images.
4. **Webhook:** confirm the webhook route works on Vercel. It needs the raw body, Node.js runtime (not edge) if the signature check needs it, and no caching. Tell me the exact webhook URL to register in PayMongo and which event to tick.
5. **Write `docs/DEPLOY.md`** in plain English for someone who has never used Vercel. It should cover:
   - importing the GitHub repo on vercel.com, and which branch Vercel will deploy
   - pasting each environment variable
   - adding the Vercel URL to Supabase (Authentication → URL Configuration: Site URL and Redirect URLs)
   - creating the PayMongo test webhook and pasting its secret into Vercel, then redeploying
   - how to redeploy after a change, and how to read the Vercel logs if a page errors
6. **After-deploy checklist:** a short list of what to click on the live site (phone and laptop) to prove it works: sign up, book, pay with a test card, see the webhook confirm it, admin pages, and the admin approving a manual payment.

Never run any git command and never run `vercel` deploy commands yourself. Comment any code you change in plain English. Keep `npm run test:db`, the type check, lint and `npm run build` passing. Update docs/PROGRESS.md and suggest a commit message.
