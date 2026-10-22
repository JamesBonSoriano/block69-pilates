-- =============================================================================
-- Migration 5: extra page text for the full Home, About Us and Policies pages
-- (Phase C, Step 8).
--
-- What this file does:
--   Adds the site_content blocks that migration 4 didn't have yet:
--   - Home: the small line above the big title, "What's included", "How it
--     works" (3 steps) and the call to action at the bottom.
--   - About Us: the instructor's name, about the class, the schedule note,
--     the cancellation policy in short, and the FAQ (one row per question).
--   - Policies: the short intro at the top of the Policies page.
--   (The policy itself and the Registration Agreement are already in
--   migration 4 as booking/cancellation_policy and booking/agreement. Home
--   reuses booking/what_to_bring, so each text lives in only one place.)
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The pages read these rows with getPageContent() (src/lib/data/content.ts).
--
-- SAFE TO RUN TWICE: every insert uses "on conflict ... do nothing", so a row
-- that already exists is skipped. It never overwrites text the admin edited.
--
-- PRICES AND SETTINGS IN THE TEXT: page text never has a peso amount typed in.
-- Instead it can use these "fill-in" words, which the website swaps for the
-- current value from the settings table when it shows the page
-- (fillSettings() in src/lib/content-text.ts):
--   {class_price}  e.g. 500 pesos   {mat_price}     e.g. 50 pesos
-- (No peso sign in this file on purpose: the test database on Windows can't
-- read it, even in a comment. The website adds the sign itself.)
--   {cutoff_time}  e.g. 8:00 AM     {hold_minutes}  e.g. 15
--   {cafe_name}    e.g. Block 69 Cafe
-- So when the admin changes a price, every page shows the new one at once.
--
-- LIST FORMAT (same as migration 4): for list blocks, each line of "body" is
-- one item. For normal text blocks, each line is one paragraph.
--
-- PLACEHOLDERS: text in [SQUARE BRACKETS] is not real yet. The website shows
-- it with a dashed outline so it's easy to spot, until the admin replaces it.
-- ('' inside the text is how SQL writes one apostrophe, e.g. you''re = you're.)
-- =============================================================================

insert into public.site_content (page, section, title, body) values

  -- ===== HOME =====
  -- The small capital-letter line above the big hero title. The page adds the
  -- class days after it from the weekly schedule, e.g. "· Thu to Sun".
  ('home', 'hero_kicker',
   'Mindful Mat Pilates',
   null),

  -- "What's included" card (a list: one item per line). The class price is
  -- shown big at the top of the card, from settings.
  ('home', 'included',
   'What''s included',
   'A 50-minute beginner mat class (STOTT method)
An upsized matcha or coffee after class
A small group, so the instructor can help everyone
Optional mat rental, +{mat_price}, all donated to feed stray animals'),

  -- "How it works" heading, then the three numbered steps.
  ('home', 'how_it_works',
   'How it works',
   'Booking takes a few minutes.'),
  ('home', 'step_1',
   'Pick a class',
   'Choose an open class. Seats left update live, and full classes are greyed out.'),
  ('home', 'step_2',
   'Pay online',
   'Pay {class_price} with GCash, Maya or card. We hold your seat for {hold_minutes} minutes while you pay.'),
  ('home', 'step_3',
   'Show up and sip',
   'Arrive 10 minutes early with your mat (or rent one). Your upsized drink is ready after class.'),

  -- The call to action at the bottom of Home (with Book and Chat buttons).
  ('home', 'cta',
   'Ready for your first class?',
   'Book a seat online in a few minutes. Have a question first? Message us with Chat With Us.'),

  -- ===== ABOUT US =====
  -- The instructor's name (title) and a short line under it (body).
  -- The bio itself is about/instructor from migration 4.
  -- PLACEHOLDER: the cafe fills in the real name.
  ('about', 'instructor_name',
   '[INSTRUCTOR NAME]',
   '[Short title, e.g. STOTT-trained mat Pilates instructor]'),

  -- About the class (one paragraph per line). The page also shows the class
  -- length, group size, days and price as small facts, worked out from the
  -- schedule and settings, so they never go out of date.
  ('about', 'class',
   'About the class',
   'Mindful Mat Pilates is a beginner class using the STOTT method: a safe, modern way of teaching Pilates that focuses on breathing, posture and a strong core.
Each class is 50 minutes on the mat. Groups are small, so the instructor can watch your form and show you easier or harder options. No experience needed.'),

  -- Schedule note. The days and times themselves come from schedule_templates.
  ('about', 'schedule',
   'Class schedule',
   'Classes run every week. Online booking closes at {cutoff_time} on class day, or when the class is full. Private sessions are by appointment through Chat With Us.'),

  -- The cancellation policy in short (a list: one item per line). The full
  -- policy is on the Policies page (booking/cancellation_policy). Matches the
  -- rules the database enforces in cancel_my_booking() / transfer_my_booking().
  ('about', 'policy_summary',
   'Cancelling or moving a class',
   'More than 24 hours before class: move to another open class once, for free.
12 to 24 hours before class: get a 50% code for your next class, valid for 60 days.
Less than 12 hours before class, or not showing up: no credit.'),

  -- FAQ: one row per question (title = question, body = answer).
  -- The page shows every "faq_<number>" row in number order, so the admin can
  -- add faq_8, faq_9 ... later.
  ('about', 'faq_1',
   'I''ve never done Pilates. Can I join?',
   'Yes. The class is made for beginners. The instructor explains every move and gives easier options.'),
  ('about', 'faq_2',
   'Do I need my own mat?',
   'You can bring your own, or rent one for {mat_price} when you book. All of the rental fee goes to feeding stray animals.'),
  ('about', 'faq_3',
   'Can I book for a friend?',
   'Each booking is one seat for one person. Your friend books their own seat with their own account.'),
  ('about', 'faq_4',
   'How do I pay?',
   'Online with GCash, Maya or card. We hold your seat for {hold_minutes} minutes while you pay.'),
  ('about', 'faq_5',
   'When does booking close?',
   'Online booking closes at {cutoff_time} on class day, or as soon as the class is full.'),
  ('about', 'faq_6',
   'Can I join if I''m pregnant?',
   'Sorry, this class is not suitable for pregnant participants.'),
  ('about', 'faq_7',
   'Do you offer private sessions?',
   'Yes, by appointment. Message us with the Chat With Us button to set a time.'),

  -- ===== POLICIES =====
  -- The heading and intro at the top of the Policies page.
  ('policies', 'intro',
   'Policies',
   'Please read these before you book. When you book a class, you agree to the cancellation policy and the Registration Agreement below.')

-- This page block already there (maybe edited by the admin)? Leave it alone.
on conflict (page, section) do nothing;
