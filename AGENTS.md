# AGENTS.md

Operational notes for working in this codebase. Git, commits, and PRs are
covered in [`docs/CONVENCIONES.md`](docs/CONVENCIONES.md) — read that
instead of duplicating it here.

## Rules that aren't obvious from the code

- **Middleware is `proxy.ts`, not `middleware.ts`.** Next 16's name for it.
- **No public capability token uses `cuid()`.** `Order.publicToken`,
  `Reservation.confirmationCode`, `RestaurantTable.qrToken` all use
  `cuid(2)`. `cuid()` (CUID v1) is structured — timestamp-prefixed rows
  created in the same batch differ by only a few bits, exactly the case
  where that matters for an unauthenticated access token. See the schema's
  own comments on each field and the header note at
  `prisma/schema.prisma:34`.
- **No date is ever interpreted client-side.** Every date/time resolution
  against the business's timezone happens once, server-side (see
  `lib/reservations/availability.ts`'s header comment for why).
- **`Prisma.Decimal` never crosses to a Client Component.** Convert through
  `lib/dto/` at the server/client boundary — money as a `number` loses
  precision it can't get back.
- **`requireRole(...)` is the first line of every mutation.** Server
  Actions, route handlers that mutate — no validation, no query, nothing
  before it.
- **Every env var is read through `lib/env.ts`**, not `process.env`
  directly, and it's the only module allowed to read `process.env` for
  config. It validates lazily (first real access, not at import — see its
  own header comment for why) and the process refuses to start if
  something required is missing or malformed.
- **The board, kitchen screen and order tracking are driven by Postgres
  triggers you cannot see from the code.** `marea_notify_change()` (migration
  `add_realtime_notify_triggers`) runs `pg_notify` after every write to
  `OrderStatusEvent`, `Payment`, `CashSession` and `CashMovement`, so anything
  that writes one of them is a live update, with no call to make. Adding a
  fifth source is one `CREATE TRIGGER` in a new migration. The listener
  (`lib/realtime/`) must sweep after every reconnect: a notification sent while
  nobody listens is gone, and a row can commit after a newer one with an
  older timestamp, which is what `RECOVERY_WINDOW_MS` covers. That window is
  derived from Prisma's 5 s transaction timeout: do not pass a longer one to a
  `$transaction` without revisiting it (`lib/realtime/timing.test.ts` fails).
- **The app never connects as the table owner.** Row level security binds
  neither an owner nor a superuser, so as that role every policy is a silent
  no-op. `DATABASE_URL` is `marea_app`; `WORKER_DATABASE_URL` is
  `marea_worker`; the owner is for `migrate` and `seed` only, and
  `instrumentation.ts` refuses a production boot as anything else
  (`lib/db/role-check.ts`). Migrations that add a business table add its
  policy in the same migration (see `..._enable_row_level_security`).
- **The business reaches Postgres through the pool, not through queries.**
  `lib/db/tenant-pool.ts` stamps `app.business_id` on each connection as it is
  handed out, from `runInTenant()` or from the `x-marea-tenant` header
  `proxy.ts` sets. Outside a request (worker, scripts, an agent, a webhook)
  there is no business unless you pass one: `runInTenant(id, fn)`. No business
  means no rows. Queries still carry `where: { businessId }`; the policy is
  what saves you when one does not. `runInTenant` awaits `fn` inside the
  scope on purpose: a Prisma query is lazy.
- **Work that has no business uses `systemPrisma`** (`lib/db/system.ts`,
  role `marea_worker`): the notification queue, the realtime sweep and
  `lib/tenancy/discover.ts`, which finds a business from a device token,
  Stripe event or printed token. That role holds column grants, not tables;
  do not widen it to read business data.
- **`DIRECT_URL` is the migrations' (owner) connection.** `prisma.config.ts`
  runs outside Next and reads `process.env`. The realtime listener uses
  `WORKER_DATABASE_URL` (`LISTEN` needs no table, and does not survive a
  transaction-mode pooler: behind one, it must be a direct connection or
  `REALTIME_MODE=poll`). Do not put `DIRECT_URL` in the running app.
- **Nothing depends on a single cloud provider.** Storage (`lib/storage/`)
  and, going forward, any other external integration go behind an
  interface with at least two implementations — see `lib/storage/driver.ts`
  for the pattern.

## Environment

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL, AUTH_SECRET at minimum
npm run db:migrate
npm run db:seed           # local only — refuses against anything else
npm run dev
```

Full portable deploy (Docker, no local Node/Postgres install needed):
see [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm run start` | Production build / serve it |
| `npm test` | Unit + integration tests (vitest) |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply migrations (dev) |
| `npm run db:seed` | Seed dev data — refuses against a non-local database |
| `npm run db:studio` | Prisma Studio |
| `npm run storage:sweep` | Delete storage keys no `MenuItem` row references |
| `npm run rate-limits:purge` | Delete `RateLimitCounter` rows past every scope's window (`-- --dry-run` to preview) |
| `npm run privacy:purge-ip-data` | Delete `LoginAttempt`/`RateLimitCounter` rows older than 90 days (`-- --dry-run` to preview) — safe to schedule |
| `npm run privacy:anonymize-guests` | Blank guest contact info on `Order`/`Reservation` rows older than 24 months (`-- --dry-run` to preview) — run by hand, not scheduled |

## Where things live

`docs/DATABASE.md` — schema rationale. `docs/design.md` /
`docs/design.html` — design tokens. `docs/product/roles-y-alcance.md` —
the permission matrix. `docs/PLAN-PRODUCCION.md` — the production roadmap;
`docs/prompts/` is its module-by-module history, not edited after the fact.
