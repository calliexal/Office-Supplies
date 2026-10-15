# API Contract — Office Supplies Request (ATK)

Contract between the React frontend and its backend. It is implemented by Supabase (see
[supabase/README.md](./supabase/README.md) for the table/RPC mapping); the generic HTTP adapter
(`src/api/httpAdapter.ts`) still targets it for a custom REST backend. The frontend validates every
response with zod (`src/api/schemas.ts`); a payload that does not match is treated as an error, so
please keep field names and types exactly as below. The in-memory mock (`src/api/mock`) implements
this same contract and can be used as a reference implementation.

## Conventions

| Topic | Rule |
| --- | --- |
| Base path | `/api/v1` (same origin as the web app; in dev Vite proxies `/api` to the backend) |
| Format | JSON, `camelCase` keys, UTF-8 |
| Timestamps | ISO-8601 with offset, e.g. `2026-07-25T02:15:00.000Z`. Frontend renders in `Asia/Jakarta` |
| Date filters | `YYYY-MM-DD`, inclusive, interpreted in `Asia/Jakarta` |
| IDs | Opaque strings. `code` is the human ID shown in the UI (`REQ-20260725-001`) |
| Pagination | Query `page` (1-based, default 1) and `pageSize` (default 20, max 100). Response `{ data: [...], meta: { page, pageSize, total } }` |

### Authentication & security

- **Session cookie**: `POST /auth/login` sets an `HttpOnly; Secure; SameSite=Lax; Path=/` session cookie.
  The frontend never sees or stores a token. `remember: true` → persistent cookie (e.g. 30 days);
  `false` → session cookie (expires on browser close).
- **CSRF (double submit)**: backend also sets a readable cookie `XSRF-TOKEN`. On every
  `POST/PUT/PATCH/DELETE` the frontend echoes it in header `X-XSRF-TOKEN`; reject if they differ.
- **CORS**: not needed when same-origin. If deployed cross-origin, allow the exact web origin with
  `Access-Control-Allow-Credentials: true` (no `*`).
- **Lockout / rate limit**: 5 failed logins → `423 ACCOUNT_LOCKED` for 15 minutes; rate-limit per IP
  → `429 RATE_LIMITED`.
- Any endpoint other than `/auth/*` returning `401` makes the frontend clear its cache and redirect
  to `/login`.

### Error body (all non-2xx)

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Only 14 pcs of A4 75gsm left.", "fields": { "sup_4": "Only 14 pcs of A4 75gsm left." } } }
```

`message` is shown to the user as-is, so write it in plain language. `fields` is optional
(field/item id → message).

| Status | `code` | When |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | No/expired session |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password (do not say which) |
| 403 | `FORBIDDEN` | Authenticated but not allowed (e.g. someone else's request) |
| 404 | `NOT_FOUND` | Unknown id |
| 409 | `INSUFFICIENT_STOCK` | Requested quantity > current stock (`fields` keyed by `supplyId`) |
| 422 | `VALIDATION_FAILED` | Malformed input |
| 423 | `ACCOUNT_LOCKED` | Too many failed logins |
| 429 | `RATE_LIMITED` | Too many requests |
| 5xx | `SERVER_ERROR` | Anything unexpected |

## Types

```ts
type RequestStatus = 'pending' | 'approved' | 'ready_for_pickup' | 'rejected' | 'finished';

type User = {
  id: string; name: string; email: string;
  position: string;            // shown under the name in the header, e.g. "UI/UX Designer"
  department: string;          // shown on the success card ("Departement")
  unreadNotifications: number; // red dot on the bell when > 0
  unreadMessages: number;      // red dot on the message icon when > 0
};
// No avatar/photo field: the UI intentionally shows initials.

type Supply = { id: string; name: string; stock: number; unit: string; imageUrl: string | null };

type RequestListItem = {
  id: string; code: string; createdAt: string;
  itemCount: number;       // number of distinct supplies
  totalQuantity: number;   // sum of quantities
  pickupLocation: string;  // e.g. "General Affair Office"
  status: RequestStatus;
};

