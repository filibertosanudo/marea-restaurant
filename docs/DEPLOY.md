# Marea — deployment guide

The app is a standard Next.js 16 + Postgres app packaged as a portable Docker
image (`output: "standalone"`). Nothing in it assumes Vercel, Supabase, or
any other specific host — see `docs/PLAN-PRODUCCION.md` and
`docs/prompts/07-postgres-y-deploy-portatil.md` for why.

## Recommended: Docker Compose on a VPS

For one restaurant, this is the cheapest and simplest option that still
gives you full control: everything (app, Postgres, uploaded photos) on one
small machine, no third-party platform dependency, ~$5/month.

**Reference machine:** Hetzner CX22 (2 vCPU, 4GB RAM, 40GB disk, ~$5/mo) or
equivalent (DigitalOcean, Vultr, Linode). Docker and Docker Compose are the
only requirements on the machine itself.

**What breaks first at this tier:** disk space on the media volume (dish
photos are small — a few hundred items is a few hundred MB) and the single
point of failure of one VPS (no automatic failover — acceptable for a
single restaurant, not for multiple locations). Neither is a concern until
well past what one restaurant generates; move to "Alternatives" below if
that changes.

### Steps

1. **Provision the machine.** Any VPS with a public IP. Install Docker and
   the Compose plugin (`curl -fsSL https://get.docker.com | sh` covers
   most distros).

2. **Clone the repo and set up `.env`.**

   ```bash
   git clone <repo-url> marea && cd marea
   cp .env.example .env
   ```

   Fill in at least `POSTGRES_PASSWORD`, `AUTH_SECRET` (generate with
   `openssl rand -base64 32`), and `APP_ORIGIN` (your real domain,
   `https://...` — the app refuses to start in production without it, see
   `.env.example` for why). See `.env.example` for every other variable and
   what happens if it's left unset.

3. **Build and start the stack.**

   ```bash
   docker compose up --build -d
   ```

   This starts Postgres, waits for it to report healthy, applies
   migrations via the one-shot `migrate` service, then starts `app`. From a
   clean checkout this takes a couple of minutes the first time (mostly
   `npm ci` and the Next.js build); with Docker's layer cache from a prior
   build, well under a minute. See the timing note in `README.md`.

4. **Seed once, by hand — never automatically.** The seed script refuses to
   run against anything that isn't unmistakably local (see `prisma/seed.ts`
   and 0.5 in `docs/prompts/07-postgres-y-deploy-portatil.md`), on purpose:
   the seeded accounts have publicly-documented passwords. For a first
   deployment, run it once from inside the `migrate` image against the real
   `db` service, explicitly opting in:

   ```bash
   docker compose run --rm -e I_KNOW_WHAT_IM_DOING=1 migrate \
     npx tsx prisma/seed.ts
   ```

   Then immediately change the seeded admin passwords from the panel —
   they're the same values published in `README.md`.

5. **Put a reverse proxy in front of it** (nginx, Caddy, or your platform's
   load balancer) for TLS termination and to make `TRUSTED_PROXY_COUNT`
   true. See the nginx config below. Point `APP_ORIGIN` at this proxy's
   public URL, not at the container directly.

6. **Verify.** `curl https://your-domain/api/health` should return
   `{"ok":true,"db":true,...}` with a 200. It returns 503 if Postgres isn't
   reachable — that's what a load balancer or uptime monitor should watch,
   not the JSON body.

### nginx in front of the app

`lib/auth/rate-limit.ts`'s per-IP limiting (and the audit finding 0.1 that
fixed it) only holds if the proxy in front of the app **rewrites**
`x-forwarded-for` rather than blindly appending the client's own value.
`TRUSTED_PROXY_COUNT=1` (the default) assumes exactly this nginx config:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.example;

    # ... ssl_certificate, ssl_certificate_key ...

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# In the http{} block, or a separate config file nginx includes:
# tells nginx that connections from the app's own reverse-proxy chain
# (here, itself — adjust if there's a CDN or another proxy further out)
# are trusted, so it replaces rather than appends to X-Forwarded-For.
set_real_ip_from 127.0.0.1;
real_ip_header X-Forwarded-For;
```

If there's a CDN or another load balancer in front of nginx too, add its IP
ranges to `set_real_ip_from` and set `TRUSTED_PROXY_COUNT` to the total
number of trusted hops, not just 1.

Running the app directly on a public IP with **no** reverse proxy at all?
Set `TRUSTED_PROXY_COUNT=0` — the app then trusts nothing from
`x-forwarded-for`/`x-real-ip` and falls back to a shared rate-limit bucket
for that dimension. The per-email limit is unaffected either way and stays
the primary defense.

## Alternatives

### Managed PaaS (Railway, Render)

Push-to-deploy, managed Postgres, no server to patch. Roughly $10–15/month
(Railway's $5 base plan plus database usage) — about double the VPS cost in
exchange for no operations burden. Use the same `Dockerfile`; point the
platform's "release command" (or equivalent pre-deploy hook) at
`npx prisma migrate deploy`, run against a build stage with full
`devDependencies` (this repo's own `migrate` Docker stage is exactly that —
most platforms let you target it, or run their own build with
devDependencies available before pruning). Never wire the seed script into
an automated deploy step.

Fly.io was evaluated and isn't recommended here: its managed Postgres
pricing has risen substantially (~$30–40/month for a basic instance with
volume snapshots) — several times the cost of the VPS path for the same
workload.

### Kubernetes

Solves problems a single restaurant doesn't have: multiple replicas,
rolling deploys across a fleet, complex traffic routing. Real added cost
(a managed control plane, plus operational surface — manifests, ingress,
cert management) for zero benefit at this scale. Revisit only alongside
multi-location/multi-tenant support, not before.

## Postgres version

The Compose stack pins `postgres:17-alpine`. `btree_gist` (the extension
the reservation `EXCLUDE` constraint depends on) ships in every official
Postgres image via `contrib`, alpine included — verified directly against
this image as part of building this module (`\dx` inside the container
lists it after migrations run).
