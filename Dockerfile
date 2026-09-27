# --- deps: install once, reused by the build stage ---
FROM node:22-alpine AS deps
WORKDIR /app
# sharp's prebuilt binary for Alpine (musl) needs this — without it, sharp
# fails at runtime with an unrelated-looking "Could not load the sharp
# module" error, not a clear "missing libc6-compat" message.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# --- build: compile the app and generate the Prisma client ---
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# --- migrate: `prisma migrate deploy` needs the full node_modules (the CLI
# and its own dependency tree, e.g. @prisma/config -> effect) that
# `output: "standalone"` deliberately doesn't trace into the runner below —
# reusing the build stage as-is sidesteps hand-picking which files that
# tree actually needs, which changes across Prisma versions.
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

# --- seed: same reasoning as `migrate` (needs tsx and its own dependency
# tree, not traced into the standalone runner). Never part of the `app`
# service's own startup — seeding stays a command someone (or CI, for the
# E2E stack) explicitly runs, never something a real deployment does on
# every boot.
FROM build AS seed
CMD ["npx", "tsx", "prisma/seed.ts"]

# --- worker: the notification queue's long-running mode. Same reasoning
# as `seed` — scripts/worker.ts isn't part of the Next page tree `next
# build --output standalone` traces, so it needs tsx and the full
# node_modules the `runner` stage below deliberately doesn't carry.
FROM build AS worker
CMD ["npm", "run", "notifications:worker"]

# --- ops: one-shot maintenance commands (backup, restore test, the purges,
# the media sweep, the anonymize-guests report). Needs what the runner
# leaves out: tsx and the full node_modules, plus the tools these shell out
# to. postgresql17-client is the client of the same major version as the
# server (compose pins postgres:17-alpine): pg_dump older than its server
# refuses to run, and lib/ops/backup.ts checks it before it trusts a dump.
# age encrypts and decrypts; tar archives the local media volume;
# docker-cli is for the restore test, which starts and removes its own
# disposable Postgres. No CMD: docker-compose.yml's `ops` service and
# `scheduler`'s crontab each pick a command explicitly.
FROM build AS ops
RUN apk add --no-cache postgresql17-client age tar docker-cli
CMD ["npm", "run", "ops:backup"]

# --- scheduler: runs the `ops` image's commands on a schedule
# (docker/ops-crontab) via busybox crond, already in this base image — no
# extra package to fetch, and it forwards the container's own environment to
# each job (verified directly against alpine's own crond), which every
# command here already needs (lib/env.ts validates the same schema `app`
# does). Long-running on purpose, unlike every other stage above: a job's
# own single run is still one-shot and idempotent per its window.
FROM ops AS scheduler
COPY docker/ops-crontab /etc/crontabs/root
CMD ["crond", "-f", "-l", "2"]

# --- runner: the actual deployed image ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apk add --no-cache libc6-compat
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# A named volume mounted here (STORAGE_LOCAL_DIR, docker-compose.yml's
# `media`) inherits this directory's ownership only if it exists — with no
# owned directory to inherit from, Docker creates the mount point as root,
# and the non-root user below can't write an uploaded image to it.
RUN mkdir -p /data/media && chown nextjs:nodejs /data/media

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
