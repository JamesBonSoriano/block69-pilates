// Shared helpers for the database tests in supabase/tests/.
// Used by run.mjs (starts the throwaway Postgres and builds the database from
// our migrations) and by every *.test.mjs file (runs SQL as a guest, client,
// admin or the server, and records PASS / FAIL).
// Nothing here touches our live Supabase project.

import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// Login for the throwaway database. It only exists on this computer while the
// tests run, and is deleted afterwards, so a simple password is fine.
const USER = 'postgres';
const PASSWORD = 'test';

// The database that holds "just the migrations". Every test file gets its own
// fresh copy of it, so test files can't affect each other.
const TEMPLATE_DB = 'block69_template';

// The 3 database roles Supabase uses. They belong to the whole server (not one
// database), so they are made once.
//   anon          = a guest (not logged in) using the website
//   authenticated = a logged-in user (client or admin) using the website
//   service_role  = our server code with the secret key (skips RLS)
const ROLES_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
`;

// The small parts of Supabase our migrations rely on. A real Supabase project
// already has these; a plain Postgres doesn't.
//   - Supabase lets every role use new tables and functions by default. We copy
//     that, so the "revoke" lines in our migrations are really tested.
//   - A cut-down auth.users table (the sign-up trigger in migration 1 needs it).
//   - auth.uid(): the logged-in user's id, read from the login token (JWT),
//     written the same way Supabase writes it.
const SUPABASE_STAND_IN_SQL = `
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id                 uuid primary key default gen_random_uuid(),
    email              text,
    raw_user_meta_data jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
