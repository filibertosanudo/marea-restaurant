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

### Load test (phase 6): a service, not a benchmark

`node scripts/perf/load-test.mjs 200 10 5`: 200 real checkouts spread at random
over 10 minutes, five board screens connected the whole time, and guests reading
`/` and `/menu` in the background, all over HTTP against a production build and a
seeded Postgres. Before is `main` (`--legacy`: its stream sends no order ids, so
the per-order board check cannot be made there).

| | Before (`main`) | After (module 16) |
|---|---|---|
| Orders created / failed | 200 / 0 | 200 / 0 |
| Checkout p50 / p95 / p99 / max | 76 / 118 / 166 / 199 ms | **39 / 91 / 104 / 181 ms** |
| Duplicate folios | 0 | 0 |
| Background menu and landing requests, errors | 963, 0 | 963, 0 |
| Postgres connections, min / max | 9 / **26** (the pool is 25) | **7 / 10** |
| Updates each board received | 151-154 (2 s polls that saw a change) | 205 |
| Orders missing from a board | not checkable | **0** on all five |
| Boards still receiving events at the end | yes | yes |

All four criteria of the module hold: no error, no duplicate folio, no order lost
from a board; p95 under 800 ms (91 ms); connections stable (7-10); boards live
at the end. The before column shows what polling cost: five screens kept the
pool at 9 to 26 connections, touching its limit of 25.

**The first run of this test failed, and that was the point.** Five screens each
missed the same three orders. Cause: the server's scheduled 75 s stream handoff
closed the old stream before the client opened the next, and an order announced in
that gap reached nobody. The same gap existed in the browser hook. Fixed by
opening the replacement first and letting the old stream keep delivering for 5 s
(`lib/realtime/stream-client.ts`, tested with a fake EventSource); the rerun
above is the fixed build.

Caveat: 200 orders in 10 minutes is 0.33 a second, and the local database has no
network distance, so the p95 figures show the path is clean, not where it would
break. The next table is where it would.

### Folio: counter row against a SEQUENCE

Requested comparison, done as a micro-benchmark of the lock alone
(`scripts/perf/folio-lock-bench.mjs`): the same 25-statement transaction, eight in
flight, the number taken (A) from one shared row early, as before module 16, (B)
from the per-day counter row last, as now, (C) from a `SEQUENCE`. It measures the
lock, not the app.

| Transactions a second | A shared row, early | B daily counter, last | C sequence |
|---|---|---|---|
| Localhost | 265 | 722 | 1,325 |
| 20 ms round trip | 1.8 (p95 11.0 s) | 3.7 (p95 3.9 s) | **9.5** (p95 0.84 s) |

**The sequence wins on the numbers**, 2.6x the counter at 20 ms and 5x the old row:
it takes no row lock, so it is limited by the connections, not by a queue. **It
was not adopted**, for two reasons and one caveat:

- At the demand measured above (0.33 orders a second, bursts of a few) the counter's
  ceiling at 20 ms (3.7 a second) is already many times what a restaurant
  produces; the sequence's extra headroom buys nothing the load test can see.
- A sequence cannot reset each day, so it cannot give the folio the daily meaning
  the product chose (the 42nd order of the day, `A-042` on the kitchen screen). The
  format would become a global running number (`A-260918-1234`). That is a product
  decision, not a performance one, and it is the reason the daily folio exists.
- The gaps a sequence leaves on rollback are, as you said, probably harmless for a
  ticket number; the counter takes its number inside the transaction and leaves
  none.

If the deployment ever needs more than about 3 orders a second per business, the
sequence is the change to make, and this table is the evidence for it.

## Driving one business of several

With more than one business in the database, every script drives one of them:
`PERF_BUSINESS` (default `marea`) scopes its queries, and `PERF_BASE_URL` must be
that business's address (default `http://marea.localhost:3100`; `*.localhost` is
resolved by the scripts themselves). A folio that repeats across businesses is
not a duplicate, only within one. The measured build runs as the restricted
`marea_app` role like production does, so the figures include the cost of the
row level security policies and of stamping the business on each connection.

### The load test again, with two businesses under row level security (module 17)

Same test (`node scripts/perf/load-test.mjs 200 10 5`), same machine, against a
production build running as the restricted `marea_app` role with `marea` and
`cala` both in the database and the test driving `marea`.

| | Module 16 | Module 17 |
|---|---|---|
| Orders created / failed | 200 / 0 | 200 / 0 |
| Checkout p50 / p95 / p99 / max | 39 / 91 / 104 / 181 ms | 56 / **83** / 94 / 108 ms |
| Duplicate folios | 0 | 0 |
| Background menu and landing requests, errors | 963, 0 | 971, 0 |
| Postgres connections, min / max | 7 / 10 | 12 / 17 |
| Updates each board received | 205 | 199 |
| Orders missing from a board | 0 on all five | **0** on all five |
| Boards still receiving events at the end | yes | yes |

All four criteria hold, seven checks of seven. Two things moved and are worth
knowing. The median is up 17 ms: every connection is stamped with the business
when it is handed out and cleared when it comes back, and every statement is
checked against a policy. The p95 did not move (it is lower in this run; treat
the two p95s as equal). Connections went from 7-10 to 12-17: the application pool
is the same, and the system client (`marea_worker`, at most 3) is new; the rest
is run to run. Both are bounded and not growing.

The burst benchmark (`checkout-load.mjs 100 20`, all at once) gave a p95 of
2.5 s against 1.0-1.6 s in the module 16 baseline. It is not a service load and
no criterion is set on it; it is where the per-connection round trips for the
business show up first. If a deployment ever needs bursts like that, the place
to look is that stamp (`lib/db/tenant-pool.ts`), not the policies.
