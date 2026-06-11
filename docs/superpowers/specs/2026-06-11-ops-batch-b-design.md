# Ops Batch B — `/api/health` + PM2 log rotation (#67, #68)

**Date:** 2026-06-11
**Branch:** `fix/ops-batch-b-67-68`
**Scope:** Two "important security & infra" items from `docs/issuesMerged.md`. #67 is a small code change; #68 is ops + docs (no app code). No new app dependencies, no DB/schema changes, no migration.

## Context

Both verified against current `main` and the EC2 box (`ssh little`) on 2026-06-11:
- **#67:** No health route exists under `app/`. Existing `/api/v1/*` routes are whitelisted public in `auth.config.ts` (`pathname.startsWith('/api/v1/')`); a route at `/api/health` is NOT covered and needs an explicit allow.
- **#68:** App runs via `pm2 start npm -- start` (fork mode, cwd `/home/ubuntu/journal-app`). `pm2-logrotate` is NOT installed. The out-log `journal-app-out.log` is already **42 MB**. `pm2 save` is in use (dump.pm2 present). **scoringapp shares this PM2 instance** — pm2-logrotate is a global module and will cover both apps.

**Backups (#66) are explicitly out of scope** — deferred pending a possible GCP migration.

## #67 — `/api/health` readiness endpoint

**Goal:** A public, unauthenticated readiness check that verifies the app can actually serve requests (DB reachable), suitable for uptime monitoring / load-balancer probes.

**Design (testable split):**

- **`lib/health.ts`** — `export async function checkDatabaseHealth(db: HealthCheckDb): Promise<boolean>`. Runs `await db.$queryRaw\`SELECT 1\`` and returns `true`; on any thrown error returns `false`. `HealthCheckDb` is a minimal interface `{ $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> }` so the function is unit-testable with a fake client (no real DB, no Prisma import in the test).

- **`app/api/health/route.ts`** — thin handler:
  ```typescript
  export const dynamic = 'force-dynamic'

  export async function GET() {
    const healthy = await checkDatabaseHealth(prisma)
    if (!healthy) {
      return NextResponse.json({ status: 'error' }, { status: 503 })
    }
    return NextResponse.json({ status: 'ok' }, { status: 200 })
  }
  ```
  `dynamic = 'force-dynamic'` prevents static caching so the probe runs per-request. The response body intentionally carries no error detail (just `status`) — consistent with the #65 stack-trace-leak concern.

- **`auth.config.ts`** — extend the public allow check so `/api/health` is reachable unauthenticated. Add a `pathname === '/api/health'` condition alongside the existing `isPublicApi` / `isStaticAsset` checks.

**Error handling:** Any DB/connection failure is caught inside `checkDatabaseHealth` and surfaces as a 503 with `{status:'error'}`. The handler never throws.

**Test — `tests/lib/health.test.ts`:**
- `$queryRaw` resolves (e.g. returns `[{ '1': 1 }]`) → `checkDatabaseHealth` returns `true`.
- `$queryRaw` rejects (throws) → returns `false`.

**Docs:** Add a short `DEPLOYMENT.md` note that `GET /api/health` returns 200/503 for monitoring.

## #68 — PM2 log rotation

**Goal:** Stop unbounded PM2 log growth (out-log already 42 MB) and document the setup so it's reproducible.

**Committed repo artifact:** a `DEPLOYMENT.md` subsection documenting the pm2-logrotate install + configuration. There is **no app code change and no committed ecosystem file** (deliberately — see Non-goals).

**Live configuration on EC2 (run as the deploy step):**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # daily at midnight
pm2 flush journal-app                               # clear the current 42 MB out-log
```
This is a global PM2 module and applies to both `journal-app` and `scoringapp`. No app restart required.

**Verification:** `pm2 conf pm2-logrotate` shows the set values; `ls -lh ~/.pm2/logs/journal-app-out.log` shows the flushed (small) log; the app remains `online`.

## Non-goals (deliberately deferred)

- **#66 automated encrypted backups** — pending GCP decision.
- **Committed `ecosystem.config.js`** — the app launches fine via `pm2 start npm -- start`; introducing an ecosystem file restructures the launch and is lower-value given a possible platform move. pm2-logrotate solves the actual disk-fill problem.
- **`/api/health` auth or rate-limiting** — health checks are public by convention; the body leaks nothing sensitive.
- **Extended health detail** (version, uptime, dependency matrix) — YAGNI; a binary ready/not-ready is what monitoring needs.

## Verification (before merge)

- `npm test` green (new `health.test.ts` + existing suite).
- `npm run build` green.
- Dev-server smoke: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health` → 200 with the DB up.

## Deployment

- **#67:** standard code deploy — backup DB → `git pull` → `npm run build` → `pm2 restart journal-app`. No migration, no `npm install`. Verify `curl http://localhost:3000/api/health` → 200 on the box.
- **#68:** run the pm2-logrotate commands above on EC2. No build/restart.

## Tracker updates (on completion)

Mark #67, #68 closed in `docs/issuesMerged.md` and `ISSUES.md`.