`;


// Finds a free network port on this computer, so the test database never
// clashes with something already running (like a local Supabase).
// Takes: nothing. Gives back: a port number.
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    // Port 0 = "any free port"; we read which one we got, then let it go.
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}


// Starts a brand-new, empty Postgres 17 server (the same major version as our
// Supabase project) in a temporary folder.
// Takes: nothing.
// Gives back: { port, stop }. Call stop() at the end: it shuts the server down
// and deletes the folder.
export async function startServer() {
  const port = await freePort();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'block69-dbtest-'));
  const server = new EmbeddedPostgres({
    databaseDir: path.join(tempDir, 'data'),
    user: USER,
    password: PASSWORD,
    port,
    // Don't let the library delete the data folder: on Windows it fails with
    // EBUSY when Postgres still holds a file. stop() below deletes the whole
    // temporary folder itself, retrying a few times.
    persistent: true,
    onLog: () => {},   // hide Postgres' own log lines
    onError: () => {},
  });
  await server.initialise();
  await server.start();
  return {
    port,
    async stop() {
      await server.stop();
      // Delete the throwaway database folder. On Windows, Postgres can keep
      // its files locked for a moment after stopping (error EBUSY), so try
      // again a few times. If it still fails, only warn: the tests are
      // already finished, and Windows clears its Temp folder by itself.
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch (err) {
        console.warn(`(Could not delete the temporary folder ${tempDir}: ${err.code}. You can ignore this.)`);
      }
    },
  };
}


// Opens one connection to a database on the test server.
// The connection's clock is set to UTC, like Supabase's servers, which proves
// our Philippine-time (Asia/Manila) logic doesn't depend on the server clock.
// Takes: the port and the database name.
// Gives back: a connected pg client (call .end() when done).
async function connect(port, database) {
  const client = new pg.Client({
    host: 'localhost', port, user: USER, password: PASSWORD, database,
    options: '-c TimeZone=UTC',
  });
  await client.connect();
  return client;
}


// Builds the template database: the Supabase stand-in, then every migration
// in order, exactly like `npx supabase db push` does on the real project.
// Takes: the port and the list of migration file paths (already sorted).
// Gives back: nothing. Throws an error naming the file if a migration fails.
export async function buildTemplate(port, migrationFiles) {
  const main = await connect(port, 'postgres');
  await main.query(ROLES_SQL);
  await main.query(`create database ${TEMPLATE_DB}`);
  await main.end();

  const db = await connect(port, TEMPLATE_DB);
  try {
    await db.query(SUPABASE_STAND_IN_SQL);
    for (const file of migrationFiles) {
      try {
        await db.query(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        throw new Error(`Migration ${path.basename(file)} failed: ${e.message}`);
      }
      console.log(`  migration OK: ${path.basename(file)}`);
    }
  } finally {
    // A template can only be copied when nobody is connected to it.
    await db.end();
  }
}


// Makes a fresh copy of the template database for one test file, and gives
// back the toolbox ("t") that the test file uses.
// Takes: the port, a short name for the test file (e.g. "03-booking"), and
// the shared results list that check() adds to.
// Gives back: the toolbox object described below.
export async function createTestContext(port, name, results) {
  // Database names can only have letters, numbers and underscores.
  const dbName = 'test_' + name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const main = await connect(port, 'postgres');
  await main.query(`create database ${dbName} template ${TEMPLATE_DB}`);
  await main.end();

  // The main connection. It logs in as the database owner, which skips RLS,
  // just like the Supabase SQL Editor (or our server's secret key).
  const db = await connect(port, dbName);
  // Sample users made by addUser(), e.g. { A: '<uuid>', admin: '<uuid>' }.
  const users = {};
  let area = '';

  // Runs SQL as the owner. Gives back all rows / the first row.
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await q(sql, params))[0];

  // Pretends to be someone for the rest of the current transaction.
  // Takes: a pg client and who to be: 'guest', 'server', or a user key from addUser().
  // Gives back: nothing.
  async function setActor(client, actor) {
    if (actor === 'guest') {
      await client.query(`select set_config('request.jwt.claims', '', true)`);
      await client.query('set local role anon');
    } else if (actor === 'server') {
      await client.query(`select set_config('request.jwt.claims', '', true)`);
      await client.query('set local role service_role');
    } else {
      if (!users[actor]) throw new Error(`Unknown test user "${actor}" (add it with t.addUser first)`);
      // This is what a logged-in user's request looks like to Postgres.
      await client.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: users[actor], role: 'authenticated' })]);
      await client.query('set local role authenticated');
    }
  }

  // Runs one SQL statement as someone, in its own transaction.
  // Takes: who ('guest' / 'server' / a user key), the SQL, its parameters,
  // whether to KEEP the change (true) or undo it afterwards (false), and
  // optionally which connection to use.
  // Gives back: { ok: true, rows, row } if it worked, or { ok: false, err }
  // with the database's error message if it was refused.
  async function run(actor, sql, params, keep, client) {
    await client.query('begin');
    try {
      await setActor(client, actor);
      const r = await client.query(sql, params);
      await client.query(keep ? 'commit' : 'rollback');
      return { ok: true, rows: r.rows, row: r.rows[0] };
    } catch (e) {
      await client.query('rollback');
      return { ok: false, err: e.message };
    }
  }

  const t = {
    db,
    users,
    q,
    one,

    // Opens an extra connection to this test's database (for the
    // "several people at the same time" test). Call .end() when done.
    connect: () => connect(port, dbName),

    // Pretends to be someone inside a transaction you started yourself.
    setActor,

    // Runs SQL as someone and KEEPS the result (see run() above).
    as: (actor, sql, params = [], client = db) => run(actor, sql, params, true, client),

    // Runs SQL as someone and then UNDOES it (for "is this allowed?" checks).
    attempt: (actor, sql, params = []) => run(actor, sql, params, false, db),

    // Starts a new group of checks in the printed results, e.g. 'Holds'.
    section(name) { area = name; },

    // Records one test result.
    // Takes: the test's name, what we expected (in words), whether it passed,
    // and what actually happened (in words).
    check(test, expected, pass, got) {
      results.push({ file: name, area, test, expected, got: String(got ?? ''), pass: Boolean(pass) });
    },

    // Signs up a test user (the sign-up trigger makes their profile).
    // Takes: a short key like 'A' and { admin: true } to make them an admin.
    // Gives back: the new user's id.
    async addUser(key, { admin = false } = {}) {
      const id = crypto.randomUUID();
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
        [id, `${key.toLowerCase()}@test.example`, { full_name: `Test ${key}` }]);
      if (admin) await db.query(`update public.profiles set role = 'admin' where id = $1`, [id]);
      users[key] = id;
      return id;
    },

    // A client calls book_seat (booking step 3, "Pay"), with both ticks done.
    // Takes: who, the class id, optional { mat, drink, code }, optional connection.
    // Gives back: the run() result; row has booking_id, class_fee, mat_fee,
    // discount, total, hold_expires_at.
    book: (actor, sessionId, { mat = false, drink = 'Iced Matcha', code = null } = {}, client = db) =>
      run(actor, `select * from public.book_seat(p_session_id => $1, p_not_pregnant => true, p_agreed => true,
                  p_mat_rental => $2, p_drink_choice => $3, p_voucher_code => $4)`,
        [sessionId, mat, drink, code], true, client),

    // Seats left in one class, asked as a guest (like the Home page does).
    async seatsLeft(sessionId) {
      return (await run('guest', 'select public.seats_left($1) as n', [sessionId], true, db)).row.n;
    },

    // A booking's current status, e.g. 'confirmed'.
    async status(bookingId) {
      return (await one('select status from public.bookings where id = $1', [bookingId])).status;
    },

    // Adds a class that starts a given number of hours from now (Philippine time).
    // Takes: hours (can be negative for a class in the past) and the capacity.
    // Gives back: the new class id.
    //
    // Works at ANY time of day, including near midnight. A class can't run past
    // midnight (end_time must be after start_time), so:
    //   - a class that is STILL RUNNING now but would have started yesterday
    //     (e.g. "started 30 minutes ago" at 12:05 AM) starts at 12:00 AM today
    //     instead. It has still started, and it's still running.
    //   - a class starting after 11:00 PM ends at 11:59:59 PM instead of
    //     running 50 minutes.
    // Either way, "has it started?" and "is it still running?" stay the same
    // as the test asked for.
    async sessionIn(hours, capacity = 4) {
      return (await one(`
        insert into public.class_sessions (date, start_time, end_time, capacity)
        select t::date, t::time,
               -- 50-minute class, but never past midnight
               case when t::time > '23:00' then '23:59:59.999'::time else (t + interval '50 minutes')::time end,
               $2
        from (
          select case
                   -- Still running now, but the start falls on yesterday: start at midnight today
                   when x.t::date < x.n::date and x.t + interval '50 minutes' > x.n
                     then date_trunc('day', x.n)
                   else x.t
                 end as t
          from (
            -- t = the asked-for start, n = now (both Philippine wall-clock time)
            select date_trunc('second', (now() + make_interval(secs => $1::float8 * 3600)) at time zone 'Asia/Manila') as t,
                   now() at time zone 'Asia/Manila' as n
          ) x
        ) y
        returning id`, [hours, capacity])).id;
    },

    // Adds a class on TODAY's date (Philippine time), starting about 10
    // minutes from now. Late at night it starts at 11:59 PM, which may already
    // have passed. Tests using it must only rely on the DATE being today (e.g.
    // the cutoff tests), so they work at any time of day.
    // Takes: the capacity. Gives back: the new class id.
    async sessionToday(capacity = 4) {
      return (await one(`
        insert into public.class_sessions (date, start_time, end_time, capacity)
        select x.n::date, s.start_time,
               case when s.start_time > '23:00' then '23:59:59.999'::time else s.start_time + interval '50 minutes' end,
               $1
        from (select now() at time zone 'Asia/Manila' as n) x
        cross join lateral (
          select case
                   when (x.n + interval '10 minutes')::date = x.n::date
                     then date_trunc('second', x.n + interval '10 minutes')::time
                   else '23:59'::time
                 end as start_time
        ) s
        returning id`, [capacity])).id;
    },

    // Adds an already-paid ('confirmed') booking directly, skipping book_seat.
    // Takes: the class id and a user key. Gives back: the booking id.
    async confirmedBooking(sessionId, userKey) {
      return (await one(`
        insert into public.bookings (session_id, user_id, status, mat_rental, drink_choice,
                                     class_fee, mat_fee, total, not_pregnant_confirmed, agreed_at)
        values ($1, $2, 'confirmed', true, 'Iced Matcha', 500, 50, 550, true, now())
        returning id`, [sessionId, users[userKey]])).id;
    },

    // Generated classes at least N days ahead that have no bookings yet,
    // earliest first. Gives back: a list of class ids.
    async emptySessions(minDaysAhead = 3) {
      return (await q(`
        select s.id from public.class_sessions s
        where s.date >= public.manila_today() + $1::integer and s.status = 'open'
          and not exists (select 1 from public.bookings b where b.session_id = s.id)
        order by s.date, s.start_time`, [minDaysAhead])).map((x) => x.id);
    },

    // Closes this test's connection.
    close: () => db.end(),
  };
  return t;
}
