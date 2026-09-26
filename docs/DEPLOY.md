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

   Fill in at least `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `WORKER_DB_PASSWORD`, `AUTH_SECRET` (generate with
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

## Stripe: two webhook endpoints

Card payments go to each business's own Stripe account (Stripe Connect, direct
charges), so Stripe reports on two kinds of thing and the app has an endpoint for
each, with its own signing secret. Register **both** in the Stripe Dashboard
(Developers, Webhooks), in the same mode as `STRIPE_SECRET_KEY` (test or live: a
test account does not exist in live mode, and an event of the other mode is
ignored and logged).

| Endpoint | Listen to | Signing secret variable | Events |
|---|---|---|---|
| `https://<host>/api/webhooks/stripe` | **Events from: Your account** | `STRIPE_WEBHOOK_SECRET` | `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `payment_intent.processing`, `charge.refunded` (payments taken on the platform's own account, before a business connected its own) |
| `https://<host>/api/webhooks/stripe/connect` | **Events from: Connected accounts** | `STRIPE_CONNECT_WEBHOOK_SECRET` | the same five, plus `account.updated` and `account.application.deauthorized` |

`<host>` is the bare `APP_ORIGIN` host, not a business subdomain: the endpoints
are not per business, the payment names its business.

- Each endpoint checks the signature against its own secret only. An event of
  one kind signed with the other's secret is rejected (400), and an event that
  reaches the wrong endpoint (a platform event with an `account`, a Connect event
  without one) is logged and answered 2xx without changing anything.
- The account an event carries must be the account the payment was charged on.
  If not, nothing is applied and a line is logged: `[stripe webhook] ... ignored
  ...`. Search the logs for that when a payment does not update.
- **Both secrets are required in production** whenever `STRIPE_SECRET_KEY` is
  set: with only one, the app refuses to start and names the missing variable,
  rather than run and silently never hear about the other kind of event.
- What the Connect events do: `account.updated` re-reads the account from Stripe
  and stores whether it can take cards, so an account that becomes restricted
  stops offering cards on its own. `account.application.deauthorized` (the
  business disconnected the platform from its Stripe account) clears the
  business's account, turns online payment off and keeps it from falling back to
  the platform's key; its earlier payments keep their account and can still be
  refunded from the app until Stripe refuses, after which the refund has to be
  made from the restaurateur's own Stripe dashboard.
- Locally, `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and
  `stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe/connect`
  each print their own `whsec_...`; put them in the two variables.

## Database roles and row level security

Every business table has a Postgres row level security policy tying its rows
to a business: a query that forgets `where: { businessId }`, or filters by the
wrong one, gets nothing back instead of another business's data. The
application still filters by business on every query; the policy is what
saves the day it does not.

**A policy only binds a role that does not own the tables.** The role that ran
the migrations owns them, and for an owner (or a superuser) row level security
does nothing at all, with no error and every policy looking correct. So the
stack uses three roles:

| Role | Used by | Can |
|---|---|---|
| `marea` (owner) | `migrate`, `seed`, manual maintenance | everything; never used by the running app |
| `marea_app` | the web app (`DATABASE_URL`) | read and write business data, bound by the policies; no schema changes |
| `marea_worker` | the notification worker, the realtime sweep and LISTEN, and the lookups that find which business a token belongs to (`WORKER_DATABASE_URL`) | the notification queue, plus ids and business ids of a few tables; not an order, a menu or a customer |

The migration creates `marea_app` and `marea_worker` without a login. Set
`APP_DB_PASSWORD` and `WORKER_DB_PASSWORD` in `.env` and the compose `migrate`
service gives them one on every start (`npm run db:provision-roles` does the
same by hand, and is how you rotate a password). On a managed database, run
the migrations as the admin user and set `DATABASE_URL` to `marea_app` and
`WORKER_DATABASE_URL` to `marea_worker`, both direct connections.

**Upgrading a running deployment:** run the migration and the provisioning
step first, then switch `DATABASE_URL` and add `WORKER_DATABASE_URL`, then
restart. The app checks at boot which role it connects as and refuses to
start in production if it is the owner, a superuser or has `BYPASSRLS`
(`DATABASE_ROLE_CHECK=warn` logs instead, for the day of the switch only).

To confirm by hand what the running app connects as:

```sql
SELECT current_user, r.rolsuper, r.rolbypassrls
FROM pg_roles r WHERE r.rolname = current_user;
```

Maintenance scripts (`storage:sweep`, `privacy:anonymize-guests`) go through
the same client and walk the businesses one at a time; they need no owner
connection.

## More than one business on one deployment

Each business answers on its own subdomain: `marea.example.com`,
`cala.example.com`. The panel's business comes from the session; everything
public comes from the host.

1. **DNS and certificate.** A wildcard record `*.example.com` pointing at the
   proxy, and a wildcard certificate for it. Custom domains (`reservas.marea.mx`)
   are not supported yet: each needs its own certificate.
2. **Set `BUSINESS_ROOT_DOMAIN=example.com`.** Without it the deployment is
   single-origin: its only business answers on every hostname, and as soon as
   a second business exists the bare domain names nobody (404).
3. **The proxy must pass the original `Host` through** (`proxy_set_header Host
   $host;`, already in the nginx config above). The business is resolved from it.
4. **QR codes and emailed links already out in the world keep working.** They
   were minted on `APP_ORIGIN`; a request for one on the bare domain is
   redirected to the owning business's subdomain (the token is an unguessable
   capability, so it identifies its business). New QR codes, emails and the
   sitemap use the subdomain directly. Nobody needs to reprint tables.
5. **Card payments need a Stripe account per business.** All cards go through
   the platform's single `STRIPE_SECRET_KEY`, which is fine while there is one
   business. From the second one on, a business without its own
   `stripeAccountId` cannot enable card payments (the panel says why) and
   guests of a business that had them enabled are sent to "pay at the
   register". Each business connects its own Stripe account from its settings
   (Stripe Connect, module 17b); register the two webhook endpoints first (see
   "Stripe: two webhook endpoints" above).

### Adding a business to a running deployment

Nobody opens the database. With the stack already up and `BUSINESS_ROOT_DOMAIN`
set (previous section), run the tenants command as the database owner, the
same connection the migrations use (it refuses the restricted application role
rather than fail halfway):

```bash
# a chain, if the new business belongs to one
docker compose run --rm --entrypoint "" migrate npx tsx scripts/tenants.ts \
  create-organization --slug marea-group --name "Marea Group"

