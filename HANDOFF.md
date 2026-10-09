# Handoff — Loan Manager

Last updated: 2026-10-08 (second pass)

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
- **Not done:** Tamil for the remaining pages (see "Next session"), plus
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
  mode, optional guarantor fields (collapsed behind a toggle).
- Loan detail: documents card, guarantor/disbursement, "Pre-close / Settle"
  on the Repayment Schedule card header.
- Dashboard: Revenue line chart (last 6 months).
- Reports (`/reports`): Collection, Outstanding, Customer statement, Revenue.
- Company (`/company`, ADMIN): name/logo/address/phone/email.
- Account (`/account`): change password; sidebar user name links here.
- Theme: `ThemeContext` + toggle in the sidebar; Tailwind v4
  `@custom-variant dark`; chart strokes use `--chart-grid` / `--chart-axis`.

---

## Follow-ups completed (2026-10-08, second pass)

| # | Item | Where |
| --- | --- | --- |
| 1 | Sidebar refreshes after Company save / logo upload (`company:updated` window event). Logo filenames are unique per upload, so no cache-busting needed. | `CompanyProfilePage`, `Layout` |
| 3 | Guarantor block collapsed by default ("Add guarantor details"); starts expanded when editing a loan that already has guarantor data. | `LoanFormPage` |
| 4 | Loans list has a frequency filter (All / Daily / Weekly / Monthly), client-side. | `LoansListPage` |
| 5 | Prisma `P2002` mapped in the central error handler → **409** `"Customer number already exists"` / `"A user with that email already exists"`. Strings live in `@loan/shared` (`DUPLICATE_CUSTOMER_NUMBER`, `DUPLICATE_USER_EMAIL`); the customer form shows it inline on the field. | `server/src/index.ts`, `shared/src/types.ts`, `CustomerFormPage` |
| 7 | "Pre-close / Settle" moved to the Repayment Schedule card header (ACTIVE only). | `LoanDetailPage` |
| 8 | `GET /loans/:id/settlement?date=YYYY-MM-DD`; modal re-quotes 300 ms after the date changes; confirm sends `quote.asOf`. `settleLoan` now computes the quote **as of the settlement date** (not server today) and rejects dates before disbursement. | `routes/loans.ts`, `loanService.ts`, `SettlementModal` |
| 10 | Allocation always starts at the oldest open installment (also on replay after edit/delete). `recordPayment` rejects an `installmentId` that is not the oldest open one (400, "collect installment #N first"). UI disables Collect on later installments with a hint; Today's Collection items carry `blockedBySequence` so this works even when the overdue row is hidden. | `loanService.ts`, `routes/actions.ts`, `LoanDetailPage`, `TodayCollectionPage` |
| 2 | **Tamil — first slice.** See below. | `client/src/i18n/*` |

### Tamil (i18n) — what exists and what's left

- `client/src/i18n/en.ts` is the source dictionary (flat keys, `{placeholder}`
  interpolation). `ta.ts` is typed `Record<MessageKey, string>`, so a missing
  Tamil key fails `tsc`.
- `I18nProvider` / `useI18n()` → `t(key, vars)` and `tNode(key, vars)` (for
  placeholders that are React nodes, e.g. a bold amount). Language persisted
  in `localStorage` (`lm_lang`), sets `<html lang>`. Switcher is in the
  sidebar footer (replaced the static "INR · en-IN" label).
- Translated: sidebar/nav, login, dashboard, loan form, loan detail, and the
  shared UI kit (status/risk badges, loading/retry, confirm dialog buttons).
- **Not yet translated:** customers (list/detail/form/quick-create), loans
  list, repayments, Today's Collection, Action Required, reports, company,
  account, settings, Payment/Settlement modals, `FREQUENCY_LABEL` in
  untranslated pages. Server error messages are still English.
- Numbers/currency stay `en-IN`; only the dashboard month labels switch to
  `ta-IN`. Customer-entered data is never translated.
- The Tamil copy was machine-authored — **have a native speaker review
  `ta.ts`** (especially financial terms: அசல், நிலுவை, ஜாமீன்தாரர், தவறியது).

## Next session

1. Finish Tamil across the remaining pages (list above).
2. Older backlog below.

Verified this pass: client + server `tsc`, `npm run build`, `npm test`
(12 pass); API smoke tests for duplicate customer number (409), settlement
quote by date + invalid date (400), out-of-order payment rejected (400),
in-order payment accepted, `blockedBySequence` on Today's Collection. UI
changes were type-checked and built but **not clicked through in a browser**.

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
9. **`npm install` after pulling.** `@vercel/blob` is a declared dependency
   (client + server); `tsc` fails with "Cannot find module '@vercel/blob'" if
   `node_modules` predates the Vercel commit.
10. **Payment order is enforced.** A client sending a later `installmentId`
    gets a 400; omit `installmentId` to just allocate oldest-first.

---

## Design decisions already baked in (do not re-litigate without reason)

- Interest quoted as an **annual rate**; converted to the repayment period.
- Penalty model = **capitalize unpaid amount into principal + re-amortize**
  the remaining installments (same count). No separate late-fee entity.
- Payments are a **free-amount ledger**, auto-allocated to open installments;
  overpayment credits the final open installment. Allocation is always
  oldest-open-first.
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
