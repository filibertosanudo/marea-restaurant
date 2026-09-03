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