type RequestDetail = RequestListItem & {
  requester: { name: string; department: string };
  items: Array<{ supplyId: string; name: string; quantity: number }>; // name = snapshot at submit time
  rejectionReason: string | null;
};
```

## Endpoints

### `POST /auth/login`
Body `{ "email": string, "password": string, "remember": boolean }` → `200 { "user": User }` + cookies.
Email is sent trimmed and lower-cased.

### `POST /auth/logout`
→ `204`. Invalidate the session server-side and clear both cookies.

### `GET /auth/me`
→ `200 { "user": User }` or `401`. Called on app start to restore the session.

### `GET /supplies`
Query: `search?` (case-insensitive contains on name), `inStock?=true` (only `stock > 0`),
`sort?=name_asc|stock_desc` (default `name_asc`), `page?`, `pageSize?` (frontend uses 24)
→ `200 { data: Supply[], meta }`. Out-of-stock items are included unless `inStock=true`
(the UI shows them greyed out).

### `GET /requests/summary`
Counts for the current user → `200 { total, pending, approved, rejected }`.
`approved` = `approved + ready_for_pickup + finished`.

### `GET /requests`
Current user's requests. Query: `search?` (matches `code` or item names), `status?`,
`dateFrom?`, `dateTo?`, `sort?=newest|oldest` (default `newest`, by `createdAt`), `page?`,
`pageSize?` → `200 { data: RequestListItem[], meta }`.
Dashboard calls `?sort=newest&page=1&pageSize=5`.

### `GET /requests/:id`
→ `200 RequestDetail`. `404` if missing, `403` if it belongs to another user.

### `POST /requests`
Header `Idempotency-Key: <uuid>` (required). Body:

```json
{ "items": [ { "supplyId": "sup_1", "quantity": 3 }, { "supplyId": "sup_4", "quantity": 3 } ] }
```

Rules: at least 1 item; each `supplyId` unique; `quantity` integer ≥ 1; all-or-nothing stock check
inside one transaction (lock rows / `SELECT … FOR UPDATE`) → stock is reserved/decremented on
success. Pickup location is assigned by the backend (currently always "General Affair Office").
New status is `pending`; `code` = `REQ-YYYYMMDD-NNN` (Jakarta date, daily sequence).

→ `201 RequestDetail`.
Same `Idempotency-Key` + same body within 24 h → return the original `201` response (no duplicate).
Insufficient stock → `409 INSUFFICIENT_STOCK` with `fields` per offending `supplyId`.

## Status lifecycle (for the GA/admin side)

```
pending ──approve──▶ approved ──prepare──▶ ready_for_pickup ──handover──▶ finished
   └────reject (with reason, stock returned)──▶ rejected
```

## General Affair (admin only)

`User.role` is `"employee" | "admin"`. Employees create requests; only admins review them.
Every endpoint below returns `403 FORBIDDEN` for employees.

### `GET /admin/requests/summary`
→ `200 { total, pending, approved, readyForPickup, rejected, finished }` across all employees
(here `approved` is only the `approved` status, unlike `/requests/summary`).

### `GET /admin/requests`
Same query as `GET /requests` (`search` also matches the requester's name), all employees →
`200 { data: Array<RequestListItem & { requester: { name, department } }>, meta }`.
The Approvals screen defaults to `status=pending&sort=oldest` (first in, first served).

### `PATCH /admin/requests/:id/status`
Body `{ "status": "approved" | "rejected" | "ready_for_pickup" | "finished", "reason"?: string }`.
`reason` is required (1–500 chars after trim) when `status = "rejected"`.
→ `200 RequestDetail` (with `reviewedAt`, `reviewedBy`).
`404` unknown id · `409` the request is no longer in a state that allows this move (e.g. another
admin already decided) · `422` missing/too long reason (`fields.reason`).

`RequestDetail` also carries `reviewedAt: string | null` and `reviewedBy: string | null`
(the reviewer's name; may be `null` for employees).

## Notifications (every role)

Created by the backend only: a new request notifies every admin (`request_submitted`); an admin
approving, rejecting or marking a request ready notifies the requester (`request_approved`,
`request_rejected` with the reason in `body`, `request_ready`).

```ts
type AppNotification = {
  id: string;
  kind: 'request_submitted' | 'request_approved' | 'request_rejected' | 'request_ready';
  title: string;            // "New request REQ-20261015-001", "REQ-20261015-001 approved"
  body: string;
  requestId: string | null;
  createdAt: string;        // ISO 8601
  readAt: string | null;
};
```

### `GET /notifications`
→ `200 { data: AppNotification[] (latest 20, newest first), unread: number }`.

### `POST /notifications/read`
Body `{ "ids": string[] | null }` (`null` = all of the caller's) → `204`. Only the caller's rows change.

Live delivery: the Supabase adapter subscribes to Realtime inserts on `notifications`; the UI also
refetches every 30 s.
