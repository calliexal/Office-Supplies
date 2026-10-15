# Office Supplies Request — Backend (Supabase)

Postgres + RLS + RPC on Supabase. No separate server: the React app talks to Supabase with the
**publishable** key, and the database itself enforces who may read or change what.

```
supabase/
├── migrations/20261012000000_atk_schema.sql   # tables, enums, RLS, grants, RPCs, storage bucket
├── seed.sql                                   # catalogue (13 items from the design) + optional domain allowlist
├── setup.sql                                  # migrations + seed in one file, for the SQL Editor
└── tests/
    ├── supabase-stub.sql                      # auth/storage/roles stand-in for plain Postgres
    └── schema.test.mjs                        # 18 behaviour tests on PGlite (npm run test:db)
```

Frontend side: `src/api/supabase/` (client, adapter, error mapping). It implements the same
`AtkApi` interface as the mock, so screens do not know which backend they talk to.

## Architecture

| Need | Solution | Why |
|---|---|---|
| Read catalogue / own requests | Direct PostgREST reads on `supplies`, `supply_request_list`, `supply_requests` | RLS limits rows to the caller; `supply_request_list` is a `security_invoker` view (aggregates per request, no N+1) |
| Submit a request | RPC `create_supply_request` (`SECURITY DEFINER`) | One transaction: validate → lock stock rows in id order → all-or-nothing stock check → number → insert → decrement. Clients have no INSERT/UPDATE on requests or stock |
| Double click / retry | `Idempotency-Key` per cart + advisory lock | Same key + same items replays the original request; same key + different items is refused (422) |
| Request code `REQ-YYYYMMDD-NNN` | `request_code_counters` upsert | Atomic daily sequence on the Jakarta calendar day |
| General Affair actions | RPC `update_supply_request_status` (admin only) | Enforces `pending → approved → ready_for_pickup → finished`, `pending → rejected` (reason required, ≤ 500 chars, stock returned). Row lock + transition check: a second reviewer on a stale screen gets 409 |
| Review queue | `supply_request_list` (+ `requester_name`, `requester_department`) and RPC `admin_request_summary` | Admins read every row through RLS in one query (no N+1); employees still only see their own. Indexed on `(status, created_at)` |
| Notifications | Table `notifications`, written only by triggers on `supply_requests`; RPC `mark_notifications_read`; Supabase Realtime | New request → every admin; approved / rejected (with reason) / ready for pickup → the requester. Users read only their own rows (RLS) and get them live over the `supabase_realtime` publication; the app also polls every 30 s |
| Roles | `profiles.role` (`employee` / `admin`) + `is_admin()` | Role is never taken from signup metadata; only SQL/admin can change it |
| Accounts | Supabase Auth (email + password) → trigger creates `profiles` | Optional e-mail domain allowlist in `app_allowed_email_domains` |
| Product photos | Public bucket `supply-images` | Anyone with the URL can read; only admins can upload |

### Access matrix

| Object | anon | employee | admin |
|---|---|---|---|
| `profiles` | ✗ | SELECT own | SELECT / UPDATE all |
| `supplies` | ✗ | SELECT active | SELECT all, INSERT, UPDATE, DELETE (unused items only, FK protects history) |
| `supply_requests`, `supply_request_items`, `supply_request_list` | ✗ | SELECT own | SELECT all |
| `app_allowed_email_domains`, `request_code_counters` | ✗ | ✗ | ✗ (SQL Editor only) |
| `create_supply_request()`, `my_request_summary()` | ✗ | ✓ | ✓ |
| `update_supply_request_status()`, `admin_request_summary()` | ✗ | 403 | ✓ |
| `notifications` | ✗ | SELECT own | SELECT own |
| `mark_notifications_read()` | ✗ | own rows | own rows |

Employees **request** items; only admins (General Affair) **approve, reject, prepare and hand over**.
The app hides the Approvals screen from employees, but the rule is enforced here in the database.

TRUNCATE / TRIGGER / REFERENCES are revoked from the API roles (not covered by RLS).

## Database setup (once)

**Option A — SQL Editor (no CLI needed).** Dashboard → SQL Editor → paste the whole of
`supabase/setup.sql` → Run. Run it only on a fresh project (it creates types and tables).

**Option B — Supabase CLI.**

```bash
npx supabase login
npx supabase link --project-ref rjoynczbipbemmkdgkor
npx supabase db push            # applies migrations/
# then run seed.sql in the SQL Editor (or: psql "$DATABASE_URL" -f supabase/seed.sql)
```

**Upgrading a project that already ran `setup.sql`:** run only the migration files you haven't run yet,
in name order, in the SQL Editor. Since 2026-10-15 those are
`supabase/migrations/20261015000000_admin_review.sql` (Approvals screen) and then
`supabase/migrations/20261015010000_notifications.sql` (notifications + Realtime). Run each once.

If you add or change a migration, regenerate `setup.sql`: `npm run db:setup-sql`.

## Accounts

