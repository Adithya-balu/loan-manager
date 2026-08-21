# Handoff — Loan Manager

Last updated: 2026-08-21

This document captures the current state of the project, what is done, what is
not, and the gotchas you need to know to keep working on it. For setup and usage
see [README.md](README.md).

---

## TL;DR

- **Backend + shared finance engine:** complete and working.
- **Frontend (React client):** complete — all pages built and wired to the API.
- **Authentication:** implemented (JWT in an httpOnly cookie, ADMIN/AGENT roles).
  All `/api/*` routes except `/api/auth/*` and `/api/health` now require login;
  `/api/config` writes are ADMIN-only. See "Authentication" section below.
- **Database:** this machine has no writable Homebrew install (see Gotchas), so
  local dev now uses a self-contained **embedded Postgres** (no sudo/Docker
  needed) — see "Current running state".
- **Verified end-to-end:** client + server typecheck, production build passes,
  shared unit tests pass, migrations applied, demo data + users seeded, dev
  servers started, and login verified in an actual browser (Playwright) —
  dashboard renders live seeded data as ADMIN.
- **Not done:** automated tests for the client, CI, deployment.

---

## Authentication (new)

- **Model:** `User` (`id`, `name`, `email` unique, `passwordHash`, `role` —
  `ADMIN` | `AGENT`) added to `server/prisma/schema.prisma`. Migration at
  `server/prisma/migrations/20260819000000_add_users/migration.sql` (hand-written
  since `prisma migrate dev` needed a live DB; it has since been applied
  successfully via `prisma migrate deploy` against the embedded Postgres).
- **Server:** `server/src/lib/auth.ts` (bcrypt hashing, JWT sign/verify),
  `server/src/middleware/auth.ts` (`requireAuth`, `requireRole`),
  `server/src/routes/auth.ts` (`POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`, `POST/GET /api/auth/users` — ADMIN-only user provisioning).
  Session token is a JWT in an httpOnly, `sameSite=lax` cookie (`lm_token`,
  8h expiry); `secure` flag turns on automatically when `NODE_ENV=production`.
  Requires `JWT_SECRET` in `server/.env` (added to `.env.example` too).
- **Client:** `client/src/context/AuthContext.tsx` (session state + login/logout),
  `client/src/pages/auth/LoginPage.tsx`, `client/src/components/ProtectedRoute.tsx`
  (redirects to `/login` when unauthenticated; supports a `roles` prop for
  role-gating — used to hide `/settings` from non-admins). `lib/api.ts` sends
  `credentials: 'include'` on every request and fires a custom `auth:expired`
  window event on any 401 outside the login/me flow so the app forces a
  re-login on session expiry.
- **Seeded users** (via `npm run seed --workspace server`):
  `admin@loanmanager.local` / `admin123` (ADMIN), `agent@loanmanager.local` /
  `agent123` (AGENT). **Change/remove these before any real deployment.**
- **Not done on top of this:** password reset flow, account lockout/rate
  limiting on login, audit logging of who performed actions.

---

## Current running state (local dev)

