Please read CLAUDE.md, docs/PROGRESS.md and docs/PROPOSAL.md first.

We are starting **Phase A (database), Steps 1 and 2: Supabase setup and tables**. Only do these steps. No website code yet.

I already made a Supabase project. I'll give you the project ref and keys when you ask. Never write keys into any file except `.env.local`.

1. Set up the Supabase CLI in this folder with `npx supabase init`, then link it to my project. Walk me through `npx supabase login` and linking step by step, because I've never done it. Make `.env.example` (key names only) and make sure `.env.local` is in `.gitignore`.
2. Write the first migration in `supabase/migrations/` with all the tables from CLAUDE.md section 6:
   - proper types, defaults, foreign keys, `created_at`/`updated_at`, and indexes on the columns we filter by
   - Postgres enums (or check constraints) for roles, session status, all 10 booking statuses, payment provider, method and status, and voucher source
   - checks, for example capacity > 0 and money amounts >= 0, and a booking must have either a user or a walk-in name
   - a trigger that creates a `profiles` row automatically when someone signs up in Supabase Auth
3. Don't add RLS policies or booking functions yet. Those are the next step. But do turn RLS **on** for every table, so nothing is open by accident.
4. Push the migration to my Supabase project and show me how to check the tables in the Supabase dashboard (Table Editor).

Before you start, show me a short plan and a simple diagram (text is fine) of how the tables connect. Comment every table and column in the SQL in plain English. Never run any git command. When you're done, update docs/PROGRESS.md and suggest a commit message.
