# Handoff — Loan Manager

Last updated: 2026-08-18

This document captures the current state of the project, what is done, what is
not, and the gotchas you need to know to keep working on it. For setup and usage
see [README.md](README.md).

---

## TL;DR

- **Backend + shared finance engine:** complete and working.
- **Frontend (React client):** complete — all pages built and wired to the API.
- **Database:** PostgreSQL 16 running locally; schema migrated and seeded.
- **Verified:** client typechecks, production build passes, API returns live
  seeded data, and the app renders in the browser.
- **Not done:** authentication, automated tests for the client, CI, deployment.

---

## Current running state (local dev)

- PostgreSQL 16 installed via Homebrew and running as a login service.
- Database `loan_manager` exists, migrated, and seeded with **4 demo customers**
  (active daily/weekly/monthly loans covering on-time, overdue, and partial cases).
- `server/.env` is configured:
  ```
  DATABASE_URL="postgresql://adithya-19308@localhost:5432/loan_manager?schema=public"
  PORT=4000
  CLIENT_ORIGIN="http://localhost:5173"
  ```
- Initial migration committed at `server/prisma/migrations/20260818160457_init/`.

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

---

## Verification performed

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p client/tsconfig.json` | Pass |
| `npm run build --workspace client` (tsc + vite build) | Pass (688 modules) |
| `GET /api/health` | `{"ok":true}` |
| `GET /api/dashboard` | Live seeded figures |
| Client served in browser | 200, `<title>Loan Manager</title>` |

The `@loan/shared` finance logic also has Vitest unit tests: `npm test`.

---

## Gotchas (read before debugging)

1. **Corporate HTTP proxy vs localhost.** The shell has
   `http_proxy=http://127.0.0.1:3128`. `curl http://localhost:PORT` returns
   **503** because curl routes through the proxy; `localhost` is not in
   `no_proxy` (only `127.0.0.1` is). Use `curl --noproxy '*' …` for local
   testing. **Browsers are unaffected** — the app works fine in a browser.
2. **Vite port fallback.** If `5173` is occupied (e.g. another Vite instance),
   Vite silently uses `5174`/`5175`. Check the `[client]` startup log for the
   actual `Local:` URL.
3. **`postgresql@16` is keg-only.** `psql`/`createdb` may not be on PATH. Use
   `export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"` or the full path.
4. **Loan terms lock after payments.** `PUT /loans/:id` throws once any payment
   exists; the loan form disables editing and shows a banner in that case.
5. **Prisma config deprecation warning.** Prisma 6 warns that `package.json#prisma`
   is deprecated (moving to `prisma.config.ts` in Prisma 7). Harmless for now.

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

1. **Authentication & authorization** — the API is currently open. Add login and
   (optionally) roles (admin vs collection agent) before any deployment.
2. **Client tests** — no component/integration tests yet. Consider Vitest +
   React Testing Library for the finance-facing flows (schedule preview, payment
   allocation, capitalization).
3. **Loan detail: document/statement export** — CSV/PDF of a schedule or
   collection sheet (mentioned as a possible feature).
4. **Notifications/reminders** — due/overdue reminders (SMS/email) are not built.
5. **Prepayment / early settlement (foreclosure)** flow.
6. **Bundle size** — the client JS chunk is ~690 kB (Recharts-heavy). Code-split
   the dashboard charts if load time matters.
7. **Deployment** — Dockerfile(s) / CI, and move Prisma config to
   `prisma.config.ts` ahead of Prisma 7.
8. **Migrate `prisma` config** out of `package.json` before upgrading to Prisma 7.

---

## Where to look

- Finance math: `shared/src/finance.ts` (+ `finance.test.ts`).
- Server business logic: `server/src/lib/loanService.ts`, `riskService.ts`.
- API routes: `server/src/routes/*`.
- Client API contract: `client/src/lib/api.ts` + `client/src/lib/types.ts`.
- Page-by-page UI: `client/src/pages/*`.
