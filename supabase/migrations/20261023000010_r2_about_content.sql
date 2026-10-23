-- =============================================================================
-- Migration 14: Change 17, Part E - the instructor on About Us
-- (docs/prompts/17-client-revisions-2.md).
--
-- What this file does (site_content, page 'about'):
--   The instructor is Mhay Florence Corpuz, "STOTT-trained mat Pilates
--   instructor." It fills in the [PLACEHOLDERS] left by migrations 4 and 5:
--     about/instructor_name  title = the name, body = the short description
--     about/instructor       the bio sentence: the original placeholder text
--                            becomes a finished sentence; if an admin already
--                            wrote their own bio but left [INSTRUCTOR NAME]
--                            in it, only that placeholder is swapped for the name
--   A value is ONLY changed while it is still the original text or still a
--   [PLACEHOLDER]. Anything an admin has written themselves is kept.
--
-- Nothing is deleted. About Us simply stops showing the Health and Safety
-- section (it's on Home now, migration 13) and the Class Schedule section;
-- their rows (about/health_safety, about/schedule) stay and are hidden on the
-- admin Content page.
--
-- SAFE TO RUN TWICE: once the placeholders are gone, nothing matches again.
--
-- Where it's used: `npx supabase db push` runs this file on our Supabase project.
-- The About Us page (src/app/(client)/about/page.tsx) reads these rows.
-- Tests: supabase/tests/16-r2-content.test.mjs.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- The instructor's name (title) and short description (body)
-- -----------------------------------------------------------------------------
-- Name: only while it's still a [PLACEHOLDER] (or empty)
update public.site_content
set title = 'Mhay Florence Corpuz'
where page = 'about' and section = 'instructor_name'
  and (title is null or btrim(title) = '' or btrim(title) like '[%]');

-- Description: only while it's still a [PLACEHOLDER] (or empty)
update public.site_content
set body = 'STOTT-trained mat Pilates instructor.'
where page = 'about' and section = 'instructor_name'
  and (body is null or btrim(body) = '' or btrim(body) like '[%]');


-- -----------------------------------------------------------------------------
-- The instructor's bio sentence
-- -----------------------------------------------------------------------------
-- 1. Still exactly migration 4's placeholder text: a finished sentence
update public.site_content
set body = 'Mhay Florence Corpuz is a STOTT-trained mat Pilates instructor who teaches our beginner mat classes.'
where page = 'about' and section = 'instructor'
  and body = '[INSTRUCTOR NAME] teaches our beginner mat classes using the STOTT method. [Add a short bio here: training, years teaching, and what a first class feels like.]';

-- 2. An admin's own bio that still says [INSTRUCTOR NAME]: put the name in
--    and keep the rest of their words
update public.site_content
set body = replace(body, '[INSTRUCTOR NAME]', 'Mhay Florence Corpuz')
where page = 'about' and section = 'instructor'
  and body like '%[INSTRUCTOR NAME]%';
