# Marea print agent

A small process that runs inside a restaurant's own network and prints
kitchen tickets. It never talks to Postgres and never imports anything
from the rest of this repository — see `docs/AGENTE-IMPRESION.md` (added
in module 13's closing phase) for the plain-language install guide meant
for a restaurant owner. This file is for whoever maintains the code.

## Why this is a separate package, not a workspace member

The root repo is an `npm workspaces` monorepo (`packages/ui`), but this
directory is deliberately **not** in that `workspaces` array. A workspace
member shares the root's `package-lock.json`, so `npm ci` at the repo root
would still resolve Next, Prisma, and React into a shared `node_modules`
even though this code never imports them — exactly what the Raspberry Pi
install this ships to cannot afford. Being a plain directory with its own
`package.json` also means `@/lib/...` simply doesn't resolve here, which
enforces "the agent doesn't talk to the database" structurally, not just
by convention.

## How it works

1. `main.ts` polls `POST {SERVER_URL}/api/agent/print-jobs/claim` with the
   device's bearer token every `POLL_INTERVAL_MS`.
2. Each claimed job carries a `PrintDocument` — lines, bold/size/align
   flags, whether to cut — already resolved server-side (see
   `lib/printing/kitchen-ticket.ts` in the main app). This package never
   decides what a ticket says; it only turns that document into bytes.
3. `escpos.ts` renders the document into raw ESC/POS bytes, explicitly
   selecting the CP850 code page before any text so accents and eñes
   print correctly — the printer defaults to a US code page otherwise.
4. `printer.ts` opens a plain TCP socket to the printer's port 9100 and
   writes the bytes.
5. The job is reported back as `complete` or `fail` (with the error
   message) via two more authenticated endpoints. A failure schedules the
   same exponential backoff `lib/printing/queue.ts` uses on the server.

## Known limitation

A TCP `write()` succeeding only proves the printer's buffer accepted the
bytes — never that paper actually came out. Plain ESC/POS over raw TCP has
no universal "confirm it printed" response; some printer models support a
vendor status-query extension, most on the market this module targets
don't. `printedAt`/`status: SENT` on the server means "handed to the
printer", not "definitely on paper" — that's why **Reimprimir** on the
board is a first-class action, not a fallback for something rare.

## Local development without a real printer

```bash
npm install
npm run mock-printer          # a tiny ESC/POS listener on :9100 that dumps what it receives
cp .env.example .env          # point PRINTER_HOST=localhost at the mock printer above
npm run dev
```

## Tests

```bash
npm test
```

Uses Node's built-in test runner (`node --test`) — no test framework
dependency, in keeping with this package's "as little as possible" rule.

## Building for deployment

```bash
npm run build     # tsc -> dist/
npm start          # node --env-file=.env dist/main.js
```

`dist/` plus `package.json`/`package-lock.json` is everything a target
machine needs — copy just this directory, run `npm ci --omit=dev`, and
`npm start`. No Next.js, no Prisma, no React ever touch that machine.
