# Ops Batch B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public `/api/health` readiness endpoint (#67) and document PM2 log rotation (#68).

**Architecture:** #67 splits a unit-testable DB-ping (`lib/health.ts`) from a thin route handler (`app/api/health/route.ts`), plus a one-line public-route whitelist in `auth.config.ts`. #68 is documentation only in the repo (`DEPLOYMENT.md`); the live pm2-logrotate config is applied on EC2 during deploy. One feature branch (`fix/ops-batch-b-67-68`, already created). No new app dependencies, no DB/schema/migration changes.

**Tech Stack:** TypeScript, Next.js route handlers, Prisma (`@/lib/prisma`), Vitest (`npm test` → `vitest run`), `@/` path alias, PM2 + pm2-logrotate (ops).

**Spec:** `docs/superpowers/specs/2026-06-11-ops-batch-b-design.md`

---

## File Structure

- `lib/health.ts` — **create**: `checkDatabaseHealth(db)` — runs `SELECT 1`, returns boolean.
- `tests/lib/health.test.ts` — **create**: unit tests with a fake DB client.
- `app/api/health/route.ts` — **create**: thin `GET` handler returning 200/503.
- `auth.config.ts` — **modify**: whitelist `/api/health` as public.
- `DEPLOYMENT.md` — **modify**: document the health endpoint (#67) and pm2-logrotate setup (#68).

---

## Task 1: `checkDatabaseHealth` helper (#67)

**Files:**
- Create: `lib/health.ts`
- Test: `tests/lib/health.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { checkDatabaseHealth } from '@/lib/health'

describe('checkDatabaseHealth', () => {
  it('returns true when the query resolves', async () => {
    const db = { $queryRaw: () => Promise.resolve([{ '1': 1 }]) }
    expect(await checkDatabaseHealth(db)).toBe(true)
  })

  it('returns false when the query rejects', async () => {
    const db = { $queryRaw: () => Promise.reject(new Error('db down')) }
    expect(await checkDatabaseHealth(db)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/health.test.ts`
Expected: FAIL — cannot find module `@/lib/health`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/health.ts`:

```typescript
/**
 * Minimal shape of the Prisma client needed for a health probe (#67). Declared
 * structurally so the check is unit-testable with a fake client — no Prisma
 * import required in tests.
 */
export interface HealthCheckDb {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
}

/**
 * Readiness probe for #67: confirms the database is reachable by running a
 * trivial `SELECT 1`. Returns true if it succeeds, false on any error. Never
 * throws — the caller maps the boolean to a 200/503 response.
 */
export async function checkDatabaseHealth(db: HealthCheckDb): Promise<boolean> {
    try {
        await db.$queryRaw`SELECT 1`
        return true
    } catch {
        return false
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/health.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add lib/health.ts tests/lib/health.test.ts
git commit -m "feat(ops): add checkDatabaseHealth readiness probe (#67)"
```

---

## Task 2: `/api/health` route handler (#67)

**Files:**
- Create: `app/api/health/route.ts`

No unit test for the route itself (its logic is `checkDatabaseHealth`, already tested in Task 1); it is exercised by the dev-server smoke test in Task 5.

- [ ] **Step 1: Create the route handler**

Create `app/api/health/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkDatabaseHealth } from '@/lib/health'

// Force per-request execution so the probe is never statically cached.
export const dynamic = 'force-dynamic'

export async function GET() {
    const healthy = await checkDatabaseHealth(prisma)
    if (!healthy) {
        // Intentionally no error detail in the body (avoids info leak, cf. #65).
        return NextResponse.json({ status: 'error' }, { status: 503 })
    }
    return NextResponse.json({ status: 'ok' }, { status: 200 })
}
```

- [ ] **Step 2: Verify the build compiles the route**

Run: `npx tsc --noEmit`
Expected: no errors related to `app/api/health/route.ts`. (Pre-existing unrelated errors elsewhere are fine; only this file must be clean. The `prisma` client must satisfy the `HealthCheckDb` interface — it does, since the real Prisma client has a `$queryRaw` tagged-template method.)

- [ ] **Step 3: Commit**

```bash
git add app/api/health/route.ts
git commit -m "feat(ops): add GET /api/health endpoint (#67)"
```

---

## Task 3: Whitelist `/api/health` as a public route (#67)

**Files:**
- Modify: `auth.config.ts`

- [ ] **Step 1: Add the health-check allow condition**

In `auth.config.ts`, the `authorized` callback currently computes (around lines 24-26):

```typescript
            const isPublicApi = pathname.startsWith('/api/v1/');
            const isStaticAsset = ['/icon.png', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml'].includes(pathname);
```

Add a health-check constant immediately after `isPublicApi`:

```typescript
            const isPublicApi = pathname.startsWith('/api/v1/');
            const isHealthCheck = pathname === '/api/health';
            const isStaticAsset = ['/icon.png', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml'].includes(pathname);
```

Then find the guard that allows public routes (it reads `if (isPublicPath || isPublicApi || isStaticAsset) {`) and add `isHealthCheck`:

```typescript
            if (isPublicPath || isPublicApi || isHealthCheck || isStaticAsset) {
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `auth.config.ts`.

- [ ] **Step 3: Commit**

```bash
git add auth.config.ts
git commit -m "feat(ops): allow unauthenticated access to /api/health (#67)"
```

---

## Task 4: Document health endpoint and pm2-logrotate in DEPLOYMENT.md (#67, #68)

**Files:**
- Modify: `DEPLOYMENT.md`

- [ ] **Step 1: Locate a sensible insertion point**

Run: `grep -niE "pm2|monitor|health|operations|maintenance|logs" DEPLOYMENT.md | head`
Identify the PM2 / operations area of the doc. Match the file's existing heading level for subsections (the file uses `###` for subsections — confirm by inspection).

- [ ] **Step 2: Add the health-endpoint note (#67)**

Insert this subsection in the operations/monitoring area (adjust heading level to match the file):

```markdown
### Health endpoint

`GET /api/health` is a public, unauthenticated readiness probe. It runs a
lightweight `SELECT 1` against the database and returns:

- `200 {"status":"ok"}` when the database is reachable.
- `503 {"status":"error"}` when it is not.

Use it for uptime monitoring or a load-balancer health check, e.g.
`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health`.
```

- [ ] **Step 3: Add the pm2-logrotate runbook (#68)**

Insert this subsection near the PM2 documentation:

```markdown
### PM2 log rotation

PM2 does not rotate logs by default, so `~/.pm2/logs/journal-app-out.log` grows
unbounded. Configure the `pm2-logrotate` module once per host (it is global and
covers every PM2-managed app on the box, including scoringapp):

\`\`\`bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M            # rotate when a log reaches 10 MB
pm2 set pm2-logrotate:retain 7                # keep 7 rotated files
pm2 set pm2-logrotate:compress true           # gzip rotated files
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'  # also rotate daily at midnight
pm2 flush journal-app                         # clear the current (large) log once
\`\`\`

Verify with `pm2 conf pm2-logrotate`. No app restart is required.
```

(Note: the inner code fence above uses escaped backticks so it renders as a real
fenced block — write it as a normal ```bash fenced block in the file.)

- [ ] **Step 4: Verify the file reads cleanly**

Run: `grep -nA2 "Health endpoint" DEPLOYMENT.md; grep -nA2 "PM2 log rotation" DEPLOYMENT.md`
Expected: both subsections present with correct fenced code blocks.

- [ ] **Step 5: Commit**

```bash
git add DEPLOYMENT.md
git commit -m "docs(ops): document /api/health (#67) and pm2-logrotate setup (#68)"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green, including the new `tests/lib/health.test.ts`.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build completes with no type errors. `/api/health` appears in the route list as a dynamic (ƒ) route.

- [ ] **Step 3: Dev-server smoke test**

Start the dev server (`npm run dev`), then:

Run: `curl -s -w "\n%{http_code}\n" http://localhost:3000/api/health`
Expected: body `{"status":"ok"}` and HTTP `200` (database is up locally).

- [ ] **Step 4: Update issue trackers**

Mark #67 and #68 as closed in `docs/issuesMerged.md` (move them out of the OPEN important security/infra table into the FIXED table; update the Tally counts and the remaining-open list) and in `ISSUES.md` (add to a "Recently Closed" subsection; remove from the open Security & Infra table).

```bash
git add docs/issuesMerged.md ISSUES.md
git commit -m "docs(ops): mark #67, #68 closed in trackers"
```

---

## Self-Review Notes

- **Spec coverage:** #67 → Tasks 1 (helper), 2 (route), 3 (whitelist), 4 step 2 (docs); #68 → Task 4 step 3 (docs) + live EC2 config at deploy. Verification → Task 5. All spec sections mapped.
- **Type consistency:** `checkDatabaseHealth(db: HealthCheckDb): Promise<boolean>` defined in Task 1 and consumed in Task 2 with the real `prisma` client (structurally satisfies `HealthCheckDb`). `isHealthCheck` introduced and used in the same Task 3 edit.
- **No placeholders:** every code step shows complete code; every run step shows the command and expected result.
- **#68 note:** the only committed artifact is the `DEPLOYMENT.md` runbook; the actual pm2-logrotate install/config/flush runs on EC2 during deploy (out of band from these commits), per the spec.