# the business, and its first administrator in one go
docker compose run --rm --entrypoint "" migrate npx tsx scripts/tenants.ts \
  create-business --slug cala --name Cala --organization marea-group \
  --timezone America/Hermosillo --currency MXN --locale es \
  --admin-email ana@cala.mx --admin-name "Ana Cota"

# the owner of the chain, who moves between its businesses
docker compose run --rm --entrypoint "" migrate npx tsx scripts/tenants.ts \
  create-org-admin --organization marea-group --email dueno@marea.mx --name "Dueño"

# what exists, and where each business answers
docker compose run --rm --entrypoint "" migrate npx tsx scripts/tenants.ts list
```

Each command prints what it made. A temporary password is shown **once**, on
that terminal, and the person must change it at first sign-in. Then:

1. The business answers at `https://<slug>.<BUSINESS_ROOT_DOMAIN>` straight
   away (the wildcard record and certificate already cover it). Its slug is a
   subdomain, so it is one lowercase word with inner hyphens, and a few names
   (`www`, `admin`, `api`...) are refused.
2. The administrator signs in there, at `/admin`, and sets up hours, tables and
   a menu. On a branch of a chain, **Menu → Copy a menu from another branch**
   fills an empty menu from a sister branch in one click (dishes, categories,
   modifiers, photos and translations; stock counts start at zero and prices are
   copied as they are).
3. Card payments start **off**. From the second business on, one without a
   Stripe account of its own cannot take cards, and the panel says why.

`npm run tenants` does the same from a checkout with `DIRECT_URL` (or
`DATABASE_URL`) pointing at the owner. The seed (`npm run db:seed`, local only)
creates the two-business example the tests use: `marea` and `cala`, one chain,
and `owner@marea.test` to move between them.

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

## Live updates and poolers

The board, the kitchen screen and order tracking learn about changes through
Postgres `LISTEN/NOTIFY`: each web process holds one dedicated connection that
does nothing else (visible in `pg_stat_activity` as `marea_realtime_listen`),
so budget one connection per replica outside `DATABASE_POOL_MAX`. If a
transaction-mode pooler (pgbouncer and similar) sits in front of the app, set
`DIRECT_URL` to a direct connection; `LISTEN` through such a pooler connects
and never delivers. The listener detects that with a periodic self-addressed
ping and falls back to polling every 10 s, so the screens keep working, slower.
`REALTIME_MODE=poll` skips `LISTEN` entirely for a host where it is known not to
work.

## Postgres version

The Compose stack pins `postgres:17-alpine`. `btree_gist` (the extension
the reservation `EXCLUDE` constraint depends on) ships in every official
Postgres image via `contrib`, alpine included — verified directly against
this image as part of building this module (`\dx` inside the container
lists it after migrations run).
