# RentPR

An online rental marketplace for furniture, appliances and electronics: customers rent by the month, pay the first month (optionally at a discount) plus a refundable deposit today, and are billed the regular monthly amount automatically after that.

Built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind**, **Supabase** (PostgreSQL, Auth, Storage), and **Razorpay** (recurring subscriptions) alongside the existing **PhonePe** integration.

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in the Supabase values at minimum
npm run dev                       # http://localhost:8080
```

Pages that read the catalogue need `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` too (see `.env.example`). Payments need the Razorpay variables; they are optional until you want to take a payment.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 8080 |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint (errors fail; `no-explicit-any` is a warning) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests. Database integration tests are skipped unless `TEST_DATABASE_URL` is set |
| `npm run db:test` | Creates a throwaway database from the migrations, then runs **all** tests against it |

`npm run db:test` needs `psql` and a reachable PostgreSQL 15+ (`PGHOST`, `PGUSER`, `PGPASSWORD` override the defaults).

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): what the system is, how it is organised, the data model, state machines, security model
- [`docs/PAYMENTS.md`](docs/PAYMENTS.md): the Razorpay recurring architecture, how the first-month discount works, PhonePe, webhooks, and **what still has to be verified against a live account**
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md): deployment, environment variables, webhook and cron setup, runbooks

## Layout

```
src/app/            Next.js routes: pages and /api route handlers
src/components/     UI (rental/, site/, catalog/, product/, checkout/, account/, admin/, ui/ = shadcn)
src/lib/billing/    Pure money, pricing, schedule and state-machine code (shared by browser and server)
src/server/         Server-only: db, auth, catalog, checkout, payments (adapters), billing, rentals, admin
src/views/          Legacy client screens (vendor, admin, auth) still served through src/lib/router.tsx
supabase/migrations SQL migrations (the original 38 plus 6 rental-billing migrations)
supabase/functions  Legacy Edge Functions (see docs/OPERATIONS.md: deprecated for new flows)
```

## Status

See the "Limitations" section of [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for what is implemented and tested, and what needs credentials or external configuration before go-live.
