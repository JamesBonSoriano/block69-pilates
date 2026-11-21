-- Retire automatic generation without changing any existing dates or bookings.
drop trigger if exists schedule_templates_sync_classes on public.schedule_templates;

do $$
begin
  if to_regclass('cron.job') is not null then
    -- Look up the old job before unscheduling so a fresh database is safe.
    perform cron.unschedule(jobid) from cron.job where jobname = 'block69-keep-classes-open';
  end if;
end;
$$;

revoke execute on function public.keep_classes_open() from service_role;

-- Lists months with at least one class that still accepts online bookings.
create function public.bookable_class_months()
returns table (month_start date)
language sql stable security definer set search_path = ''
as $$
  select distinct date_trunc('month', s.date::timestamp)::date
  from public.class_sessions s
  where s.date >= public.manila_today()
    and s.status = 'open'
    and now() < public.booking_closes_at(s.date, s.start_time)
    and public.seats_taken(s.id) < s.capacity
  order by 1;
$$;

-- Adds one dated class using Manila date and time and the existing slot constraints.
create function public.admin_create_dated_class(p_date date, p_start time, p_end time, p_capacity integer)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.require_admin();
  if p_date is null or p_start is null or not isfinite(p_date)
     or public.at_manila(p_date, p_start) <= now() then
    raise exception 'Choose a class date and start time in the future.';
  end if;
  if p_end is null or p_end <= p_start then
    raise exception 'The class end time must be after its start time.';
  end if;
  if p_capacity is null or p_capacity not between 1 and 50 then
    raise exception 'Choose between 1 and 50 seats.';
  end if;

  insert into public.class_sessions (date, start_time, end_time, capacity)
  values (p_date, p_start, p_end, p_capacity)
  returning id into v_id;
  return v_id;
end;
$$;

-- Returns one five-row Schedule page, calculating live seat counts only for these rows.
create function public.admin_upcoming_classes(p_page integer)
returns table (
  session_id uuid, date date, start_time time, end_time time, capacity integer,
  status public.session_status, seats_taken integer, seats_left integer,
  has_started boolean, total_count integer, page_number integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_total integer;
  v_page integer;
begin
  perform public.require_admin();
  select count(*)::integer into v_total
  from public.class_sessions s
  where s.date >= public.manila_today() and public.at_manila(s.date, s.end_time) > now();

  -- Keep the requested page in range, including after a class ends.
  v_page := least(greatest(1, coalesce(p_page, 1)), greatest(1, (v_total + 4) / 5));
  return query
  select s.id, s.date, s.start_time, s.end_time, s.capacity, s.status,
         x.taken, greatest(0, s.capacity - x.taken),
         public.at_manila(s.date, s.start_time) <= now(), v_total, v_page
  from (
    select c.id, c.date, c.start_time, c.end_time, c.capacity, c.status
    from public.class_sessions c
    where c.date >= public.manila_today() and public.at_manila(c.date, c.end_time) > now()
    order by c.date, c.start_time
    limit 5 offset (v_page - 1) * 5
  ) s
  cross join lateral (select public.seats_taken(s.id) as taken) x
  order by s.date, s.start_time;
end;
$$;

revoke execute on function public.bookable_class_months(), public.admin_create_dated_class(date, time, time, integer),
  public.admin_upcoming_classes(integer) from public, anon, authenticated;
grant execute on function public.bookable_class_months() to anon, authenticated;
grant execute on function public.admin_create_dated_class(date, time, time, integer),
  public.admin_upcoming_classes(integer) to authenticated;
