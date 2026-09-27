# Marea — operations runbook

Written for whoever is on call when something breaks, not for whoever wrote
the code. Every command here is copy-pasteable as written; every path is
relative to a checkout of this repository, run from the machine that hosts
the Compose stack (`docs/DEPLOY.md`) unless a step says otherwise. If you
have to guess at something this document doesn't say, that is a bug in this
document — fix it here once you find the answer, not just in your head.

## Before you touch anything

- `docker compose ps` — what's up.
- `curl -s https://<your-domain>/api/health` — the balancer's own check:
  database reachable, process answering. A 503 here means the whole site is
  down for guests; go straight to "The app won't come up" below.
- `curl -s -H "Authorization: Bearer $STATUS_CHECK_TOKEN" https://<your-domain>/api/status`
  — the full breakdown: database, worker heartbeat, notification queue, last
  backup's age. A 503 here with `/api/health` still green means guests are
  fine but something behind the scenes needs attention — read which check
  failed before doing anything else.

## Deploying, and reverting a deploy

Standard deploy:

```bash
git pull
docker compose up --build -d migrate
docker compose up --build -d app worker scheduler
```

`migrate` applies every pending Prisma migration and exits before `app`
starts (`docker-compose.yml`'s `depends_on: migrate: condition:
service_completed_successfully`) — a failed migration stops the deploy
there, `app` never starts against a half-migrated schema.

**Prisma migrations only go forward.** There is no `prisma migrate down`.
Reverting a deploy is one of three things, depending on what the migration
did — check which case you're in **before** you run anything:

1. **No new migration since the last good deploy.** Just re-deploy the
   previous image:
   ```bash
   git checkout <previous-good-commit>
   docker compose up --build -d app worker scheduler
   ```
   The database is untouched; this is always safe.

2. **A new migration ran, and it says "Revert with" in its own header.**
   Every hand-written migration since module 7 carries one (Prisma-generated
   migrations don't need it — they only add columns/tables/indexes, which a
   rollback of the *application* code simply ignores). Run the `Revert with`
   SQL as the database owner, then redeploy the previous image:
   ```bash
   docker compose run --rm --entrypoint "" migrate psql "$DATABASE_URL" -c "<the Revert with SQL>"
   git checkout <previous-good-commit>
   docker compose up --build -d app worker scheduler
   ```
   As of this writing, these migrations carry a `Revert with`:
   `add_realtime_notify_triggers`, `enable_row_level_security`,
   `add_organization`, `organization_access`, `stripe_connect_guards`,
   `add_ops_task_run`, `add_worker_heartbeat`, `add_read_only_mode`. Read the
   migration's own header before running its SQL — some revert steps have
   preconditions (e.g. dropping a role only if nothing still depends on it).

3. **The new migration changed data, not just structure** (a backfill, a
   column that replaced another and dropped the old one) **and there's no
   `Revert with` for the data itself.** The previous application code cannot
   run against the new data shape. Do not try to hand-write a fix under
   pressure — restore from the last backup taken before this deploy (see
   below), then redeploy the previous image. This is why every migration
   PR's own review should ask "does this need a `Revert with`" before it
   merges, and why the module 18 phase 4 write-up flagged the ones that
   didn't have one.

**After any revert:** hit `/api/health` and `/api/status`, and load the
public menu and the admin panel once each.

## Restoring from scratch

This is what "the database is gone" or "we need to test a restore" both use.
It targets an **empty** Postgres 17 cluster — never a live one — and refuses
if the target database already exists.

**Recovery point:** the backup is a logical dump every six hours
(`docker/ops-crontab`), so the worst case is **up to 6 hours of data lost** —
orders, reservations, cash movements, whatever committed since the last
successful backup. This was a deliberate choice (module 18, phase 1, Q2):
WAL archiving would tighten this to near-zero but adds real operational
complexity this deployment's scale doesn't need yet; revisit if a client
asks for less than 6 hours, or if a single backup ever takes more than 5
minutes (a sign the logical dump is becoming the wrong tool).

**Recovery time:** the automated restore test measured **7.4 seconds**,
end to end, against the seeded development database (472 KB, 21
migrations), on 2026-09-27. **This number will grow with real data volume —
re-measure it after the first restore against production-scale data, and
update this line when you do.** The monthly restore test
(`.github/workflows/restore-test.yml`) re-measures it automatically every
run; its report is kept as a workflow artifact for 90 days.

### Steps

1. **Bring up an empty Postgres 17.** A fresh `docker compose up -d db` on a
   throwaway host works, or any Postgres 17 server nobody else is using.
   Confirm it really is empty: `psql "$ADMIN_URL" -l` should show no `marea`
   database.

2. **Restore, as the owner role:**
   ```bash
   RESTORE_TARGET_ADMIN_URL=postgresql://marea:<owner-password>@<new-host>:5432/postgres \
   RESTORE_TARGET_DATABASE=marea \
   APP_DB_PASSWORD=<new-password> \
   WORKER_DB_PASSWORD=<new-password> \
   RESTORE_S3_ENDPOINT=... RESTORE_S3_BUCKET=... \
   RESTORE_S3_ACCESS_KEY_ID=... RESTORE_S3_SECRET_ACCESS_KEY=... \
   RESTORE_AGE_IDENTITY="$(cat /path/to/backup-private-key.txt)" \
     docker run --rm -e RESTORE_TARGET_ADMIN_URL -e RESTORE_TARGET_DATABASE \
       -e APP_DB_PASSWORD -e WORKER_DB_PASSWORD -e RESTORE_S3_ENDPOINT \
       -e RESTORE_S3_BUCKET -e RESTORE_S3_ACCESS_KEY_ID \
       -e RESTORE_S3_SECRET_ACCESS_KEY -e RESTORE_AGE_IDENTITY \
       -e RESTORE_MEDIA_DIR=/data/media -v /path/to/restored/media:/data/media \
       marea-ops:local npm run ops:restore
   ```
   This does, in order (measured against Postgres 17 directly, module 18
   phase 0 — this order is the one that works, not a guess):
   creates the `marea_app`/`marea_worker` roles (without them, restoring the
   dump fails with ~150 errors and leaves a database the application can't
   use) → restores the dump as the owner (`pg_restore
   --exit-on-error --single-transaction`, so it's all-or-nothing) → gives
   `marea_app`/`marea_worker` a login password → unpacks the media archive,
   if the backup carries one.

3. **It prints a verification report.** Check `problems: []`. If it isn't
   empty, **do not point the application at this database** — read each
   problem; common ones: migrations pending (the backup is older than the
   current code — run `prisma migrate deploy` against it, then re-verify),
   media referenced but missing (the media archive didn't restore, or wasn't
   given).

4. **Point the application at it.** `DATABASE_URL` = the `marea_app` URL the
   script printed, `WORKER_DATABASE_URL` = the `marea_worker` one. Restart
   `app`, `worker`, `scheduler`.

5. **Verify:** `/api/health` is 200. `/api/status` with the token shows the
   backup check may still be stale (expected — the restored database's own
   `OpsTaskRun` history is from before the incident) but database/worker/queue
   should read fine once the worker restarts. Load the admin panel, confirm a
   business's menu and today's orders are there. Run the purges once by hand
   (see "After a restore" below) before anything else touches the data.

### After a restore

Restoring brings back data that earlier purges had already deleted —
login attempts and rate-limit counters older than 90 days, for instance.
Run the scheduled purges once immediately so the restored database doesn't
sit out of compliance with `docs/aviso-de-privacidad.md` until the next
scheduled tick:

```bash
docker compose run --rm scheduler npm run privacy:purge-ip-data
docker compose run --rm scheduler npm run rate-limits:purge
docker compose run --rm scheduler npm run storage:sweep
```

(`privacy:anonymize-guests` stays a decision someone makes on purpose — see
its own section below, not something a restore triggers automatically.)

### Testing this section

This section is tested by following it literally, on a machine that is not
production, using nothing not written here — see "Verification log" at the
bottom of this document for the record of when that last happened and what
had to be added as a result.

## Read-only mode

For a large migration ("never at lunch service") or any other window where
writes need to stop but reads shouldn't:

```bash
# Turn it on:
docker compose run --rm scheduler npm run ops:read-only -- on --reason "migrating the promotions table"

# Check:
docker compose run --rm scheduler npm run ops:read-only -- status

# Turn it off:
docker compose run --rm scheduler npm run ops:read-only -- off
```

Takes effect everywhere within a few seconds (the cache in
`lib/ops/read-only.ts`) — no deploy, no restart. While it's on:

- Every mutating Server Action and both Stripe webhook endpoints and the
  notifications cron route answer with a readable "read-only" rejection or a
  503 — verified by `lib/ops/read-only-coverage.test.ts`, which walks every
  Server Action file rather than trusting a list.
- Signing in, finishing a forced password change, and password recovery
  still work — someone locked out during a maintenance window is not
  something read-only mode should cause.
- The admin panel and the kitchen display still show live data (reads are
  unaffected); nothing on them can be changed.
- The public site shows a maintenance message where the cart/checkout would
  be; a guest can still browse the menu.
- The long-running worker (`scripts/worker.ts`) pauses instead of claiming
  new notification jobs — it keeps writing its heartbeat, so `/api/status`
  doesn't mistake this for the worker being dead.
- **Stripe webhooks answer 503, not 2xx.** Stripe retries a 503 on its own
  schedule; a 2xx that never applied the event is a charge the system will
  never hear about again. See "Stripe webhooks stuck" below — this is the
  expected, safe version of that situation, not a bug.

Turning it off does not replay anything by itself — Stripe's own retries
bring webhooks back (see below); anyone whose Server Action was rejected
just needs to try again.

## Stripe webhooks stuck

**How to see it:** query `StripeWebhookEvent` for recent rows — every event
that reached either endpoint and was actually applied gets one row (module
17b's idempotency design: insert `eventId` inside the same transaction as
the effect). If Stripe's own dashboard (Developers → Webhooks → the
endpoint) shows deliveries with a non-2xx response and you don't see a
matching row here, that event never applied.

Also check the app's own logs for lines starting `[stripe webhook]` — every
refusal (wrong signature, wrong mode, account mismatch, read-only) logs one
before answering, including the 503 case above.

**How to resend:** from the Stripe Dashboard, open the endpoint (Developers
→ Webhooks → `/api/webhooks/stripe` or `/api/webhooks/stripe/connect`), find
the failed delivery, and click **Resend**. Stripe re-signs and re-sends the
exact same event.

**Why resending is safe:** `StripeWebhookEvent.eventId` is unique, and the
insert happens inside the same transaction as the effect it triggers
(`lib/payments/stripe-webhook.ts`'s own header comment explains why). A
resend of an event already applied hits that unique constraint and is
ignored — never applied twice, never double-refunded, never double-marked a
payment. Resend as many times as you need to.

## Rotating secrets

Every rotation below: change it, restart the affected service(s), then run
that rotation's own "verify" line before considering it done.

- **`AUTH_SECRET`.** Rotating it invalidates every session (sessions last 8
  hours, so everyone signed in gets signed out and back in — no other
  effect; confirmed nothing else reads it, module 18 phase 0). To rotate
  without a flag day where everyone is logged out at once:
  1. Set `AUTH_SECRET_1` to the new value, leave `AUTH_SECRET` as the old
     one. Both are now accepted; new sessions are signed with the new one.
  2. Wait at least 8 hours (the session lifetime), so every session issued
     under the old secret alone has expired.
  3. Move the new value into `AUTH_SECRET`, remove `AUTH_SECRET_1`.
  Only the actual Next.js process needs `AUTH_SECRET` at all — `worker` and
  `scheduler` don't receive it (`lib/env.ts` only requires it when
  `NEXT_RUNTIME` is set), so this rotation touches `app`'s environment only.
  Verify: sign in after each step.

- **Stripe secret key(s).** Roll a new key from the Stripe Dashboard, set it
  in the environment, restart `app` (the key is read at first use, per
  business account — `lib/stripe/client.ts`). Verify: `docs/DEPLOY.md`'s
  "Give a business its own Stripe account" flow still shows *Active* for a
  connected account, and a test payment completes.

- **The two Stripe webhook secrets** (`STRIPE_WEBHOOK_SECRET`,
  `STRIPE_CONNECT_WEBHOOK_SECRET`). Regenerate from the Dashboard for that
  specific endpoint, set it, restart `app`. Rotate one at a time — a moment
  where the new secret is set but the old events are still in flight is
  fine, since each endpoint only ever checks against its own current
  secret. Verify: send a test event from the Dashboard's own "Send test
  webhook" for that endpoint, confirm 200.

- **Database role passwords** (`APP_DB_PASSWORD`, `WORKER_DB_PASSWORD`).
  ```bash
  APP_DB_PASSWORD=<new> WORKER_DB_PASSWORD=<new> npm run db:provision-roles
  ```
  Then update the same values in the environment and restart `app`,
  `worker`, `scheduler`. Old connections keep working until they're closed;
  new ones need the new password immediately after `db:provision-roles`
  runs, so restart promptly. Verify: `/api/health` is 200 after restart.

- **Storage credentials** (`S3_*`, if using the `s3` driver). Roll the key
  with the storage provider, update the environment, restart `app`. Verify:
  upload a menu photo.

- **Backup credentials** (`BACKUP_S3_*`). Roll the write-only key with the
  backup provider (never reuse the storage credentials above — they are
  deliberately separate accounts, module 18 phase 1 Q1), update the
  environment, restart `scheduler`. Verify: `docker compose run --rm
  scheduler npm run ops:backup`, then confirm a new object appears under the
  bucket's `sixhourly/` prefix.

- **The backup encryption key** (age). **Rotating this does not mean
  discarding the old private key** — every backup ever taken with the old
  public key can only be opened with the old private key, forever. To
  rotate: generate a new keypair (`age-keygen`), set `BACKUP_AGE_RECIPIENT`
  to the new public key, restart `scheduler`. New backups encrypt to the new
  key from then on. Archive the old private key somewhere it will still be
  found the day someone needs to restore a backup taken before the
  rotation — a dated note next to wherever secrets live (see below) saying
  "backups before <date> need this key" is enough. Never delete an old
  private key while any backup encrypted to its public key is still within
  its retention window.

## Anonymizing old guest contact info

`npm run privacy:anonymize-guests` (`-- --dry-run` to preview) blanks
`guestName`/`guestEmail`/`guestPhone` on `Order`/`Reservation` rows older
than 24 months. It is deliberately not automatic — see its own header
comment — but someone still has to know it's due. The monthly
`ops:anonymize-alert` task counts overdue rows and, only if any business has
some, emails `OPS_ALERT_EMAIL` a per-business breakdown and the exact
command to run. No email means nothing was overdue that month.

When the email arrives: read it, decide (this is the one privacy command
with a human judgment call — see the script's own comment for why), then
run the command it names. Verify: the email's counts and
`npm run privacy:anonymize-guests -- --dry-run`'s output should match; after
running it for real, that same dry run should report zero.

## Where secrets live

Nowhere in this repository, and nowhere in a file `git status` would ever
show as tracked. Concretely, for this deployment:

- The `.env` file on the production host (outside the repo checkout's
  tracked files; `.gitignore` already excludes it) holds everything
  `docker-compose.yml` reads via `${VAR}`.
- The backup encryption private key lives **only** with whoever can perform
  a restore — never on the server the backups protect (module 18 phase 1,
  Q1). Wherever that is (a password manager, an offline note), it is not
  this host.
- The monthly restore test's read-only credential and the age private key
  live in this repository's own GitHub Actions secrets (Settings → Secrets
  and variables → Actions) — deliberately: that workflow is the "machine
  that is not production" the restore test needs, and running it anywhere
  else would mean paying for a second machine. This means write access to
  this repository, and anyone who can edit `.github/workflows/restore-test.yml`,
  can read every restaurant's backed-up data — keep that list of people
  small, and protect the workflow file the same way you'd protect the
  secrets themselves (branch protection, required review).

## After any procedure above, at minimum

- `curl -s https://<your-domain>/api/health` is `{"ok":true,...}`, 200.
- `curl -s -H "Authorization: Bearer $STATUS_CHECK_TOKEN" https://<your-domain>/api/status`
  shows `ok: true`, or explains exactly which check is still catching up
  (a freshly restored database's backup-age check, for instance).
- The public menu loads, and the admin panel signs in.

## Verification log

Record of following the "Restoring from scratch" section literally, on a
machine that was not production, using nothing not written in it — per
module 18's own closing rule that this is what makes the section trusted.

| Date | What was followed | Times had to consult something not written here | What was added as a result |
|---|---|---|---|
| 2026-09-27 | The restore path (`npm run ops:restore-test`) against a disposable Postgres 17 + MinIO, driven by the same code this section documents | 0 — the section was written from this run, not the other way around | The measured 7.4 s recovery time and the 2026-09-27 date above |

The next time this is run against a real production-scale backup — not the
development seed — update the recovery-time line above and add a row here.