- **This machine has no writable Homebrew** (`/opt/homebrew` is owned by
  `sysadmin`, and `sudo` needs an interactive password that isn't available to
  an automated shell). Instead of system Postgres, local dev uses
  **`embedded-postgres`** (npm package, added as a `server` devDependency) —
  it downloads a real Postgres binary into `node_modules` and runs it
  entirely in user space, no sudo/Docker required.
  - Start it: `node server/scripts/dev-db.mjs` (keep it running in a
    background/async terminal — it holds the process open and handles
    `SIGINT`/`SIGTERM` to shut the cluster down cleanly).
  - Data persists in `server/.pgdata` (gitignored). First run auto-creates the
    `loan_manager` database on port **5433** (not the standard 5432, to avoid
    clashing with any system Postgres).
  - Then apply migrations/seed as usual: `npm run db:migrate` (or
    `npx prisma migrate deploy` if `db:migrate`'s `migrate dev` prompts) and
    `npm run db:seed` from the repo root.
  - If you later get a real system Postgres working (see Gotchas #1), just
    point `DATABASE_URL` back at it — nothing else needs to change.
- `server/.env` currently has:
  ```
  DATABASE_URL="postgresql://postgres:postgres@localhost:5433/loan_manager?schema=public"
  PORT=4000
  CLIENT_ORIGIN="http://localhost:5173"
  JWT_SECRET="<random 96-char hex string, already generated in server/.env>"
  ```
- Initial migration committed at `server/prisma/migrations/20260818160457_init/`.
  Auth migration (not yet applied here) at
  `server/prisma/migrations/20260819000000_add_users/`.

To start fresh in a new shell: `npm run dev` from the repo root.

---

## What was built (this handoff's work)

The entire React client under `client/src/` was created from scratch against the
pre-existing API. High-level map:

- **Bootstrap:** `main.tsx`, `index.css` (Tailwind v4), `App.tsx` (routes).
- **Data layer:** `lib/api.ts` (typed fetch client), `lib/types.ts` (enriched
  response types on top of `@loan/shared`), `lib/format.ts` (INR/date helpers),
  `hooks/useApi.ts`.
- **UI kit:** `components/ui/*` (Button, Card/StatCard, Badge/StatusBadge/
  RiskBadge, Field/Input/Select/TextArea, Table, Modal/ConfirmDialog, Toast,
  Feedback), plus `Layout`, `PageHeader`, and a reusable `PaymentModal`.
- **Pages:** Dashboard; Customers (list/form/detail + documents); Loans
  (list/form-with-live-preview/detail-with-actions); Repayments (list/form);
  Today's Collection; Action Required; Settings.

Then the DB was migrated + seeded and the app verified end-to-end.

**2026-08-19 session:** added the full auth layer described above (schema,
middleware, routes, login page, protected routes). `npm install` at the repo
root, `npx tsc --noEmit` for both `server` and `client`, `npm run build`, and
`npm test` (shared) were all re-run and pass. Could **not** verify the login
flow against a live DB or in a browser on this machine in that session—
Postgres wasn't installed and `/opt/homebrew` wasn't writable.

**2026-08-21 session:** unblocked the DB. Since Homebrew still isn't writable
here (sudo needs an interactive password, still unavailable), switched local
dev to `embedded-postgres` (see "Current running state"). Applied both
migrations with `prisma migrate deploy`, reseeded, started `npm run dev`, and
verified the whole flow in a real browser: `/login` renders, logging in as
`admin@loanmanager.local` redirects to `/` and the dashboard renders live
seeded figures with the ADMIN-only Settings nav item visible.

---

## Verification performed

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p client/tsconfig.json` | Pass |
| `npx tsc --noEmit -p server/tsconfig.json` | Pass |
| `npm run build` (shared + server + client) | Pass (691 modules) |
| `npm test` (shared Vitest suite) | Pass (12 tests) |
| `GET /api/health` | `{"ok":true}` |
| `POST /api/auth/login` (admin) | Returns user JSON + sets session cookie |
| `GET /api/dashboard` (authenticated) | Live seeded figures |
| Browser: login → dashboard | Verified via Playwright screenshot, renders correctly |

The `@loan/shared` finance logic also has Vitest unit tests: `npm test`.

---

## Gotchas (read before debugging)

1. **No writable Homebrew on this machine — use `embedded-postgres` instead.**
   `/opt/homebrew` is owned by `sysadmin`; `sudo chown -R "$(whoami)" /opt/homebrew`
   needs an interactive password that hasn't been available in this environment
   (confirmed via `sudo -n true` failing). Rather than wait on that, local dev
   now runs a self-contained Postgres via the `embedded-postgres` npm package —
   see "Current running state" for how to start/use it. If Homebrew access is
   fixed later, you can switch back to a system Postgres by just changing
   `DATABASE_URL`.
2. **Corporate HTTP proxy vs localhost.** The shell has
   `http_proxy=http://127.0.0.1:3128`. `curl http://localhost:PORT` returns
   **503** because curl routes through the proxy; `localhost` is not in
   `no_proxy` (only `127.0.0.1` is). Use `curl --noproxy '*' …` for local
   testing. **Browsers are unaffected** — the app works fine in a browser.
3. **Vite port fallback.** If `5173` is occupied (e.g. another Vite instance),
   Vite silently uses `5174`/`5175`. Check the `[client]` startup log for the
   actual `Local:` URL.
4. **`postgresql@16` is keg-only.** `psql`/`createdb` may not be on PATH. Use
   `export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"` or the full path.
5. **Loan terms lock after payments.** `PUT /loans/:id` throws once any payment
   exists; the loan form disables editing and shows a banner in that case.
6. **Prisma config deprecation warning.** Prisma 6 warns that `package.json#prisma`
   is deprecated (moving to `prisma.config.ts` in Prisma 7). Harmless for now.
7. **All `/api/*` routes now require login** (except `/api/auth/*` and
   `/api/health`). If you're testing with `curl`, log in first and reuse the
   cookie jar: `curl -c cookies.txt -X POST .../api/auth/login -d '...' ...`
   then `curl -b cookies.txt .../api/dashboard`.

---

## Design decisions already baked in (do not re-litigate without reason)

- Interest quoted as an **annual rate**; converted to the repayment period.
- Penalty model = **capitalize unpaid amount into principal + re-amortize** the
  remaining installments (same count). No separate late-fee entity.
- Payments are a **free-amount ledger**, auto-allocated to the oldest open
  installments; overpayment credits the final open installment.
- Grace + default thresholds measured in **days**, per loan type, overridable
  per loan.
- All default/capitalization actions are **user-triggered** from Action Required
  — never automatic.
- Currency INR / locale `en-IN`.

---

## Not done / suggested next steps

Roughly in priority order:

1. **Verify auth end-to-end on a real DB** — install/migrate/seed Postgres (see
   "Current running state"), then confirm login, cookie persistence, role
   gating (`/settings`), and session-expiry redirect in a browser.
2. **Auth hardening** — rate-limit `/api/auth/login`, add password reset,
   consider audit logging of who performed loan/payment actions.
3. **Client tests** — no component/integration tests yet. Consider Vitest +
   React Testing Library for the finance-facing flows (schedule preview, payment
   allocation, capitalization) and the new login/protected-route flow.
4. **Loan detail: document/statement export** — CSV/PDF of a schedule or
   collection sheet (mentioned as a possible feature).
5. **Notifications/reminders** — due/overdue reminders (SMS/email) are not built.
6. **Prepayment / early settlement (foreclosure)** flow.
7. **Bundle size** — the client JS chunk is ~690 kB (Recharts-heavy). Code-split
   the dashboard charts if load time matters.
8. **Deployment** — Dockerfile(s) / CI, and move Prisma config to
   `prisma.config.ts` ahead of Prisma 7.
9. **Migrate `prisma` config** out of `package.json` before upgrading to Prisma 7.

---

## Where to look

- Finance math: `shared/src/finance.ts` (+ `finance.test.ts`).
- Server business logic: `server/src/lib/loanService.ts`, `riskService.ts`.
- Auth: `server/src/lib/auth.ts`, `server/src/middleware/auth.ts`,
  `server/src/routes/auth.ts`, `client/src/context/AuthContext.tsx`,
  `client/src/components/ProtectedRoute.tsx`, `client/src/pages/auth/LoginPage.tsx`.
- API routes: `server/src/routes/*`.
- Client API contract: `client/src/lib/api.ts` + `client/src/lib/types.ts`.
- Page-by-page UI: `client/src/pages/*`.
