-- =============================================================================
-- Migration 13: Change 17, Part D - the new Home page text
-- (docs/prompts/17-client-revisions-2.md).
--
-- What this file does (site_content, page 'home'):
--   1. HERO: the new headline "Mat Pilates For Beginners" and the new
--      description from the proposal. Each one is only changed if it still
--      has migration 4's original text, so an admin's edits are kept.
--   2. NEW BLOCK home/class_details "Class Details & Location": a short
--      description of the class. It replaces the old "About the class"
--      section, its three feature cards, and the old location block. Its text
--      is copied from the CURRENT home/about_class text (so admin edits carry
--      over), and its photo from the current home/location_drink photo. The
--      page adds the full address and the Google Maps button from settings,
--      so they are shown only once.
--   3. NEW BLOCK home/mat_note: "Don't have a mat? Add mat rental to your
--      booking." (shown in the Class Details & Location section).
--   4. NEW BLOCK home/health_safety "Health and Safety Information": the
--      section near the bottom of Home. Its list is copied from the CURRENT
--      about/health_safety text (Health and Safety moves from About Us to
--      Home in Part E), so admin edits carry over.
--
-- The old blocks (home/about_class, home/feature_1-3, home/location_drink,
-- home/health_note) are NOT deleted, as agreed: the Home page just stops
-- showing them, and the admin Content page hides them.
--
-- SAFE TO RUN TWICE: the updates only touch untouched text, and the inserts
-- use "on conflict ... do nothing", so an existing block is never overwritten.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The Home page (src/app/(client)/page.tsx) reads these rows.
-- Tests: supabase/tests/16-r2-content.test.mjs.
-- (No peso sign in this file on purpose: the test database on Windows can't
-- read it, even in a comment.)
-- ('' inside the text is how SQL writes one apostrophe, e.g. Don''t = Don't.)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Hero: headline and description (only if never edited)
-- -----------------------------------------------------------------------------
update public.site_content
set title = 'Mat Pilates For Beginners'
where page = 'home' and section = 'hero'
  and title = 'Move slow, then sip something good.';

update public.site_content
set body = 'Start your day by slowing down, moving with intention, and reconnecting with your body. Designed for beginners and those looking to refine their foundation using the STOTT method. Through mindful movement, you''ll learn proper alignment, core engagement, and breathing techniques while building strength safely and effectively.'
where page = 'home' and section = 'hero'
  and body = 'A 50-minute beginner STOTT mat class in the cafe, with an upsized matcha or coffee after. Small groups of 4.';


-- -----------------------------------------------------------------------------
-- 2. Class Details & Location (text from about_class, photo from location_drink)
-- -----------------------------------------------------------------------------
insert into public.site_content (page, section, title, body, image_path)
select
  'home',
  'class_details',
  'Class Details & Location',
  -- The current "About the class" text, or the original wording if that
  -- block is missing or empty
  coalesce(
    (select nullif(btrim(c.body), '') from public.site_content c
      where c.page = 'home' and c.section = 'about_class'),
    'Mindful Mat Pilates is a beginner class using the STOTT method. Expect slow, controlled moves on the mat that build core strength, posture and flexibility. No experience needed: the instructor guides every move and gives easier options.'
  ),
  -- The location photo the admin may have uploaded (null = the gradient box)
  (select c.image_path from public.site_content c
    where c.page = 'home' and c.section = 'location_drink')
on conflict (page, section) do nothing;


-- -----------------------------------------------------------------------------
-- 3. The mat rental line
-- -----------------------------------------------------------------------------
insert into public.site_content (page, section, title, body) values
  ('home', 'mat_note',
   null,
   'Don''t have a mat? Add mat rental to your booking.')
on conflict (page, section) do nothing;


-- -----------------------------------------------------------------------------
-- 4. Health and Safety Information (a list: one item per line)
-- -----------------------------------------------------------------------------
insert into public.site_content (page, section, title, body)
select
  'home',
  'health_safety',
  'Health and Safety Information',
  -- The current About Us list, or the original wording if it's missing
  coalesce(
    (select nullif(btrim(c.body), '') from public.site_content c
      where c.page = 'about' and c.section = 'health_safety'),
    E'This class is not suitable for pregnant participants.\nTell us about any injuries or medical conditions when you book, so the instructor can adjust the moves for you.\nIf you feel pain or dizziness during class, stop and tell the instructor.'
  )
on conflict (page, section) do nothing;