**Quick test accounts (dev only):** `supabase/dev-users.sql` (kept out of git — it contains working
passwords) creates `dinda@example.com` (employee) and `admin@example.com` (admin). Delete them before real use.

1. **Turn off public sign-up.** Authentication → Sign In / Providers → *Allow new users to sign up*: **off**.
   Accounts are created by an admin. (With sign-up on and an empty domain allowlist, anyone holding
   the publishable key could register.) Alternatively, restrict domains:
   `insert into public.app_allowed_email_domains (domain) values ('yourcompany.com');`
2. **Create users.** Authentication → Users → *Add user* → *Create new user*, tick *Auto Confirm User*.
   The trigger creates the profile (name derived from the e-mail, e.g. `dinda.putri@…` → “Dinda Putri”).
3. **Fill in names / positions and promote General Affair** (SQL Editor):

```sql
update public.profiles
set name = 'Dinda Putri Ramadani', position = 'UI/UX Designer', department = 'Design'
where email = 'dinda@yourcompany.com';

update public.profiles set role = 'admin' where email = 'ga@yourcompany.com';
```

## Frontend configuration (`.env`)

```
VITE_USE_MOCK=false
NEXT_PUBLIC_SUPABASE_URL=https://rjoynczbipbemmkdgkor.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`NEXT_PUBLIC_*` and `VITE_*` are both exposed by Vite (`envPrefix`). Only public values belong there;
the app refuses to start if a secret / service_role key is put in them.

Sessions are kept by supabase-js: *Remember Me* → `localStorage`, otherwise `sessionStorage`
(ends when the browser closes). Tokens refresh automatically; an expired or revoked session
sends the user back to the login page.

## API used by the app

| Contract endpoint (API_CONTRACT.md) | Supabase call |
|---|---|
| `POST /auth/login`, `/auth/logout`, `GET /auth/me` | `auth.signInWithPassword`, `auth.signOut({ scope: 'local' })`, `profiles` (own row) |
| `GET /supplies` | `from('supplies').select(...).eq('is_active', true).ilike('name', …).range(…)` with exact count |
| `GET /requests/summary` | `rpc('my_request_summary')` → `{ total, pending, approved, rejected }` |
| `GET /requests` | `from('supply_request_list')` filtered by requester, status, Jakarta-day range, search on code/item names |
| `GET /requests/:id` | `from('supply_requests').select(…, requester:profiles!…(…), items:supply_request_items(…))` |
| `POST /requests` | `rpc('create_supply_request', { p_items: [{ supply_id, quantity }], p_idempotency_key })` → request id |
| `GET /admin/requests/summary` | `rpc('admin_request_summary')` → `{ total, pending, approved, ready_for_pickup, rejected, finished }` |
| `GET /admin/requests` | `from('supply_request_list')` without requester filter; search also matches `requester_name` |
| `PATCH /admin/requests/:id/status` | `rpc('update_supply_request_status', { p_request_id, p_status, p_reason })`, then the detail |
| `GET /notifications` | `from('notifications')` latest 20 + exact count of `read_at is null` |
| `POST /notifications/read` | `rpc('mark_notifications_read', { p_ids })` (`null` = all) |
| live updates | `channel(...).on('postgres_changes', { event: 'INSERT', table: 'notifications', filter: 'recipient_id=eq.<uid>' })` |

### Errors

Business errors use custom SQLSTATEs `PTxxx`, which PostgREST turns into HTTP `xxx`.
`message` is user-facing text, `details` holds per-item field errors as JSON.

| SQLSTATE | App code | When |
|---|---|---|
| PT401 | `UNAUTHENTICATED` | No session |
| PT403 | `FORBIDDEN` | Not admin, profile missing, e-mail domain not allowed |
| PT404 | `NOT_FOUND` | Unknown request |
| PT409 | `INSUFFICIENT_STOCK` / invalid transition | e.g. `{"<supply_id>":"Only 11 pcs of A4 75gsm left."}` |
| PT422 | `VALIDATION_FAILED` | Bad payload, reused idempotency key, missing reject reason |

Supabase Auth errors are mapped in `src/api/supabase/errors.ts` (wrong credentials never say which field was wrong).

## Tests

```bash
npm run test:db     # migrations + seed on PGlite, 28 scenarios: RLS isolation, anon lockout,
                    # stock reservation & rollback, idempotent replay, lifecycle, restock,
                    # admin queue/summary, reviewer race, rejection-reason cap, notifications
npm test            # frontend + error mapping (Vitest)
```

## Operations

- **Catalogue:** Table Editor → `supplies` (set `is_active = false` instead of deleting used items).
  Photos: upload to the `supply-images` bucket and put the object key (or a full URL) in `image_url`.
- **Approve / reject / hand over:** log in as an admin → **Approvals** (sidebar). Employees never see it.
- **Make someone an admin:** `update public.profiles set role = 'admin' where email = '…';` (they must log in again).
- Not built yet: messages (`unread_messages` is unused; `unread_notifications` is superseded by the `notifications` table), password reset flow.
