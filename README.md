# Loan Manager

A loan tracking application for managing loans and repayments. It supports
**daily / weekly / monthly** repayment schedules, **flat-rate** and
**reducing-balance** interest, partial payments, penalty capitalization with
re-amortization, and a per-customer risk score derived from repayment behaviour.

- **Client** — React 19 + Vite + Tailwind CSS v4 + React Router 7 + Recharts
- **Server** — Express + Prisma (PostgreSQL)
- **Shared** — a typed finance library (`@loan/shared`) used by both sides

---

## Features

| Area | What it does |
| --- | --- |
| Dashboard | KPIs (disbursed, outstanding, interest, overdue, collection efficiency), disbursed-vs-collected trend, portfolio mix, top-risk customers, action-required banner |
| Customers | List with live risk + outstanding, create/update, detail with mini-dashboard, loans, repayment history, and KYC document upload |
| Loans | List with status filter, create/update with a **live repayment-schedule preview**, detail with the enriched schedule, payments, and lifecycle actions |
| Repayments | List of all collections, and a record-payment form (allocated to oldest open installments first) |
| Today's Collection | Installments due today (plus optional overdue carry-overs) with a one-click collect action |
| Action Required | Overdue installments past their grace window (capitalize / default) and loans eligible to be defaulted |
| Settings | System-wide grace days and default-threshold days per loan type (overridable per loan) |

---

## Tech stack

- **Monorepo** via npm workspaces: `shared`, `server`, `client`
- **Node** 18+ recommended
- **PostgreSQL** 14+ (developed against 16)
- **Prisma** 6 ORM

---

## Prerequisites

- Node.js and npm
- A running PostgreSQL instance

On macOS with Homebrew:

```bash
brew install postgresql@16
brew services start postgresql@16
# postgresql@16 is keg-only; if psql/createdb aren't on PATH:
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
```

> **No Homebrew/sudo access?** Use the bundled self-contained Postgres instead
> — no system install or elevated permissions required:
> ```bash
> npm install --workspace server   # pulls in embedded-postgres
> node server/scripts/dev-db.mjs   # starts a local cluster on port 5433, leave it running
> ```
> Then point `DATABASE_URL` in `server/.env` at
> `postgresql://postgres:postgres@localhost:5433/loan_manager?schema=public`
> and continue with the setup steps below as normal.

---

## Setup

From the repository root:

```bash
# 1. Install all workspace dependencies
npm install

# 2. Create the database (Homebrew Postgres uses your macOS user as a superuser)
createdb loan_manager

# 3. Configure the server environment
cp server/.env.example server/.env
# Edit server/.env and set DATABASE_URL, e.g.
#   postgresql://<your-user>@localhost:5432/loan_manager?schema=public

# 4. Apply the schema and generate the Prisma client
npm run db:migrate      # prisma migrate dev

# 5. Seed demo data (4 customers with varied loan scenarios)
npm run db:seed
```

`server/.env` keys:

```
DATABASE_URL="postgresql://USER@localhost:5432/loan_manager?schema=public"
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
JWT_SECRET="a long random string"
```

After seeding, log in with one of the demo accounts:

| Email | Password | Role |
| --- | --- | --- |
| `admin@loanmanager.local` | `admin123` | ADMIN |
| `agent@loanmanager.local` | `agent123` | AGENT |

**Change or remove these before any real deployment.**

---

## Running

```bash
npm run dev        # starts API (:4000) and client (:5173) together
# or individually:
npm run dev:server
npm run dev:client
```

- Client: http://localhost:5173 (Vite falls back to 5174, 5175, … if the port is taken — watch the startup log)
- API: http://localhost:4000 (`/api/health` returns `{"ok":true}`)

The Vite dev server proxies `/api` and `/uploads` to the API, so you only need
to open the client URL.

> **Behind a corporate HTTP proxy?** If `curl http://localhost:5173` returns
> `503` but the app works in the browser, your shell's `http_proxy` is
> intercepting localhost. Test with `curl --noproxy '*' http://localhost:5173`.
> Browsers are unaffected.

---

## Useful scripts (root `package.json`)

| Script | Description |
| --- | --- |
| `npm run dev` | Run server + client concurrently |
| `npm run build` | Build shared, server, and client |
| `npm test` | Run the `@loan/shared` finance unit tests (Vitest) |
| `npm run db:migrate` | `prisma migrate dev` (create + apply migrations) |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Reset the database and re-seed |

Typecheck the client only: `npx tsc --noEmit -p client/tsconfig.json`.

---

## Project structure

