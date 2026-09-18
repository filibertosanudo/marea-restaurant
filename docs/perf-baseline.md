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
  30-80 ms. **Query counts are the figure that carries over to production;
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

| Scenario | Before | After |
|---|---|---|
| 1 board screen, per minute | 121 (4 polls x 30 ticks + 1 for the business) | |
| 1 board screen, per hour | 7,260 | |
| 5 screens (kitchen, till, 3 waiters), per minute | 605 | |
| 5 screens, per hour | 36,300 | |
| SSE bytes per minute per screen | 232 | |

### What one board event costs a screen (`router.refresh()`)

Measured with 54 live orders. Each event makes **every** connected screen do
this, whichever order changed.

| | Before | After |
|---|---|---|
| Statements per event, per screen | 12 | |
| Response body per event (RSC payload) | 64,773 B raw, 15,571 B gzip | |
| Full page load of `/admin/pedidos` | 326,025 B raw, 25,695 B gzip, 12 statements | |

### Public pages, no cache

| Page | First request after start | Warm median | Warm p95 | Statements per request |
|---|---|---|---|---|
| `/` (landing) | 772 ms | 18 ms | 92 ms | 20 |
| `/menu` | 46 ms (server already warm) | 13 ms | 17 ms | 14 |

### Lighthouse, landing (mobile profile, simulated slow 4G, 4x CPU, v12.8.2)

Three runs, `/`:

| Run | Score | LCP | CLS | TBT |
|---|---|---|---|---|
| 1 | 92 | 2.9 s | 0 | 190 ms |
| 2 | 95 | 2.8 s | 0 | 100 ms |
| 3 | 95 | 2.8 s | 0 | 100 ms |

**LCP is already over the 2.5 s budget the module sets for phase 5**, so that
phase has to fix it, not just guard it. The LCP element is the hero `<h1>`, a
text node, so it is gated by font loading rather than by an image.

### Order folio and checkout

Measured in phase 2 and phase 6 (not part of this baseline commit).

| Figure | Before | After |
|---|---|---|
| Concurrent checkouts per second | | |
| Checkout p95 under the phase 6 scenario | | |
