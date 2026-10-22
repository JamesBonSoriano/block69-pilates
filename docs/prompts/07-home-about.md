Please read CLAUDE.md and docs/PROGRESS.md first.

Steps 6 (setup) and 7 (login) are done. We are on **Phase C, Step 8: Home and About Us, fully filled in**. Only do this step. Don't build the booking flow yet (that's Step 9).

1. **Home page** (finish it, matching `docs/designs/PhoneHome.html` on phones and the same style, wider, on laptops):
   - all the content blocks from the design: hero, next open sessions (already live, keep seats uncached), what's included (class + upsized drink, mat rental ₱50 donated to stray animals), how it works (pick a class, pay, show up), what to bring, the health note (not suitable for pregnant participants), location with the address and a Google Maps link, and a call to action
   - all text comes from `site_content` and all prices/links from `settings`, so the admin can change them later. Nothing about prices, times or policies is typed straight into the page.
2. **About Us page** (`/about`), same style: about the cafe, about the class (beginner STOTT mat Pilates, 50 minutes, small groups), the instructor (name and bio from `site_content`, with a clear placeholder until we have them), schedule (Thu–Sun, both session times, from `schedule_templates`), the cancellation policy in plain words, and a short FAQ.
3. **Policies page** (`/policies`): the full cancellation policy and the Registration Agreement text from `site_content`. Link it from the footer. Step 9 will link to it from the booking form.
4. **Photos:** we don't have real photos yet. Make image spots that read an image path from `site_content` and show the current brown gradient box when it's empty. Use `next/image`. Tell me where to put photos later (for example a Supabase Storage bucket the admin can upload to in Step 11, or `public/images/` for now) and recommend one.
5. **Small finishing touches:** page titles and descriptions for each page (for Google and link previews), a styled "page not found" page, and working header links for Home, About Us and Policies.
6. If any `site_content` rows are missing for this, add them in a **new migration** (safe to run twice) and tell me to run `npx supabase db push`.

Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. Keep `npm run test:db`, the type check, lint and `npm run build` passing.

When it works, tell me what I should see at 390px and 1440px on Home, About Us, Policies and a made-up page like `/xyz`. Update docs/PROGRESS.md and suggest a commit message.