```
loan-manager/
├── shared/                 # @loan/shared — types + finance engine
│   └── src/
│       ├── types.ts        # domain interfaces (Customer, Loan, Installment, …)
│       ├── finance.ts      # schedule generation, re-amortization, risk scoring
│       └── finance.test.ts # Vitest unit tests
├── server/                 # Express + Prisma API
│   ├── prisma/
│   │   ├── schema.prisma   # DB models + enums
│   │   ├── migrations/     # migration history
│   │   └── seed.ts         # demo data
│   └── src/
│       ├── index.ts        # Express app entry
│       ├── lib/            # loanService, riskService, dates, http
│       └── routes/         # customers, loans, payments, actions, dashboard, config
└── client/                 # React SPA (Vite)
    └── src/
        ├── main.tsx, App.tsx
        ├── lib/            # api client, response types, formatting
        ├── hooks/          # useApi
        ├── components/     # Layout, PaymentModal, ui/* primitives
        └── pages/          # dashboard, customers, loans, payments, collections, actions, settings
```

---

## API reference

Base URL: `/api`

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Log in; sets an httpOnly session cookie |
| POST | `/auth/logout` | Clear the session cookie |
| GET | `/auth/me` | Current authenticated user |
| POST | `/auth/users` | Create a user (ADMIN only) |
| GET | `/auth/users` | List users (ADMIN only) |
| GET | `/health` | Liveness check |
| GET | `/dashboard` | KPIs, collections, trend, portfolio, top risk |
| GET | `/customers` | List with risk + outstanding |
| POST | `/customers` | Create customer |
| GET | `/customers/:id` | Detail (loans, payments, risk, totals) |
| PUT | `/customers/:id` | Update customer |
| DELETE | `/customers/:id` | Delete customer |
| POST | `/customers/:id/documents` | Upload a document (multipart) |
| DELETE | `/customers/:id/documents/:docId` | Delete a document |
| GET | `/loans` | List with rollup |
| POST | `/loans/preview` | Preview a repayment schedule (no persistence) |
| POST | `/loans` | Create a loan (generates the schedule) |
| GET | `/loans/:id` | Detail with enriched schedule + payments + rollup |
| PUT | `/loans/:id` | Update loan (blocked once payments exist) |
| DELETE | `/loans/:id` | Delete loan |
| POST | `/loans/:id/default` | Mark the whole loan defaulted |
| GET | `/payments?loanId=&customerId=` | List payments |
| POST | `/payments` | Record a payment |
| GET | `/collections/today?includeOverdue=` | Today's collection sheet |
| GET | `/action-required` | Installments past grace + default-eligible loans |
| POST | `/installments/:id/default` | Capitalize an unpaid installment into principal |
| GET | `/config` | Read per-loan-type settings |
| PUT | `/config` | Update per-loan-type settings |

---

## How the money math works (`shared/src/finance.ts`)

- **Flat rate** — `totalInterest = principal × (annualRate/100) × years`, where
  `years = installments / periodsPerYear(frequency)`. Principal and interest are
  split equally across installments; the final row absorbs rounding.
- **Reducing balance (EMI)** — per-period rate `i = annualRate/100 / periodsPerYear`;
  `EMI = P·i·(1+i)^n / ((1+i)^n − 1)`. Interest each period is on the opening
  balance; the remainder reduces principal.
- **Grace bandwidth** — days after the due date within which a late payment is
  tolerated before the installment becomes "action required". Configured per loan
  type, overridable per loan (`graceDaysOverride`).
- **Default threshold** — days with no payment after which the whole loan becomes
  eligible to be defaulted (`defaultThresholdDaysOverride` per loan).
- **Capitalization** — when a user confirms a default/partial on an installment,
  the unpaid amount is added to the outstanding principal and the remaining
  installments are re-amortized (same remaining count, interest recomputed). If
  nothing remains, the loan is marked defaulted. **All of this is user-triggered
  from the Action Required screen — it never happens automatically.**
- **Risk score** — 0–100 (higher = safer): on-time rate 40%, defaults 25%,
  average delay 15%, partial frequency 10%, overdue exposure 10%. Bands:
  ≥67 LOW, ≥34 MEDIUM, else HIGH; no matured installments → UNKNOWN.

---

## Notes

- **Authentication** — all `/api/*` routes except `/api/auth/*` and `/api/health`
  require a logged-in session (JWT in an httpOnly cookie); `/api/config` writes
  are ADMIN-only. See the demo accounts above.
- **Currency** — INR, locale `en-IN`, throughout.
- Loan terms are locked once any payment is recorded (edit the loan before
  collecting, or record payments from the loan detail page).
