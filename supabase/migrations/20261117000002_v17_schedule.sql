-- =============================================================================
-- Migration 28: Version 1.7 (Prompt D), classes open by themselves.
--
-- What this file does:
--   1. keep_classes_open(): makes sure the dated classes exist for the next
--      N weeks (setting sessions_weeks_ahead, 9 today) from the active weekly
--      pattern. It uses generate_sessions() (migration 3), which SKIPS any
--      date + start time that already exists (unique slot, migration 1). So
--      it never duplicates a class, and a class the admin closed or
--      cancelled is never brought back (its row is still there).
--   2. A trigger on schedule_templates (the weekly pattern): every time a
--      row is added or saved, the next 9 weeks are opened at once. When a
--      row's day or times change, or it is turned Off, the FUTURE classes
--      made from it that NOBODY EVER BOOKED (and that are still open) are
--      removed first, so a moved time doesn't leave the old classes behind
--      (no 9:00 AND 9:30 on the same day). Booked, closed and cancelled
--      classes are never touched.
--   3. A nightly pg_cron job at 00:05 Manila time (16:05 UTC; pg_cron uses
--      UTC) that runs keep_classes_open(), so 9 weeks are always open.
--      Only where pg_cron exists (our Supabase project). The local test
--      database has no pg_cron, so there the job is simply skipped.
--
-- The website: /admin/schedule (the "Open classes for booking" card is gone).
-- Tests: supabase/tests/30-v17-schedule.test.mjs.
-- =============================================================================


-- =============================================================================
-- 1. keep_classes_open()
-- =============================================================================

-- Opens the dated classes for the next N weeks from the weekly pattern.
-- Takes: nothing. N = the setting sessions_weeks_ahead (1 to 12; 9 if the
-- setting is missing).
-- Gives back: how many NEW classes were made (0 = all already there).
-- Who runs it: the pattern trigger below (as the admin who saved), and the
-- nightly pg_cron job (no logged-in user). generate_sessions() still refuses
-- a logged-in non-admin.
-- security definer: it creates class_sessions rows.
create or replace function public.keep_classes_open()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_weeks integer;
begin
  -- The setting is saved as JSON, e.g. 9 (checked to be 1 to 12 when saved)
  select (s.value #>> '{}')::integer into v_weeks
  from public.settings s
  where s.key = 'sessions_weeks_ahead';
  -- Never outside 1 to 12 (generate_sessions refuses anything else)
  v_weeks := least(greatest(coalesce(v_weeks, 9), 1), 12);
  return public.generate_sessions(v_weeks);
end;
$$;


-- =============================================================================
-- 2. The weekly pattern trigger
-- =============================================================================

-- Keeps the dated classes in step with one weekly pattern row.
-- Takes: the new (and, for a save, the old) schedule_templates row.
-- Gives back: nothing (an "after" trigger).
-- security definer: it removes and creates class_sessions rows.
create or replace function public.sync_classes_with_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The day or times changed, or the row was turned Off: remove its future
  -- classes that are still open and that nobody ever booked (not even an
  -- expired hold, so no booking history is ever lost)
  if tg_op = 'UPDATE' and (
       new.weekday    is distinct from old.weekday
    or new.start_time is distinct from old.start_time
    or new.end_time   is distinct from old.end_time
    or (old.is_active and not new.is_active)
  ) then
    delete from public.class_sessions s
    where s.template_id = old.id
      and s.status = 'open'
      and public.at_manila(s.date, s.start_time) > now()
      and not exists (select 1 from public.bookings b where b.session_id = s.id);
  end if;

  -- An active row: open its classes for the next 9 weeks now (existing
  -- classes are skipped, so nothing is duplicated or brought back)
  if new.is_active then
    perform public.keep_classes_open();
  end if;
  return null;
end;
$$;

-- Runs after a pattern row is added or saved.
drop trigger if exists schedule_templates_sync_classes on public.schedule_templates;
create trigger schedule_templates_sync_classes
  after insert or update on public.schedule_templates
  for each row execute function public.sync_classes_with_template();


-- =============================================================================
-- 3. The nightly job (pg_cron)
-- =============================================================================
-- Only where the pg_cron extension is available (Supabase). Scheduling a
-- job with the same name again just updates it, so this file is safe to run
-- twice.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    -- Supabase's way of turning pg_cron on (it makes the "cron" schema)
    create extension if not exists pg_cron with schema pg_catalog;
    -- Every day at 16:05 UTC = 00:05 Manila time
    perform cron.schedule('block69-keep-classes-open', '5 16 * * *', 'select public.keep_classes_open()');
  else
    raise notice 'pg_cron is not available here (local test database), so the nightly job was not scheduled.';
  end if;
end;
$$;


-- =============================================================================
-- Who may call what
-- =============================================================================

-- Nobody calls these from the website: the trigger and pg_cron do (as the
-- database owner). Server code may run keep_classes_open() if ever needed.
revoke all on function
  public.keep_classes_open(),
  public.sync_classes_with_template()
from public, anon, authenticated, service_role;
grant execute on function public.keep_classes_open() to service_role;

-- Short descriptions that show up in the Supabase dashboard.
comment on function public.keep_classes_open() is
  'Opens the dated classes for the next sessions_weeks_ahead weeks from the weekly pattern (skips existing ones; never revives a cancelled class). Run nightly by pg_cron.';
comment on function public.sync_classes_with_template() is
  'Trigger: after a weekly pattern row is saved, removes its never-booked future classes if the day / times changed or it was turned off, then opens the next weeks.';
