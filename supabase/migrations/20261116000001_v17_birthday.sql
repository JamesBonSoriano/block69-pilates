-- =============================================================================
-- Migration 25: Version 1.7 (Prompt C), birthday age limit 18 to 100.
--
-- What this file does:
--   1. check_birthday_age() (the profiles trigger from migration 23) now
--      also refuses a birthday that makes someone OLDER than 100 today
--      (Philippine date). Before, it only refused under 18 and the future.
--      The trigger itself (profiles_zz_check_birthday_age) is unchanged, so
--      it still runs only for a new profile with a birthday, or when the
--      birthday itself changes. Old rows are left alone.
--
-- Rule: allowed from the 18th birthday up to the day before the 101st
-- birthday (so someone who is exactly 100 can still book).
-- The website checks the same rule first (src/lib/validation.ts,
-- isAgeAllowed), so people normally see the website's message.
-- =============================================================================


-- Refuses a birthday that makes someone younger than 18 or older than 100
-- today (Philippine date), or a birthday in the future.
-- Takes: the new (and, for an update, the old) profiles row.
-- Gives back: the row to save, or stops the save with a plain message.
-- When it checks: a new profile WITH a birthday, or an update where the
-- birthday changes (same as migration 23).
create or replace function public.check_birthday_age()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Today's date in the Philippines (worked out here, not with the private
  -- manila_today() helper, because this trigger runs with the rights of
  -- whoever saves the profile)
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  -- No birthday (allowed: Google sign-ups add it on Finish your profile)
  if new.birthday is null then
    return new;
  end if;
  -- An update that keeps the same birthday: nothing to check
  if tg_op = 'UPDATE' and new.birthday is not distinct from old.birthday then
    return new;
  end if;
  -- Younger than 18 today, or born in the future (unchanged message)
  if new.birthday > (today - interval '18 years')::date then
    raise exception 'You must be at least 18 years old to book a class.';
  end if;
  -- Older than 100: born on or before (today minus 101 years) means their
  -- 101st birthday has already come
  if new.birthday <= (today - interval '101 years')::date then
    raise exception 'Please check your birthday: the age limit is 100 years old.';
  end if;
  return new;
end;
$$;

-- Keep it private, like migration 23 (only the trigger uses it)
revoke all on function public.check_birthday_age()
from public, anon, authenticated, service_role;

-- Short description that shows up in the Supabase dashboard.
comment on function public.check_birthday_age() is 'Trigger: refuses a new or changed birthday under 18 or over 100 years old (Philippine date), or in the future.';
