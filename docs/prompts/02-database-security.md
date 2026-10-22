Please read CLAUDE.md and docs/PROGRESS.md first.

We are on **Phase A (database), Step 3: security (RLS policies)**. Only do this step. The tables already exist in Supabase (migration 20261022000001_tables.sql).

1. Write a new migration in `supabase/migrations/` that adds:
   - an `is_admin()` helper function that checks the logged-in user's role in `profiles` (use `security definer` and a safe `search_path`, so policies don't loop on themselves)
   - RLS policies for every table, following CLAUDE.md:
     - **profiles:** a user can read and update only their own row and can never change their own `role` or `is_active`. Admins can read and update everyone.
     - **schedule_templates, settings, site_content:** anyone, including guests, can read them (the website needs prices, drink options and page text). Only admins can insert, update or delete. If any setting is private, keep it admin-only.
     - **class_sessions:** anyone can read them. Only admins can change them.
     - **bookings:** a client can read only their own bookings. Clients must **not** insert or update bookings directly, because that will happen through database functions in the next step. Admins can do everything.
     - **payments:** a client can read only payments for their own bookings. Only admins (and later the server, using the service role) can change them.
     - **vouchers:** a client can read only their own personal vouchers. Promo codes are checked through a function later, not listed publicly. Admins can do everything.
     - **email_log:** admins only.
2. Before pushing, test the policies on the throwaway local Postgres again. Act as a guest, as client A, as client B and as an admin, and show me a small table of what each one can and can't do.
3. Tell me when to run `npx supabase db push`, and how to check the policies in the dashboard (Authentication → Policies).

Explain each policy in plain English in the SQL comments. Never run any git command. When you're done, update docs/PROGRESS.md and suggest a commit message.
