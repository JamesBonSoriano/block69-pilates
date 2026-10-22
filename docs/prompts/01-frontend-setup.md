Please read CLAUDE.md, docs/PROGRESS.md and docs/PROPOSAL.md first.

We are starting **Phase A (front end with mock data), Step 1: setup**. Only do this step.

1. Create the Next.js app in this folder (TypeScript, App Router, Tailwind, ESLint, `src/` folder, npm). Keep CLAUDE.md and docs/. If create-next-app refuses because the folder isn't empty, create it in a temporary folder and move the files in.
2. Set up the design system from CLAUDE.md section 7: Poppins + Montserrat with next/font, and the brand colors as Tailwind theme tokens in globals.css.
3. Make the shared components: Button (primary, secondary, danger), Card, Badge (success, info, warning, error, neutral), Input with label, Header (with the phone menu), Footer.
4. Make the types in `src/types/` for the tables in CLAUDE.md section 6, mock data in `src/lib/mock/` (about 2 weeks of Thu–Sun sessions with some seats taken), and data functions in `src/lib/data/`, for example `getOpenSessions()`. Put the seats-left rule in `src/lib/booking-rules.ts`.
5. Build the Home page to match docs/designs/PhoneHome.html on a phone, and a matching wider layout on a laptop. Show "Next open sessions" from the mock data.

Before you start, show me a short plan. Remember: comment every file and function in plain English, and never run any git command. When you're done, update docs/PROGRESS.md, tell me how to run it (`npm run dev`), what I should see at 390px and 1440px, and suggest a commit message.
