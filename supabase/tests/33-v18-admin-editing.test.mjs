// Covers the settings, deactivation, and history database contracts used by Batch 4.
export const title = 'Version 1.8: admin editing and history';

export default async function run(t) {
  const { as, attempt, check, one } = t;
  const client = await t.addUser('client');
  await t.addUser('admin', { admin: true });

  // A field save must preserve the values another editor did not submit.
  const readSettings = () => one("select jsonb_object_agg(key, value) as settings from public.settings");
  const before = (await readSettings()).settings;
  const changed = await as('admin', 'select public.admin_update_settings($1::jsonb)', [JSON.stringify({ manual_payment_enabled: !before.manual_payment_enabled })]);
  const after = (await readSettings()).settings;
  check('Saving the switch preserves all other settings', 'only the manual flag changed', changed.ok
    && after.manual_payment_enabled !== before.manual_payment_enabled
    && Object.keys(before).every((key) => key === 'manual_payment_enabled' || JSON.stringify(before[key]) === JSON.stringify(after[key])), changed.err);

  // Disposable client with a paid appointment. Staff changes account access only.
  const [session] = await t.emptySessions(1);
  const booked = await t.book('client', session);
  const bookingId = booked.row.booking_id;
  await t.pay(bookingId, 500);
  const history = () => one("select jsonb_build_object('booking', to_jsonb(b), 'payments', (select jsonb_agg(p order by p.id) from public.payments p where p.booking_id = b.id)) as records from public.bookings b where b.id = $1", [bookingId]);
  const original = (await history()).records;
  const deactivated = await as('admin', 'select public.admin_set_user_active($1, false) as active', [client]);
  const self = await attempt('client', 'select public.reactivate_my_account()');
  check('Staff deactivation cannot be self-reversed', 'inactive and self-reactivation refused', deactivated.row?.active === false && !self.ok, self.err);
  const restored = await as('admin', 'select public.admin_set_user_active($1, true) as active', [client]);
  check('Staff restores access without losing booking or payment records', 'same records', restored.row?.active === true && JSON.stringify(original) === JSON.stringify((await history()).records));

  // History uses the same ten-row window and stable timestamp/ID ordering as the page.
  for (let index = 1; index <= 12; index++) {
    await as('admin', "select * from public.admin_start_message($1, 'message', $2, 'Recovery token omitted from history.')", [client, 'Test recovery ' + index]);
  }
  const sql = 'select id, count(*) over ()::int as total from public.communications where user_id = $1 order by created_at desc, id offset $2 limit 10';
  const first = await attempt('admin', sql, [client, 0]);
  const second = await attempt('admin', sql, [client, 10]);
  check('Communications history pages retain the total without duplicate rows', '10 then 2 of 12', first.rows?.length === 10 && second.rows?.length === 2
    && second.rows.every((row) => row.total === 12 && !first.rows.some((previous) => previous.id === row.id)));
  const hidden = await attempt('client', sql, [client, 0]);
  check('Client cannot read staff recovery logs', 'no rows', !hidden.ok || hidden.rows.length === 0);
}
