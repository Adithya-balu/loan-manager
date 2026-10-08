# Handoff — Loan Manager

Last updated: 2026-10-08

This document captures the current state of the project, what is done, what is
not, and the gotchas you need to know to keep working on it. For setup and usage
see [README.md](README.md).

---

## TL;DR

- **Backend + shared finance engine:** complete and working.
- **Frontend (React client):** complete — all original pages plus reports,
  company profile, account/password, and full dark/light theme.
- **Authentication:** JWT in an httpOnly cookie, ADMIN/AGENT roles. Password
  change is implemented (`POST /api/auth/change-password`). Password *reset*,
  lockout, and audit logging are still not done.
- **2026-10-07/08 feature expansion (this session):** richer customer/loan
  records, inline customer create from the loan form, loan documents,
  foreclosure/settlement, reports, company branding, password change, a
  revenue-only dashboard chart, and class-based dark mode.
- **Database:** this environment currently uses a local Postgres on **5432**
  (`DATABASE_URL` in `server/.env`). The embedded-Postgres fallback (port
  **5433**) is still available if Homebrew/system Postgres is not writable —
  see "Current running state".
- **Dev servers:** `npm run dev` from the repo root. Server scripts now load
  `server/.env` (`tsx watch --env-file=.env`). API: http://localhost:4000,
  client: http://localhost:5173 (Vite falls back to 5174+ if occupied).
- **Not done:** the follow-ups listed under "Next session" below, plus
  client tests, CI, and deployment.

---

## How to start

```bash
# from repo root
npm run dev
```

- API health: `curl --noproxy '*' http://localhost:4000/api/health`
- Login: `admin@loanmanager.local` / `admin123` (ADMIN) or
  `agent@loanmanager.local` / `agent123` (AGENT). Change these before any
  real deployment.
- If the server dies with `JWT_SECRET environment variable is required`, the
  process is not loading `server/.env`. The `dev` / `start` scripts in
  `server/package.json` now pass `--env-file=.env`.

Migrations (hand-written, apply with deploy — `migrate dev` prompts):

```bash
cd server && npx prisma migrate deploy
npx prisma db seed    # loads .env; prefer this over `npm run db:seed`
```

---

## What shipped in this expansion

Confirmed product decisions:

- **Payment Mode on a loan** = disbursement mode (how principal was paid out).
- **Guarantor** is optional and **per loan**, not per customer.
- **Pre-close** computes a quote, records one settlement payment, and marks
  the loan `CLOSED`.
- **Reports** are in-app views (no CSV/PDF export yet).
- **Company profile** is a singleton, ADMIN-only to edit, shown in the sidebar.
- **Theme** is persisted in `localStorage` (`lm_theme`), not on the User row.

### Data model (`server/prisma/schema.prisma`)

Migration: `server/prisma/migrations/20261007000000_features/migration.sql`
(already applied on this machine).

- `Customer`: `photoUrl`, `aadhaar`, `location`
- `Loan`: `disbursementMode` (default CASH), `guarantorName/Mobile/Relation/Address`, `documents`
- `LoanDocument` — same shape as `CustomerDocument`, cascade-delete with the loan
- `CompanyProfile` singleton (`id = "default"`)

### Backend

- Customers: 10-digit mobile + optional 12-digit Aadhaar + location;
  `POST /customers/:id/photo`. List/detail return the new fields.
- Loans: disbursement mode + guarantor on create/update;
  `POST/DELETE /loans/:id/documents`; detail includes `documents`.
- Settlement: `computeSettlement` + `settleLoan` in
  `server/src/lib/loanService.ts`.
  - Quote = overdue remaining + unpaid future principal + daily-pro-rated
    interest on remaining principal (`annualRatePct/100/365 * days`).
  - `GET /loans/:id/settlement` (quote as of **server today**)
  - `POST /loans/:id/settlement` `{ date, mode }` records the payment and closes.
- Dashboard trend now includes `revenue` (interest on installments `PAID` in
  that month). The UI chart is revenue-only.
- Company: `GET /api/company` (any auth), `PUT /api/company` +
  `POST /api/company/logo` (ADMIN). Shared multer helper:
  `server/src/lib/upload.ts` (`UPLOADS_DIR`).
- Auth: `POST /api/auth/change-password` (verify current, min 8 chars).

### Frontend

