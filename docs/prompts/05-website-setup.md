Please read CLAUDE.md and docs/PROGRESS.md first.

The database (Phase A) is done and pushed. We are starting **Phase B, Step 6: website setup**. Only do this step.

1. **Create the Next.js app** (latest stable version, TypeScript, App Router, Tailwind, ESLint, `src/` folder, npm) in this folder. The folder isn't empty, so create it in a temporary folder and merge it in. Keep our `package.json` script `test:db` and its devDependencies, our `.gitignore` lines, and `docs/`, `supabase/` and CLAUDE.md. Show me the merged `package.json` before installing.
2. **Design system** (CLAUDE.md section 7):
   - load Poppins (headings) and Montserrat (body) with `next/font/google`
   - add all the colors as Tailwind theme tokens in `globals.css`
   - make shared components in `src/components/ui/`: Button (primary, secondary, danger), Card, Badge (success, info, warning, error, neutral), Input with label, Select, Checkbox
3. **Layout:** the client Header (logo text, nav links, Log in button, phone menu) and Footer, matching `docs/designs/PhoneHome.html` and `PhoneMenu.html`. Add a Chat With Us link that reads `chat_url` from settings.
4. **Supabase in Next.js** with `@supabase/ssr`:
   - a browser client, a server client, and the session-refresh middleware (check the current Supabase + Next.js docs, because the file names changed in recent Next.js versions)
   - generate TypeScript types with `npx supabase gen types typescript --linked > src/types/database.ts`
   - add a `package.json` script `gen:types`
5. **Prove the connection works:** a simple Home page that calls `get_open_sessions()` and shows the next open classes with seats left from the **real** database. Read the price from `settings`, never hard-code it. Style it to match PhoneHome.html on a phone, with a wider layout on a laptop.
6. **Walk me through `.env.local`:** copy `.env.example`, and tell me exactly where in the Supabase dashboard to find each value. I'll paste the keys myself, never in chat.

Before you start, show me a short plan. Comment every file and function in plain English. Never run any git command. When it works, tell me to run `npm run dev` and what I should see at 390px and 1440px (Chrome DevTools phone view: F12, then Ctrl+Shift+M). Make sure `npm run test:db` still passes. Update docs/PROGRESS.md and suggest a commit message.
