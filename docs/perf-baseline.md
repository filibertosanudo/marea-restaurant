# Performance baseline and results (module 16)

Every figure here has a "before" and, once its phase lands, an "after". A
change that does not move its own figure gets reverted, not kept "just in
case".

## How it was measured

- **Server:** production build (`npm run build`, `next start`), one process.
- **Database:** PostgreSQL 18.4 on the same machine with `pg_stat_statements`,
  seeded with `npm run db:seed` plus `node scripts/perf/seed-orders.mjs 50 10`
  (54 live orders, 11 delivered, placed through the real checkout and advanced
  through the real board action).
- **Why not `docker-compose`:** Docker Desktop would not start on the
  measuring machine (stale `dockerInference` socket, "The file cannot be
  accessed by the system"). The database was a throwaway cluster from the
  locally installed Postgres binaries instead. The comparison between "before"
  and "after" is unaffected; absolute latencies are a floor, because the
  round trip to a database on `localhost` is ~0 ms and a hosted one is
  30-80 ms. (The scratch cluster ran in the machine's local time zone until
  phase 1, when it was set to UTC to match Docker and CI; query counts are
  unaffected.) **Query counts are the figure that carries over to production;
  milliseconds on `localhost` are not.**
- **Counting queries:** `pg_stat_statements_reset()`, run the scenario, then
  `sum(calls)` excluding the script's own bookkeeping. This counts statements
  the app ran, so it holds under any pooler.
- **Scripts:** `scripts/perf/` (`measure.mjs` for the figures below,
  `seed-orders.mjs` for the data, `lib.mjs` for the shared HTTP plumbing).

```bash
node scripts/perf/seed-orders.mjs 50 10
node scripts/perf/measure.mjs idle 1 60      # one board screen, one minute
node scripts/perf/measure.mjs idle 5 60      # five screens
node scripts/perf/measure.mjs payload
node scripts/perf/measure.mjs latency 50
npx lighthouse http://localhost:3100/ --only-categories=performance
```

## Correction to the module's premise

The prompt says the stream costs "two queries every two seconds". It is four:
`getSignature` for the board also checks the latest `Payment`, `CashSession`
and `CashMovement` (added by modules 12 and later), so the real cost is
double what the module text estimated. Every "before" below is the measured
figure, not the estimate.

## Figures

### Realtime: statements to Postgres with the board open and idle

Phase 3 replaces the per-screen poll with one dedicated `LISTEN` connection per
web process, fed by `pg_notify` triggers on the four tables the old signature
watched (`OrderStatusEvent`, `Payment`, `CashSession`, `CashMovement`).

| Scenario | Before (polling) | After (LISTEN) | After (forced polling fallback) |
|---|---|---|---|
| 1 board screen, per minute | 121 | 3 (2 heartbeats, 1 cache fill) | not measured (same loop as 5 screens) |
| 5 screens (kitchen, till, 3 waiters), per minute | 605 | **2** | 29 |
| 5 screens, per hour | 36,300 | **120** | about 1,740 |
| Cost grows with screens? | linearly | no | no (one loop for every screen) |
| SSE bytes per minute per screen | 232 | 29 | 29 |

The 2 statements a minute are the listener's own heartbeat (`SELECT
pg_notify(...)` every 30 s), the price of noticing a connection that is up but
deaf. **The module's goal was "fewer than 100 an hour with five screens"; the
heartbeat alone is 120.** Setting `HEARTBEAT_INTERVAL_MS` to 60 s gives 60 an
hour at the cost of a slower detection of a dead channel (up to about 65 s
instead of 35 s). It was left at 30 s because a kitchen wall screen is the one
place that must not stay stale, and nothing else in the loop costs a statement.

| Latency of one change (an order advanced through the real admin action) | |
|---|---|
| LISTEN, 10 samples | median 126-139 ms, max 146 ms |
| Forced polling fallback (`REALTIME_MODE=poll`), 5 samples | median 9.1 s, max 9.5 s (interval 10 s) |

These figures were measured with raw SSE clients. A real screen adds a page
refresh (about 12 statements) only after a connection that dropped, not on the
server's scheduled 75 s handoff: the first version of the client refreshed on
both, which review caught as about 2,900 statements an hour for five screens,
and `shouldRefreshOnOpen` now excludes the handoff (`useEventStream.test.ts`).

**Killing the LISTEN connection** (`node scripts/perf/realtime-drill.mjs kill`,
and `recovery.integration.test.ts`): the server's `marea_realtime_listen`
backend is terminated with `pg_terminate_backend`, an order is advanced while
nobody is listening (so its notification goes nowhere), and the screen is told
to refresh 1.2 s later, after the reconnect and the sweep. A new LISTEN backend
appears under a new pid.

### What one board event costs a screen (phase 4)

Before, every event made every connected screen call `router.refresh()`: the
whole board re-rendered on the server and its payload came back. Now an event
names the orders that changed and the screen fetches only those cards.

| Per event, per screen | Before | After |
|---|---|---|
| What the screen downloads | 64,773 B (15,571 B gzip) with 54 live orders; about 1.2 KB per live order, so about 180 KB at 150 (extrapolated, not measured) | **680 B (415 B gzip)**, whatever the board holds |
| Statements | 12 | **8** (seven for the card's relations, one for the column totals) |

Prisma 7 loads each relation with a statement of its own, and
`relationLoadStrategy: "join"` is not in this client, so a board card costs
seven statements wherever it is read; the count of *reads* is what could come down.

| First paint and reconcile | Before | After |
|---|---|---|
| `/admin/pedidos` render, 150 live orders | one read of every live order (no cap) | first 50 of each live column: **82.5 KB (17.9 KB gzip), 15 statements** |
| Same page with one read per column (an intermediate step) | | 25 statements |
| Delivered column | in the page render | fetched after first paint, and kept across refreshes |

**Idle screen, a real browser, two minutes** (`node scripts/perf/measure.mjs
page-idle /admin/pedidos 130`, first paint excluded): **board 25.4 statements a
minute, kitchen screen 21.2**, against 121 before (about 5x fewer). What is
left is not the stream: it is the 60 s reconcile (one page render, 15
statements) and the JWT re-check that each request after 60 s does
(`BusinessMembership` and `User`, about 5 per render). **The module hoped the
per-screen figure would fall by two orders of magnitude; with a full re-read
every minute, as specified, it cannot go below about 20.** Two ways to get closer,
neither done: a reconcile every 5 minutes instead of 1 (about 5 a minute), or a
reconcile that compares a checksum of the board's first pages, one statement
for the whole process instead of a page render per screen.

Also in this phase: columns cap at 50 cards with "ver más" (the total stays in
the badge), the optimistic move shows in about 100 ms with the server action
held for 1.5 s and reverts when the action fails, and a reconnect after a
dropped stream refreshes the screen. `node scripts/perf/board-drill.mjs` runs
23 of these checks in a headless browser.

### Public pages

Phase 1 puts the landing and menu reads behind a per-business data cache
(`unstable_cache`, tags `menu:`, `business:`, `promotions:`, `testimonials:`,
`hours:`, 60 s TTL as a safety net for other replicas).

| Page | | Before | After |
|---|---|---|---|
| `/` (landing) | Statements per request | 20 | 0.4 (the one fill, over 50 requests) |
| | Warm median / p95 | 18 ms / 92 ms | 11 ms / 34 ms |
| | First request after start | 772 ms | 833 ms (a cold start is dominated by loading, not by these queries) |
| `/menu` | Statements per request | 14 | 0 |
| | Warm median / p95 | 13 ms / 17 ms | 8 ms / 11 ms |

`node scripts/perf/cache-invalidation.mjs` (real admin Server Action, real
HTTP): hiding a dish removes it from `/menu` on the very next request. The
hit costs 0 statements; the one blocking rebuild after the edit took 36 ms.
Local milliseconds are a floor, since the database is on `localhost`; against
a hosted database at 30-80 ms per round trip, the 20 statements the landing no
longer runs are worth far more than the 7 ms shown here.

`/admin/pedidos` went from 12 to 10 statements per render because
`getCurrentBusiness` no longer queries. Panel responses are still
`Cache-Control: private, no-cache, no-store`.

### Lighthouse, landing (phase 5; mobile profile, Slow 4G, 4x CPU, v12.8.2)

Before, three runs, `/`: LCP 2.9 / 2.8 / 2.8 s, CLS 0, TBT 100-190 ms (simulated).

What moved it, one change at a time, five runs each, LCP median (simulated
throttling, the default):

| Step | LCP | Page weight |
|---|---|---|
| Before | 2.87 s | 312 KiB |
| Drop the unused Montserrat 500 weight | 2.86 s | 295 KiB |
| ... and stop preloading the body font | 2.73 s | 295 KiB |
| ... and keep `zod` out of the landing bundle | 2.58 s | 231 KiB |
| ... and stop preloading every font | 2.54 s | 214 KiB |
| ... and inline the CSS | 2.57 s (no change) | 232 KiB |

The one that mattered: `ReservationForm` imported a single constant
(`MAX_BOOKING_HORIZON_DAYS`) from `lib/reservations/schemas.ts`, which imports
`zod`, so the whole validation library shipped to every visitor of the landing
for a number. The constant now lives in `lib/reservations/limits.ts` (no
imports; a test fails if it grows one). First-load JS for `/`: **777 KB to 481
KB** uncompressed.

**Two ways of measuring disagree, and they should be read together.** Lighthouse's
default simulator estimates this page from the JS it downloads (the React and
Next runtime are about 170 KB of gzip that no change here can remove), so it
stays at about 2.55 s whatever is done to fonts or CSS. With throttling applied
by Chrome, the same page paints at **2.1 s before the CSS was inlined and 1.3-1.5
s after**, because the first paint waited on two render-blocking stylesheets,
each a round trip on Slow 4G. The CI budget uses the applied throttling (median
of 3): LCP 1.50 s against 2.5 s, CLS 0.003 against 0.1. Simulated LCP is printed
alongside for information; it is over 2.5 s and no change available here moves
it.

**Images: nothing to optimise on the public side.** The public pages render no
dish photos at all (`Dish.tsx` draws a text placeholder), and the two `<img>`
tags in `packages/ui` (`MenuCard`, `TestimonialCard`) are never given an image
by this app and belong to a library that should not depend on Next. The real
`<img>` are in the panel: a 36 px thumbnail in the menu table that downloads
the full 1600 px WebP, and a 96 px preview of a file just uploaded. Neither is
public and neither was measured with real photos (the seeded `/menu/*.jpg`
files do not exist); they are left for a follow-up. Note for that follow-up:
the local storage driver stores absolute URLs on the app's own origin, which
the existing `remotePatterns` do not cover.

### Order folio (phase 2)

`Business.orderSequence` made every order of the business increment one row
in the middle of its transaction. It is replaced by `OrderCounter` (one row per
business and day, one upsert) and the number is now taken as the last step
before the order insert. Folios go from `A-0042` to `A-260918-042`; old
orders keep their numbers (the two formats cannot collide: the new one has a
second hyphen).

What the numbers say, and what they don't:

| Measurement | Before | After |
|---|---|---|
| Real checkout over HTTP, 100 orders, 20 in flight, local DB (orders/s) | 32.4 / 34.2 / 33.8 | 32.4 / 35.2 / 41.3 |
| Same, checkout p95 | 1.29-1.34 s | 1.03-1.59 s |
| DB path only (in-process), local DB, 20 in flight (orders/s) | 100-109 | 80-118 |
| DB path only, **20 ms round trip**, 4 in flight (orders/s) | 2.7 / 2.7 | 3.7 / 3.6 |
| Same, checkout p50 | 1.37-1.39 s | 0.99-1.01 s |
| Duplicate folios, failed orders | 0 / 0 | 0 / 0 |

- **On localhost the change is invisible.** The Node server is the ceiling
  (about 35-45 orders/s) long before the row lock is, and a local round trip
  costs nothing, so a lock held for a few statements costs nothing either.
- **With a database at ~20 ms the folio lock is measurable:** +35% throughput
  at four checkouts in flight, because the time the counter row is held drops
  from most of the transaction to its last few statements. That is the
  situation production is in (the round trip to a hosted database is not
  zero), so it is the one that counts.
- **The per-day key alone does not remove the queue.** All orders of one day
  still update the same row until they commit; the gain comes from taking the
  number late, not from splitting by day. The day in the key is what makes the
  folio say something and stay unique across days.
- **Not gap-free by accident.** The number is taken inside the transaction, so a
  checkout that rolls back does not burn one (a test covers it). Taking it in a
  separate statement would shrink the lock further at the price of gaps; it
  was not done.
- The 20 ms figure is a TCP proxy that delays each direction by 10 ms
  (`scripts/perf/delay-proxy.mjs`); `checkout-db-bench.integration.test.ts`
  runs the in-process measurement. At 8 in flight the checkout transaction
  exceeds Prisma's 5 s default under that latency, which is worth remembering
  for the phase 6 scenario against a hosted database.

Display: the kitchen and board cards and the kitchen ticket show the short form
(`A-042`, the width the old folio had); the guest page, emails and reports
show the full folio. The full folio at the card's 30 px wrapped at the hyphen on
narrow kitchen displays. On the guest page (44 px) it wraps only at a 320 px
viewport.

Method: `node scripts/perf/checkout-load.mjs 100 20` for the HTTP figures;
`BENCH_OUT=/tmp/b.txt CONC=4 NN=40 DATABASE_POOL_MAX=25 npx vitest run
scripts/perf/checkout-db-bench` for the rest, three runs each side.

### Checkout under the phase 6 scenario

Measured in phase 6.

| Figure | Before | After |
|---|---|---|
| Checkout p95 under the phase 6 scenario | | |