- Customer form/detail: photo, Aadhaar, location, 10/12-digit validation.
- Loan form: "+ New" customer modal (`CustomerQuickCreate`), disbursement
  mode, optional guarantor fields (always visible today — see follow-up #3).
- Loan detail: documents card, guarantor/disbursement, "Pre-close / Settle"
  in the page header (see follow-up #7).
- Dashboard: Revenue line chart (last 6 months).
- Reports (`/reports`): Collection, Outstanding, Customer statement, Revenue.
- Company (`/company`, ADMIN): name/logo/address/phone/email.
- Account (`/account`): change password; sidebar user name links here.
- Theme: `ThemeContext` + toggle in the sidebar; Tailwind v4
  `@custom-variant dark`; chart strokes use `--chart-grid` / `--chart-axis`.

---

## Next session (found while using the app)

These are the remaining items from review. Implement in roughly this order.

### 1. Refresh on saving the Company Profile

`CompanyProfilePage` calls `reload()` after save/logo upload, so the **form**
updates. The **sidebar** does not: `Layout` loads company once via
`useApi(() => api.getCompany(), [])` and never hears about the save.

Fix options (pick one):

- Lift company into a small `CompanyContext` (same pattern as `AuthContext`)
  and have the profile page write into it after save.
- Or dispatch a window event (`company:updated`) that `Layout` listens for
  and re-fetches.

Also worth checking: after a logo upload the sidebar `<img src={logoUrl}>`
may stay cached if the URL does not change. Bust with `?t=updatedAt` if needed.

### 2. Tamil language support

Not started. App copy is hardcoded English. Suggested approach:

- Add a small `i18n` context (`en` | `ta`) persisted in `localStorage`.
- Extract user-visible strings from pages + UI kit into
  `client/src/i18n/en.ts` and `ta.ts`.
- Keep numbers/currency as `en-IN` / INR unless you also want Tamil
  number formatting.
- Do not translate customer-entered data (names, notes, document labels).

Scope is large (every page). Start with nav + login + dashboard + loan
create/detail if you want a first slice.

### 3. Hide guarantor fields behind a toggle

On `LoanFormPage` the guarantor block is always expanded. Default it
**collapsed**. Show the four fields only when the user opens "Add guarantor
details". If any guarantor field is already filled (edit flow), start
expanded.

### 4. Loans page — filter by type

`LoansListPage` filters by **status** and customer search only. Add a
frequency filter (`DAILY` / `WEEKLY` / `MONTHLY` / All) next to the status
`<Select>`. Client-side is enough; `listLoans()` already returns `frequency`.

### 5. Unique customer number error handling

`Customer.customerNumber` is `@unique`. Creating/updating with a duplicate
throws a raw Prisma unique-constraint error that surfaces as a generic 400
toast. Catch `P2002` in the customers route (or the central error handler)
and return a clear `"Customer number already exists"` (and the same for
email on users). Mirror that string in the customer form.

### 7. Move Pre-close / Settle onto the Repayment Schedule

The button currently lives in the `PageHeader` actions on `LoanDetailPage`.
Put it on the **Repayment Schedule** card header (or as a row under the
schedule totals) so it sits with the numbers it acts on. Keep it visible
only while `status === 'ACTIVE'`.

### 8. Recalculate pre-close / settle when the date changes

**Yes.** Today `GET /loans/:id/settlement` always uses server `today()`.
The date field in `SettlementModal` is only sent on **confirm**, so
changing it does not change the quote (interest-to-date depends on the
as-of date).

Do this:

- Change `GET /loans/:id/settlement?date=YYYY-MM-DD` (or POST a quote
  endpoint) and pass that date into `computeSettlement(..., ref)`.
- In the modal, refetch the quote whenever `date` changes (debounce ~300ms).
- Keep confirm using the same date that produced the displayed quote.

### 9. Delete / edit repayment — already on `master` (pre-rebase)

`PUT /payments/:id` and `DELETE /payments/:id` plus loan-detail / payments
list UI landed in `fae7df0` before this rebase. Treat this item as **done**
unless you find a remaining edge case (e.g. editing a payment that is not
the latest, or settlement payments).

### 10. Repayments should be collected in order

`recordPayment` can start at a caller-chosen `installmentId`, which lets a
collector skip an older open installment. Product intent: always allocate
from the **oldest open** installment.

- Ignore `installmentId` for allocation order (or reject if it is not the
  first open one).
- On Today's Collection / loan schedule, disable **Collect** on later
  installments while an earlier one is still open (show a hint).
- Settlement / foreclosure stays a separate path and may close everything
  at once.

---

## Authentication (existing)

- **Model:** `User` (`id`, `name`, `email` unique, `passwordHash`, `role` —
  `ADMIN` | `AGENT`).
- **Server:** `server/src/lib/auth.ts`, `server/src/middleware/auth.ts`,
  `server/src/routes/auth.ts` (`login`, `logout`, `me`, `change-password`,
  ADMIN `users`).
- Session: JWT cookie `lm_token`, 8h, `sameSite=lax`, `secure` in
  production. Requires `JWT_SECRET` in `server/.env`.
- **Client:** `AuthContext`, `LoginPage`, `ProtectedRoute` (`/settings` and
  `/company` are ADMIN-only). `lib/api.ts` sends `credentials: 'include'`
  and fires `auth:expired` on 401.

---

## Current running state (local dev)

Two Postgres options:

1. **System Postgres on 5432** (what this machine used last):
   `DATABASE_URL="postgresql://adithya-19308@localhost:5432/loan_manager?schema=public"`
2. **Embedded Postgres on 5433** if Homebrew is not writable:
   `node server/scripts/dev-db.mjs` (keeps the process open; data in
   `server/.pgdata`, gitignored). Then point `DATABASE_URL` at
   `postgresql://postgres:postgres@localhost:5433/loan_manager?schema=public`.

`server/.env` also needs `PORT=4000`, `CLIENT_ORIGIN="http://localhost:5173"`,
and `JWT_SECRET`.

Applied migrations:

- `20260818160457_init`
- `20260819000000_add_users`
- `20261007000000_features`

---

## Verification performed (2026-10-07/08)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` client + server | Pass |
| `npm run build` | Pass (~697 modules) |
| `npm test` (shared Vitest) | Pass (12 tests) |
| `GET /api/health` | `{"ok":true}` |
| Login as admin | Cookie + user JSON |
| `GET /api/company` | Auto-creates singleton |
| Dashboard trend | Includes `revenue` |
| `GET /loans/:id/settlement` | Returns breakdown |
| `POST /loans/:id/settlement` | Payment recorded, loan `CLOSED` |
| Customer create, bad mobile | 400, 10-digit message |
| Customer create + Aadhaar/location | 201 |
| Change password + revert | `{"ok":true}` |

Demo data was reseeded after the settlement smoke test.

---

## Gotchas (read before debugging)

1. **Homebrew may not be writable on this machine.** Use embedded Postgres
   (port 5433) if system Postgres is unavailable. See above.
2. **Corporate HTTP proxy vs localhost.** `curl http://localhost:PORT` can
   return **503** because curl goes through `http_proxy`. Use
   `curl --noproxy '*' …`. Browsers are fine.
3. **Vite port fallback.** If 5173 is taken, Vite uses 5174/5175. Read the
   `[client]` log for the real `Local:` URL.
4. **Loan terms lock after payments.** `PUT /loans/:id` throws once any
   payment exists; the form disables editing.
5. **Prisma `package.json#prisma` deprecation.** Harmless until Prisma 7;
   move to `prisma.config.ts` before upgrading.
6. **All `/api/*` require login** except `/api/auth/*` and `/api/health`.
7. **`tsx` / `node` do not load `.env` unless asked.** Dev/start scripts
   now pass `--env-file=.env`. `npm run db:seed` from the root may still
   fail; use `cd server && npx prisma db seed`.
8. **Compiled `npm start` path** is `dist/src/index.js` (not `dist/index.js`).
   Running the built server also needs `@loan/shared` resolved; prefer
   `npm run dev` (`tsx`) for local work.
9. **Settlement quote ignores the modal date** until follow-up #8 is done.
10. **Customer number uniqueness** is a raw Prisma error until follow-up #5.

---

## Design decisions already baked in (do not re-litigate without reason)

- Interest quoted as an **annual rate**; converted to the repayment period.
- Penalty model = **capitalize unpaid amount into principal + re-amortize**
  the remaining installments (same count). No separate late-fee entity.
- Payments are a **free-amount ledger**, auto-allocated to open installments;
  overpayment credits the final open installment. Follow-up #10 will force
  oldest-first order.
- Grace + default thresholds measured in **days**, per loan type, overridable
  per loan.
- All default/capitalization actions are **user-triggered** from Action
  Required — never automatic.
- Currency INR / locale `en-IN`.
- Settlement interest-to-date is a daily pro-rate on remaining principal;
  the formula lives in `computeSettlement`.

---

## Older backlog (still valid, lower priority)

- Auth hardening: rate-limit login, password reset, audit log of who
  recorded payments / settlements.
- Client tests (Vitest + RTL) for schedule preview, payment allocation,
  capitalization, settlement, login/protected routes.
- CSV/PDF export of statements / collection sheets.
- SMS/email due reminders.
- Bundle size (~720 kB client chunk, Recharts-heavy) — code-split charts.
- Deployment: Dockerfile(s) / CI; Prisma 7 config move.

---

## Where to look

- Finance math: `shared/src/finance.ts` (+ `finance.test.ts`).
- Server business logic: `server/src/lib/loanService.ts` (`recordPayment`,
  `computeSettlement`, `settleLoan`), `riskService.ts`.
- Uploads: `server/src/lib/upload.ts`, served at `/uploads` behind auth.
- Auth: `server/src/lib/auth.ts`, `server/src/middleware/auth.ts`,
  `server/src/routes/auth.ts`, `client/src/context/AuthContext.tsx`.
- Company: `server/src/routes/company.ts`,
  `client/src/pages/company/CompanyProfilePage.tsx`, sidebar in `Layout.tsx`.
- Theme: `client/src/context/ThemeContext.tsx`, `client/src/index.css`.
- API contract: `client/src/lib/api.ts` + `client/src/lib/types.ts`.
- Page-by-page UI: `client/src/pages/*`.
