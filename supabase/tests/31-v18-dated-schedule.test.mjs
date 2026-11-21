// Tests Version 1.8 dated scheduling, preserved history, and the month listing.
export const title = 'Version 1.8: manually scheduled classes';

export default async function run(t) {
  const { as, attempt, check, one, q } = t;
  await t.addUser('admin', { admin: true });
  await t.addUser('client');

  // Existing dated rows remain intact even if a legacy weekly slot is changed.
  const legacy = await one('select id, template_id from public.class_sessions where template_id is not null limit 1');
  const count = await one('select count(*)::integer as n from public.class_sessions');
  await q("update public.schedule_templates set is_active = false where id = $1", [legacy.template_id]);
  const after = await one('select count(*)::integer as n from public.class_sessions');
  check('Legacy template edits leave dated classes alone', 'same rows', count.n === after.n
    && Boolean(await one('select id from public.class_sessions where id = $1', [legacy.id])), after.n);
  const jobFunction = await attempt('server', 'select public.keep_classes_open()');
  check('Retired generator is unavailable to the application server', 'permission denied', !jobFunction.ok, jobFunction.err);

  // Pick the first upcoming January, even if the suite runs after 2026.
  const { january } = await one("select (make_date(extract(year from public.manila_today())::integer + 1, 1, 10))::text as january");
  const args = [january, '12:00', '12:50', 6];
  const create = 'select public.admin_create_dated_class($1, $2, $3, $4) as id';
  const denied = await attempt('client', create, args);
  check('Client cannot create a dated class', 'refused', !denied.ok, denied.err);
  const added = await as('admin', create, args);
  check('Admin creates a single January class', 'new id', added.ok && Boolean(added.row?.id), added.err ?? added.row?.id);
  const row = await one('select template_id, capacity, status from public.class_sessions where id = $1', [added.row.id]);
  check('New class has the requested seats and no weekly template', 'open, 6 seats, null template', row.status === 'open' && row.capacity === 6 && row.template_id === null, JSON.stringify(row));
  const duplicate = await attempt('admin', create, args);
  check('Duplicate dated slot cannot be created', 'refused', !duplicate.ok, duplicate.err);
  const invalid = await attempt('admin', create, [january, '12:00', '11:50', 6]);
  check('Class end time must be after its start', 'refused', !invalid.ok, invalid.err);
  const months = await attempt('guest', 'select month_start::text from public.bookable_class_months()');
  check('Guest can discover January', 'January returned', months.rows?.some(({ month_start }) => month_start === january.slice(0, 7) + '-01'), JSON.stringify(months.rows));
  const seats = await attempt('guest', 'select seats_left, is_bookable from public.get_open_sessions($1, $1) where session_id = $2', [january, added.row.id]);
  check('Guest can see live seats for the January session', '6 and bookable', seats.row?.is_bookable === true && seats.row?.seats_left === 6, JSON.stringify(seats.row));
  const page = await attempt('admin', 'select * from public.admin_upcoming_classes(1)');
  const page2 = await attempt('admin', 'select * from public.admin_upcoming_classes(2)');
  check('Upcoming schedule uses separate five-row pages', '5 distinct rows per page', page.rows?.length === 5
    && page2.rows?.length === 5 && page2.rows.every((next) => page.rows.every(({ session_id }) => session_id !== next.session_id)), page2.rows?.length);
  // January may sort before a generated class, so find its position in the dated list.
  const position = await one("select count(*)::int as n from public.class_sessions where public.at_manila(date, end_time) > now() and (date, start_time) <= ($1::date, $2::time)", args.slice(0, 2));
  const januaryPage = await attempt('admin', 'select * from public.admin_upcoming_classes($1)', [Math.ceil(position.n / 5)]);
  check('Upcoming pages include the manually scheduled class', 'January class found', januaryPage.rows?.some(({ session_id }) => session_id === added.row.id), januaryPage.row?.page_number);
}
