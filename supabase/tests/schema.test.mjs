import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(join(ROOT, path), 'utf8');

const db = new PGlite();
const users = {};
const supplyIds = {};

const as = async (role, uid = '') => {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  if (role !== 'postgres') await db.exec(`set role ${role}`);
};
const asUser = (name) => as('authenticated', users[name]);
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const rejects = async (promise, code) => {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.code, code, `expected SQLSTATE ${code}, got ${error.code}: ${error.message}`);
    return error;
  }
  assert.fail(`expected SQLSTATE ${code}, but the statement succeeded`);
};
const createRequest = (items, key) =>
  one('select public.create_supply_request($1::jsonb, $2) as id', [JSON.stringify(items), key]);
const stockOf = async (name) => {
  await as('postgres');
  return (await one('select stock from public.supplies where name = $1', [name])).stock;
};
const addUser = async (key, email, meta = {}) => {
  await as('postgres');
  const row = await one('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [email, meta]);
  users[key] = row.id;
};

before(async () => {
  await db.exec(await read('tests/supabase-stub.sql'));
  const migrations = (await readdir(join(ROOT, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations) await db.exec(await read(`migrations/${file}`));
  await db.exec(await read('seed.sql'));

  await addUser('dinda', 'Dinda@Example.com', { name: 'Dinda Putri Ramadani', position: 'UI/UX Designer', department: 'UI/UX Designer' });
  await addUser('budi', 'budi.santoso@example.com');
  await addUser('ga', 'ga.admin@example.com', { name: 'GA Admin' });
  await db.query(`update public.profiles set role = 'admin' where id = $1`, [users.ga]);
  for (const row of (await db.query('select id, name from public.supplies')).rows) supplyIds[row.name] = row.id;
});

after(() => db.close());

describe('accounts', () => {
  it('accepts any e-mail domain while the allowlist is empty (the default)', async () => {
    await as('postgres');
    await db.query(`insert into auth.users (email) values ('first.user@gmail.com')`);
    assert.equal((await one(`select count(*)::int as n from public.profiles where email = 'first.user@gmail.com'`)).n, 1);
  });

  it('restricts accounts to allow-listed domains once the allowlist has rows', async () => {
    await as('postgres');
    await db.query(`insert into public.app_allowed_email_domains (domain) values ('example.com')`);
    try {
      await rejects(db.query(`insert into auth.users (email) values ('someone@gmail.com')`), 'PT403');
      await db.query(`insert into auth.users (email) values ('new.hire@example.com')`);
    } finally {
      await db.query('delete from public.app_allowed_email_domains');
    }
  });

  it('creates a profile from the new user, normalising the e-mail and deriving a name', async () => {
    await as('postgres');
    const dinda = await one('select email, name, position, role from public.profiles where id = $1', [users.dinda]);
    assert.deepEqual(dinda, { email: 'dinda@example.com', name: 'Dinda Putri Ramadani', position: 'UI/UX Designer', role: 'employee' });
    assert.equal((await one('select name from public.profiles where id = $1', [users.budi])).name, 'Budi Santoso');
  });

  it('lets employees see only their own profile and not change it', async () => {
    await asUser('budi');
    assert.equal((await db.query('select id from public.profiles')).rows.length, 1);
    await db.query(`update public.profiles set role = 'admin' where id = $1`, [users.budi]);
    await as('postgres');
    assert.equal((await one('select role from public.profiles where id = $1', [users.budi])).role, 'employee');
  });
});

describe('anonymous visitors (publishable key, no session)', () => {
  it('cannot read any table or call any RPC', async () => {
    await as('anon');
    for (const table of ['profiles', 'supplies', 'supply_requests', 'supply_request_items', 'supply_request_list']) {
      await rejects(db.query(`select * from public.${table}`), '42501');
    }
    await rejects(createRequest([{ supply_id: supplyIds['Gel Pen'], quantity: 1 }], 'anon-key-123'), '42501');
    await rejects(db.query('select public.my_request_summary()'), '42501');
  });
});

describe('catalogue', () => {
  it('is readable but not writable by employees', async () => {
    await asUser('dinda');
    assert.equal((await db.query('select id from public.supplies')).rows.length, 13);
    await db.query(`update public.supplies set stock = 9999 where name = 'Gel Pen'`);
    assert.equal(await stockOf('Gel Pen'), 300);
    await asUser('dinda');
    await rejects(db.query(`insert into public.supply_requests (code, requester_id, idempotency_key) values ('X', $1, 'k')`, [users.dinda]), '42501');
    await rejects(db.query('select * from public.request_code_counters'), '42501');
  });
});

describe('create_supply_request', () => {
  let dindaRequest;

  it('creates a pending request, snapshots item names and decrements stock', async () => {
    await asUser('dinda');
    const { id } = await createRequest(
      [{ supply_id: supplyIds['Gel Pen'], quantity: 3 }, { supply_id: supplyIds['A4 75gsm'], quantity: 3 }],
      'dinda-key-0001',
    );
    dindaRequest = id;
    const row = await one('select code, status, item_count, total_quantity, item_names from public.supply_request_list where id = $1', [id]);
    assert.match(row.code, /^REQ-\d{8}-001$/);
    assert.equal(row.status, 'pending');
    assert.equal(row.item_count, 2);
    assert.equal(row.total_quantity, 6);
    assert.match(row.item_names, /A4 75gsm Gel Pen/);
    assert.equal(await stockOf('Gel Pen'), 297);
    assert.equal(await stockOf('A4 75gsm'), 11);
  });

  it('replays the original request for a repeated idempotency key without touching stock', async () => {
    await asUser('dinda');
    const { id } = await createRequest(
      [{ supply_id: supplyIds['A4 75gsm'], quantity: 3 }, { supply_id: supplyIds['Gel Pen'], quantity: 3 }],
      'dinda-key-0001',
    );
    assert.equal(id, dindaRequest);
    assert.equal(await stockOf('Gel Pen'), 297);
  });

  it('refuses to replay a key with a different cart instead of reporting the old request', async () => {
    await asUser('dinda');
    await rejects(createRequest([{ supply_id: supplyIds['Gel Pen'], quantity: 3 }], 'dinda-key-0001'), 'PT422');
    await asUser('dinda');
    await rejects(createRequest('not-an-array', 'dinda-key-0001'), 'PT422');
    assert.equal(await stockOf('Gel Pen'), 297);
  });

  it('refuses more than the stock with 409 and per-item messages, changing nothing', async () => {
    await asUser('dinda');
    const error = await rejects(
      createRequest([{ supply_id: supplyIds['A4 75gsm'], quantity: 12 }, { supply_id: supplyIds['Gel Pen'], quantity: 1 }], 'dinda-key-0002'),
      'PT409',
    );
    assert.equal(error.message, 'Only 11 pcs of A4 75gsm left.');
    assert.deepEqual(JSON.parse(error.detail), { [supplyIds['A4 75gsm']]: 'Only 11 pcs of A4 75gsm left.' });
    assert.equal(await stockOf('A4 75gsm'), 11);
    assert.equal(await stockOf('Gel Pen'), 297);
    await asUser('dinda');
    await rejects(createRequest([{ supply_id: supplyIds['Black Marker'], quantity: 1 }], 'dinda-key-0003'), 'PT409');
  });

  it('validates the payload with 422', async () => {
    await asUser('dinda');
    const gel = supplyIds['Gel Pen'];
    const cases = [
      [[], 'empty list'],
      [[{ supply_id: gel, quantity: 0 }], 'zero quantity'],
      [[{ supply_id: gel, quantity: '1.5' }], 'fractional quantity'],
      [[{ supply_id: 'not-a-uuid', quantity: 1 }], 'malformed id'],
      [[{ supply_id: gel, quantity: 1 }, { supply_id: gel, quantity: 2 }], 'duplicate item'],
      [[{ supply_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }], 'unknown item'],
    ];
    for (const [items, label] of cases) {
      await rejects(createRequest(items, `dinda-422-${label.replace(/\W/g, '')}`), 'PT422');
    }
    await rejects(createRequest([{ supply_id: gel, quantity: 1 }], 'short'), 'PT422');
  });

  it('does not offer inactive supplies', async () => {
    await as('postgres');
    await db.query(`update public.supplies set is_active = false where name = 'Sticky Notes'`);
    await asUser('dinda');
    assert.equal((await db.query(`select id from public.supplies where name = 'Sticky Notes'`)).rows.length, 0);
    await rejects(createRequest([{ supply_id: supplyIds['Sticky Notes'], quantity: 1 }], 'dinda-key-0004'), 'PT422');
  });

  it('numbers requests per day across employees', async () => {
    await asUser('budi');
    const { id } = await createRequest([{ supply_id: supplyIds['Standard Pen'], quantity: 2 }], 'budi-key-0001');
    assert.match((await one('select code from public.supply_requests where id = $1', [id])).code, /-002$/);
  });

  it('keeps employees out of each other’s requests', async () => {
    await asUser('budi');
    assert.equal((await db.query('select id from public.supply_request_list')).rows.length, 1);
    assert.equal((await db.query('select * from public.supply_request_items where request_id = $1', [dindaRequest])).rows.length, 0);
    assert.equal((await one('select public.my_request_summary() as s')).s.total, 1);
  });
});

describe('update_supply_request_status (General Affair)', () => {
  it('is admin-only', async () => {
    await asUser('dinda');
    const { id } = await one('select id from public.supply_requests limit 1');
    await rejects(db.query(`select public.update_supply_request_status($1, 'approved')`, [id]), 'PT403');
  });

  it('walks a request through its lifecycle and blocks skipped steps', async () => {
    await asUser('ga');
    assert.equal((await db.query('select id from public.supply_request_list')).rows.length, 2);
    const { id } = await one(`select r.id from public.supply_requests r where r.requester_id = $1`, [users.dinda]);
    await db.query(`select public.update_supply_request_status($1, 'approved')`, [id]);
    await rejects(db.query(`select public.update_supply_request_status($1, 'finished')`, [id]), 'PT409');
    await db.query(`select public.update_supply_request_status($1, 'ready_for_pickup')`, [id]);
    await db.query(`select public.update_supply_request_status($1, 'finished')`, [id]);
    await rejects(db.query(`select public.update_supply_request_status($1, 'rejected', 'late')`, [id]), 'PT409');
    await rejects(db.query(`select public.update_supply_request_status(gen_random_uuid(), 'approved')`), 'PT404');

    await asUser('dinda');
    assert.deepEqual((await one('select public.my_request_summary() as s')).s, { total: 1, pending: 0, approved: 1, rejected: 0 });
  });

  it('requires a reason to reject and returns the stock', async () => {
    await asUser('ga');
    const { id } = await one(`select r.id from public.supply_requests r where r.requester_id = $1`, [users.budi]);
    await rejects(db.query(`select public.update_supply_request_status($1, 'rejected', '  ')`, [id]), 'PT422');
    assert.equal(await stockOf('Standard Pen'), 198);
    await asUser('ga');
    await db.query(`select public.update_supply_request_status($1, 'rejected', 'Out of budget this month')`, [id]);
    assert.equal(await stockOf('Standard Pen'), 200);
    await asUser('budi');
    const row = await one('select status, rejection_reason from public.supply_requests where id = $1', [id]);
    assert.deepEqual(row, { status: 'rejected', rejection_reason: 'Out of budget this month' });
  });
});

describe('admin review queue', () => {
  it('lists every request with the requester name for General Affair', async () => {
    await asUser('ga');
    const rows = (await db.query('select requester_name, requester_department from public.supply_request_list order by created_at')).rows;
    assert.deepEqual(rows, [
      { requester_name: 'Dinda Putri Ramadani', requester_department: 'UI/UX Designer' },
      { requester_name: 'Budi Santoso', requester_department: '' },
    ]);
  });

  it('shows an employee only their own rows and name', async () => {
    await asUser('budi');
    const rows = (await db.query('select requester_name from public.supply_request_list')).rows;
    assert.deepEqual(rows, [{ requester_name: 'Budi Santoso' }]);
  });

  it('counts the whole organisation for admins only', async () => {
    await asUser('ga');
    assert.deepEqual((await one('select public.admin_request_summary() as s')).s, {
      total: 2, pending: 0, approved: 0, ready_for_pickup: 0, rejected: 1, finished: 1,
    });
    await asUser('dinda');
    await rejects(db.query('select public.admin_request_summary()'), 'PT403');
    await as('anon');
    await rejects(db.query('select public.admin_request_summary()'), '42501');
  });

  it('caps the rejection reason and reports it as a field error', async () => {
    await asUser('dinda');
    const { id } = await createRequest([{ supply_id: supplyIds['Fine Liner'], quantity: 1 }], 'dinda-key-long');
    await asUser('ga');
    const error = await rejects(db.query(`select public.update_supply_request_status($1, 'rejected', $2)`, [id, 'x'.repeat(501)]), 'PT422');
    assert.deepEqual(JSON.parse(error.detail), { reason: 'Keep the reason under 500 characters.' });
    await asUser('ga');
    await db.query(`select public.update_supply_request_status($1, 'rejected', $2)`, [id, 'x'.repeat(500)]);
    assert.equal(await stockOf('Fine Liner'), 60);
  });

  it('lets two admins race on one pending request without a double decision', async () => {
    await asUser('dinda');
    const { id } = await createRequest([{ supply_id: supplyIds['Gel Pen'], quantity: 1 }], 'dinda-key-race');
    await asUser('ga');
    await db.query(`select public.update_supply_request_status($1, 'approved')`, [id]);
    const stale = await rejects(db.query(`select public.update_supply_request_status($1, 'rejected', 'duplicate')`, [id]), 'PT409');
    assert.match(stale.message, /already approved/);
    await as('postgres');
    const row = await one('select status, decided_by from public.supply_requests where id = $1', [id]);
    assert.deepEqual(row, { status: 'approved', decided_by: users.ga });
  });
});

describe('notifications', () => {
  let requestId;
  const latest = async (name) => {
    await asUser(name);
    return one('select kind, title, body, request_id, read_at from public.notifications order by created_at desc limit 1');
  };

  it('tells every admin about a new request, with who asked and how much', async () => {
    await asUser('dinda');
    ({ id: requestId } = await createRequest(
      [{ supply_id: supplyIds['Blue Gel Pen'], quantity: 2 }, { supply_id: supplyIds['Red Gel Pen'], quantity: 1 }],
      'dinda-key-notify',
    ));
    const note = await latest('ga');
    assert.equal(note.kind, 'request_submitted');
    assert.equal(note.request_id, requestId);
    assert.match(note.title, /^New request REQ-\d{8}-\d{3}$/);
    assert.equal(note.body, 'Dinda Putri Ramadani requested 2 items (3 qty). Waiting for your review.');
  });

  it('does not notify the employee about their own submission', async () => {
    await asUser('dinda');
    const own = await db.query(`select 1 from public.notifications where kind = 'request_submitted' and request_id = $1`, [requestId]);
    assert.equal(own.rows.length, 0);
  });

  it('tells the employee when General Affair approves, prepares or rejects', async () => {
    await asUser('ga');
    await db.query(`select public.update_supply_request_status($1, 'approved')`, [requestId]);
    assert.equal((await latest('dinda')).kind, 'request_approved');

    await asUser('ga');
    await db.query(`select public.update_supply_request_status($1, 'ready_for_pickup')`, [requestId]);
    const ready = await latest('dinda');
    assert.equal(ready.kind, 'request_ready');
    assert.match(ready.body, /General Affair Office/);

    await asUser('budi');
    const { id: budiRequest } = await createRequest([{ supply_id: supplyIds['Ballpoint Pen'], quantity: 1 }], 'budi-key-notify');
    await asUser('ga');
    await db.query(`select public.update_supply_request_status($1, 'rejected', 'Use the team stock first')`, [budiRequest]);
    const rejected = await latest('budi');
    assert.equal(rejected.kind, 'request_rejected');
    assert.equal(rejected.body, 'Reason: Use the team stock first');
  });

  it('keeps notifications private and read-only for clients', async () => {
    await asUser('budi');
    const rows = (await db.query('select recipient_id from public.notifications')).rows;
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.recipient_id === users.budi));
    await rejects(
      db.query(`insert into public.notifications (recipient_id, kind, title, body) values ($1, 'request_approved', 'x', 'y')`, [users.budi]),
      '42501',
    );
    await rejects(db.query('update public.notifications set read_at = now()'), '42501');
    await as('anon');
    await rejects(db.query('select * from public.notifications'), '42501');
    await rejects(db.query('select public.mark_notifications_read()'), '42501');
  });

  it('marks only the caller’s notifications as read', async () => {
    await asUser('ga');
    const gaUnread = (await one('select count(*)::int as n from public.notifications where read_at is null')).n;
    const someone = (await one('select id from public.notifications limit 1')).id;

    await asUser('dinda');
    assert.equal((await one('select public.mark_notifications_read($1::uuid[]) as n', [[someone]])).n, 0);
    const marked = (await one('select public.mark_notifications_read() as n')).n;
    assert.ok(marked >= 2);
    assert.equal((await one('select count(*)::int as n from public.notifications where read_at is null')).n, 0);

    await asUser('ga');
    assert.equal((await one('select count(*)::int as n from public.notifications where read_at is null')).n, gaUnread);
  });
});

describe('storage', () => {
  it('provisions a public bucket for product photos', async () => {
    await as('postgres');
    assert.deepEqual(await one(`select public from storage.buckets where id = 'supply-images'`), { public: true });
  });
});
