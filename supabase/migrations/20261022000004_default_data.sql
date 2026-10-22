-- =============================================================================
-- Migration 4: the default data the REAL website needs to work.
--
-- What this file does:
--   1. Adds the default settings (prices, cutoff, hold minutes, drink options,
--      cafe contact details, GCash/BPI details...) and marks which ones anyone
--      may read (is_public = true) and which are for admins only (false).
--   2. Adds the weekly class pattern: Thursday to Sunday, Session 1 (9:00-9:50)
--      and Session 2 (10:15-11:05), 4 seats each.
--   3. Adds the starter page text for Home, About Us, the what-to-bring list,
--      the cancellation policy and the Registration Agreement.
--   4. Creates the dated classes for the next 4 weeks (generate_sessions(4)).
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- It's a migration (not seed.sql) because the live site needs this data too.
-- Test-only sample data (fake bookings etc.) is in supabase/seed.sql instead.
--
-- SAFE TO RUN TWICE: every insert uses "on conflict ... do nothing", so a row
-- that already exists is skipped, never duplicated. It also means this file
-- never overwrites something the admin has since changed (for example a new
-- price or edited page text).
--
-- PLACEHOLDERS: values in [SQUARE BRACKETS], like [GCASH NUMBER], are not real.
-- The admin replaces them on the Settings / Content pages (or in Table Editor).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. SETTINGS
-- Each value is JSON: numbers are plain (500), text is in double quotes
-- ('"08:00"'), true/false are plain, and lists use [ ... ].
-- is_public = true  -> guests and clients can read it (the website shows it).
-- is_public = false -> admins only.
-- -----------------------------------------------------------------------------
insert into public.settings (key, value, is_public) values
  -- PUBLIC: prices. book_seat() reads these; the website never hard-codes them.
  -- Class fee in pesos (includes the upsized matcha or coffee).
  ('class_price',            '500', true),
  -- Mat rental in pesos (all of it is donated to feed stray animals).
  ('mat_price',              '50', true),

  -- PUBLIC: booking rules.
  -- Online booking closes at this time (Philippine time) on class day.
  ('cutoff_time',            '"08:00"', true),
  -- How many minutes a seat is held while the client pays.
  ('hold_minutes',           '15', true),
  -- The free drink choices shown in booking step 2 (book_seat checks against this list).
  ('drink_options',          '["Iced Matcha", "Hot Matcha", "Iced Spanish Latte", "Hot Spanish Latte", "Americano", "Decide at the cafe"]', true),
  -- true = show the manual GCash/BPI transfer backup to clients.
  ('manual_payment_enabled', 'true', true),

  -- PUBLIC: cafe details (header, footer, About Us).
  ('cafe_name',              '"Block 69 Cafe"', true),
  ('cafe_address',           '"444 Kamagong St., Comembo, Taguig City"', true),
  ('cafe_email',             '"block69cafe@gmail.com"', true),
  -- Contact number shown on About Us.
  ('cafe_phone',             '"[CAFE PHONE NUMBER]"', true),
  -- Google Maps link for the address (About Us "map link").
  ('maps_url',               '"https://www.google.com/maps/search/?api=1&query=444+Kamagong+St.,+Comembo,+Taguig+City"', true),
  -- Where the uploaded logo is saved in Supabase Storage. null = no logo yet
  -- (the header then shows the cafe name as text).
  ('logo_path',              'null', true),

  -- PUBLIC: social links and the "Chat With Us" button (Messenger link).
  ('instagram_url',          '"https://www.instagram.com/block69cafe"', true),
  ('facebook_url',           '"https://www.facebook.com/block69cafe"', true),
  ('chat_url',               '"https://m.me/block69cafe"', true),

  -- PUBLIC: account details shown on the Manual transfer page, so clients can
  -- pay the CAFE. (This is the cafe's own account. We never store clients'
  -- card or bank numbers.)
  ('gcash_name',             '"[GCASH ACCOUNT NAME]"', true),
  ('gcash_number',           '"[GCASH NUMBER]"', true),
  ('bpi_account_name',       '"[BPI ACCOUNT NAME]"', true),
  ('bpi_account_number',     '"[BPI ACCOUNT NUMBER]"', true),

  -- PRIVATE (admins only):
  -- Where "needs action" alert emails go (new transfer screenshot, late
  -- payment). Used when we build emails in Phase E.
  ('admin_alert_email',      '"block69cafe@gmail.com"', false),
  -- How many weeks ahead the nightly job creates classes. Used by the pg_cron
  -- job in Phase E (it calls generate_sessions with this number).
  ('sessions_weeks_ahead',   '4', false)
-- Already there (from an earlier run, or the admin changed it)? Leave it alone.
on conflict (key) do nothing;


-- -----------------------------------------------------------------------------
-- 2. WEEKLY CLASS PATTERN (schedule_templates)
-- Weekday numbers: 0 = Sunday, 4 = Thursday, 5 = Friday, 6 = Saturday.
-- Each day has Session 1 (9:00-9:50 AM) and Session 2 (10:15-11:05 AM), 4 seats.
-- -----------------------------------------------------------------------------
insert into public.schedule_templates (weekday, start_time, end_time, default_capacity) values
  -- Thursday
  (4, '09:00', '09:50', 4),
  (4, '10:15', '11:05', 4),
  -- Friday
  (5, '09:00', '09:50', 4),
  (5, '10:15', '11:05', 4),
  -- Saturday
  (6, '09:00', '09:50', 4),
  (6, '10:15', '11:05', 4),
  -- Sunday
  (0, '09:00', '09:50', 4),
  (0, '10:15', '11:05', 4)
-- Same day + start time already there? Skip it (unique rule from migration 1).
on conflict (weekday, start_time) do nothing;


