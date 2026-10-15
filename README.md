# Office Supplies Request (Pengajuan ATK) — Frontend

Employee portal for requesting office supplies, built from the Figma file
`YZZ30HvXeOVEqnnGCvbprq` (Log In, Dashboard, Supplies Requests, Requests History + modals).

**Stack:** Vite 5 · React 18 · TypeScript (strict) · Tailwind CSS 3 · React Router 6 · TanStack Query 5 · zod · Vitest + Testing Library.

## Run

```bash
npm install
npm run assets:fetch     # once: downloads logo/illustration/icons from Figma into src/assets/figma
cp .env.example .env     # fill in Supabase URL + publishable key, or VITE_USE_MOCK=true for demo data
npm run dev              # http://localhost:5173
```

Demo login (mock mode): `dinda@example.com` / `Atk#2026`.

| Script | |
| --- | --- |
| `npm run typecheck` | `tsc` strict |
| `npm test` | Vitest (cart rules, mock API contract, date formatting, Supabase error mapping) |
| `npm run test:db` | Migration + seed on PGlite: RLS, stock, idempotency, lifecycle (18 tests) |
| `npm run build` | Type-check + production build |

## Backend (Supabase)

The backend is Supabase (Postgres + RLS + RPC). Setup, access matrix, accounts and errors:
[`supabase/README.md`](./supabase/README.md). In short:

1. Dashboard → SQL Editor → run `supabase/setup.sql` once.
2. Authentication → turn off public sign-up, then *Add user* for each employee.
3. `.env`: `VITE_USE_MOCK=false` + `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Set `VITE_USE_MOCK=true` to run the UI without any backend.

## Structure

```
supabase/         migrations, seed, setup.sql, DB tests (see supabase/README.md)
src/
  api/            schemas (zod = types), Supabase + mock adapters, React Query hooks
  api/supabase/   supabase-js client (remember-me storage), adapter, error mapping
  auth/           AuthProvider (session restore + 401 handling), route guards
  components/     layout (sidebar, header, logout) and ui primitives (Dialog, Button, StatusBadge…)
  features/       auth · dashboard · supplies (catalogue + cart) · requests (history + detail)
  lib/            formatting (Asia/Jakarta), cn
```

## Key decisions

- **One `AtkApi` interface, two adapters.** Screens never know whether they talk to the mock or the
  real backend; switching is an env flag and the unused adapter is removed from the bundle.
- **zod at the boundary.** Contract drift fails loudly in one place instead of rendering `undefined`.
- **Security lives in the database.** The browser only holds the publishable key; RLS limits every
  read to the caller, and stock/status can only change through validated `SECURITY DEFINER` RPCs.
- **Idempotent submit.** One idempotency key per cart; double clicks and retries can't create
  duplicate requests, and a changed cart gets a new key. Stock is re-synced into the cart after a `409`.
- **Native `<dialog>`** for modals (focus trap, Esc, inert background for free) and **native
  `<select>`** for the filter pills (keyboard + mobile pickers).
- **History filters live in the URL** (`?status=pending&date=last7`) — refresh-safe and shareable.
- **No profile photos** (per requirement) — avatars show initials.
- Route-level code splitting; `keepPreviousData` to avoid layout shift while searching.

## Not in this iteration

- "Pengaturan" (Settings) only exists as a grey wireframe in Figma.
- Messages / notifications panels have no design yet — the header shows unread dots only.
- "Forgot Password?" opens an email to General Affair until a reset flow is designed.
