# 16 — Remove "Next open sessions" from the homepage

## Goal
Remove the "Next open sessions" section from the homepage (`/`).

## Context
- Next.js app running at `localhost:3000`.
- On the homepage, between the hero section and the "About the class" section, there is a **"Next open sessions"** heading with a **"See all"** link and a grid of session cards. Each card shows:
  - a date badge (e.g. `SAT 24`)
  - a time range (e.g. `10:15 – 11:05 AM`)
  - `Mindful Mat Pilates · Beginner`
  - a seats pill (e.g. `3 left` / `4 left`)

## Steps
1. Find the homepage file (likely `app/page.tsx` or `src/app/page.tsx`) and locate where the "Next open sessions" section is rendered. It may be inline JSX or a separate component — search for `Next open sessions`, `open sessions`, `upcoming`, or `left`.
2. Remove the entire section from the homepage: the heading, the "See all" link, and the card grid.
3. Remove any homepage-only code that existed just to feed this section: data fetching or queries for upcoming sessions, related state, helper functions, and now-unused imports.
4. If the session card component is a separate file, check whether anything else uses it (e.g. the Book a Class page). Only delete the component file if nothing else imports it; otherwise leave it in place.
5. Fix spacing so the hero flows cleanly into "About the class" with no leftover empty gap or orphaned wrapper/margin.
6. Run the linter and type check (`npm run lint` and `npx tsc --noEmit`) and fix any errors caused by the change.

## Do not change
- The Book a Class page or booking flow
- Database, Supabase functions, or API routes
- Any other homepage sections (hero, About the class, etc.)

## Done when
- The homepage no longer shows "Next open sessions" or its cards.
- No unused imports, dead queries, or type/lint errors remain.
- Update `docs/PROGRESS.md` with a short note about this change.
- Summarize which files were changed and what was removed.