-- -----------------------------------------------------------------------------
-- 3. STARTER PAGE TEXT (site_content)
-- One row = one block of a page, found by (page, section). The admin edits
-- these on the Content Management page.
-- LIST FORMAT: for blocks that are lists (what to bring, policy, agreement,
-- health notes), each line of "body" is one list item. The website splits
-- the text on new lines.
-- Prices are NOT written in this text on purpose: the pages show prices from
-- settings, so changing a price never leaves old numbers in the page text.
-- ('' inside the text is how SQL writes one apostrophe, e.g. don''t = don't.)
-- -----------------------------------------------------------------------------
insert into public.site_content (page, section, title, body) values

  -- ===== HOME =====
  -- Big banner at the top, with the Book Now button.
  ('home', 'hero',
   'Move slow, then sip something good.',
   'A 50-minute beginner STOTT mat class in the cafe, with an upsized matcha or coffee after. Small groups of 4.'),

  -- "About the class" section.
  ('home', 'about_class',
   'About the class',
   'Mindful Mat Pilates is a beginner class using the STOTT method. Expect slow, controlled moves on the mat that build core strength, posture and flexibility. No experience needed: the instructor guides every move and gives easier options.'),

  -- Location and the free drink.
  ('home', 'location_drink',
   'Pilates in the cafe, drink on us',
   'Classes are held inside Block 69 Cafe in Comembo, Taguig. Every class comes with an upsized matcha or coffee, so stay after class and enjoy it with us.'),

  -- The three feature cards.
  ('home', 'feature_1',
   'Low-impact',
   'Gentle on your joints, and still a real workout for your core.'),
  ('home', 'feature_2',
   'All levels',
   'Made for beginners. The instructor shows easier and harder options for every move.'),
  ('home', 'feature_3',
   'Mat rental for strays',
   'Rent a mat when you book. All of the mat rental fee goes to feeding stray animals.'),

  -- Short health note under the class info.
  ('home', 'health_note',
   null,
   'Not suitable for pregnant participants. Please tell the coach about any injury.'),

  -- ===== ABOUT US =====
  -- The cafe.
  ('about', 'cafe',
   'About Block 69 Cafe',
   'Block 69 Cafe is a coffee shop in Comembo, Taguig City. From Thursday to Sunday mornings, part of the cafe becomes a small studio for beginner Mindful Mat Pilates, with your drink ready after class.'),

  -- The instructor (placeholder: the cafe fills in the real name and bio).
  ('about', 'instructor',
   'Your instructor',
   '[INSTRUCTOR NAME] teaches our beginner mat classes using the STOTT method. [Add a short bio here: training, years teaching, and what a first class feels like.]'),

  -- Visiting (the address and map link come from settings).
  ('about', 'visit',
   'Visit us',
   'Arrive 10 minutes early in comfortable clothes. Classes are held inside the cafe.'),

  -- Contact (email, phone and social links come from settings).
  ('about', 'contact',
   'Contact us',
   'Have a question, or want a private session? Private sessions are by appointment: message us with the Chat With Us button, or send us an email.'),

  -- Health and safety (a list: one item per line).
  ('about', 'health_safety',
   'Health and safety',
   'This class is not suitable for pregnant participants.
Tell us about any injuries or medical conditions when you book, so the instructor can adjust the moves for you.
If you feel pain or dizziness during class, stop and tell the instructor.'),

  -- ===== BOOKING (step 3) =====
  -- What to bring (a list: one item per line).
  ('booking', 'what_to_bring',
   'What to bring',
   'Mat (or rent one when you book)
Small towel
Water bottle
Grip socks'),

  -- Cancellation policy (a list: one item per line). Matches the rules the
  -- database enforces in cancel_my_booking() and transfer_my_booking().
  ('booking', 'cancellation_policy',
   'Cancellation policy',
   'More than 24 hours before class: you can move your booking to another open class once, at no extra cost.
12 to 24 hours before class: your booking is cancelled and you get a one-time 50% code for the class fee, valid for 60 days.
Less than 12 hours before class: your booking is cancelled with no credit.
If you don''t show up, there is no credit.
If you move your booking and now need a mat, please pay the mat rental in cash at the cafe.
There are no cash refunds, unless the problem is on the cafe''s side. If the cafe cancels a class, you can move to another class for free.'),

  -- Registration Agreement: the client ticks this before paying (a list: one
  -- item per line). DRAFT wording: the cafe should review it.
  ('booking', 'agreement',
   'Registration Agreement',
   'I confirm that I am not pregnant.
I have told Block 69 Cafe about any injuries or medical conditions, and I join the class at my own risk.
I will follow the instructor''s guidance, and I will stop and tell the instructor if I feel pain or discomfort.
I have read and accept the cancellation policy.
Block 69 Cafe may contact me by email or phone about my booking.'),

  -- ===== FOOTER (every client page) =====
  ('footer', 'strays_note',
   null,
   'Every mat rental fee goes to feeding stray animals in Comembo.')

-- This page block already there (maybe edited by the admin)? Leave it alone.
on conflict (page, section) do nothing;


-- -----------------------------------------------------------------------------
-- 4. THE FIRST 4 WEEKS OF CLASSES
-- Uses the templates above to create dated classes from today (Philippine
-- time) for 4 weeks: 16 days (Thu-Sun) x 2 sessions = 32 classes.
-- generate_sessions() skips classes that already exist, so running this again
-- adds nothing new. (No one is logged in while a migration runs, so the
-- function treats it like trusted server code.)
-- Later, the nightly pg_cron job (Phase E) keeps adding weeks automatically.
-- -----------------------------------------------------------------------------
select public.generate_sessions(4);
