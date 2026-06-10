# Design: N2.x Performance Hardening

**Date:** 2026-06-09
**Branch:** `fix/perf-n2x`
**Source:** `docs/newissues.md` findings N2.2–N2.6
**Execution:** subagent-driven, one task per fix, review between tasks. One local-test pass, one deploy.

## Goal

Close out the entire N2.x performance cluster (two MED dashboard/cron wins + three LOW cleanups) in a single branch. No behavioral changes visible to users — only latency, query efficiency, and prod DB write-concurrency improvements. Output of each query/computation must be equivalent to today's.

## Scope decisions (confirmed with user)

- All 5 fixes in one branch (`fix/perf-n2x`), one deploy.
- N2.6: **enable in code + document** (not document-only).
- N2.3: full batch-fetch rework (not the minimal `Promise.all`-chunk-only variant).

---

## N2.2 — Parallelize dashboard achievement evaluation `[MED]`

**Where:** `app/dashboard/page.tsx` (~lines 129–150), `lib/achievementEvaluator.ts`

**Current state:** Dashboard runs a first `Promise.all` (11 parallel fetches), then *serially* runs the achievement chain (`await evaluateAchievements(...)` then `await getAndMarkUnnotifiedAchievements(...)`), then a second `Promise.all` for `getUserRulesWithStatus` + `getRuleCalendarData`.

**Key finding (verified):** Achievement evaluation **writes** `userAchievement` (creates) and `userInventory` (upserts), and **reads** `userAchievement`. The second `Promise.all` (rules/calendar) reads **neither** `userAchievement` nor `userInventory`. There is **no real data dependency** — the serialization is incidental ordering.

**Fix:**
1. Collapse the achievement chain and the rules/calendar fetch into **one `Promise.all`**. The achievement chain becomes a single async sub-thunk inside the `Promise.all` that preserves internal order: `evaluateAchievements` → `getAndMarkUnnotifiedAchievements` (the second reads what the first writes — this ordering MUST hold).
2. In `lib/achievementEvaluator.ts`, wrap the per-tier `userAchievement.create` calls + per-reward `userInventory.upsert` calls in a single `prisma.$transaction([...])` (batched writes, the tracker's third ask).

**Net effect:** achievement eval latency overlaps with rule/calendar latency instead of stacking on top.

**Risk:** Low. The reads-vs-writes analysis confirms independence. Must NOT reorder `evaluate` before `getAndMark`.

---

## N2.3 — De-N+1 the cron streak reminder `[MED]`

**Where:** `app/api/v1/cron/streak/route.ts` (~lines 44–76)

**Current state:** Sequential `for` loop over users-with-devices; each iteration awaits 3 queries before the next user:
1. `journalEntry.count` (today's entries)
2. `journalEntry.findMany` (recent 30, for streak calc)
3. `getFrozenDates(user.id)`

Then in-memory `calculateStreaks`, then per-user `sendPushNotification` if `streak > 1`.

**Fix — batch-fetch upfront, index in memory:**
1. One query for today's entry counts across all candidate users (grouped/`IN` on userId, `createdAt >= todayStart`). NOTE: `todayStart` is per-user-timezone — so either fetch a recent window once and bucket per user in memory, or group appropriately. Implementation must preserve the per-timezone "today" semantics exactly.
2. One `findMany` for recent entries across all users (`userId IN (...)`, `select: { userId, createdAt }`, ordered), bucketed per user in memory (cap per user to the same 30 the old path used).
3. Batch frozen-dates fetch across all users (or one query) instead of per-user `getFrozenDates`.
4. Run `calculateStreaks` per user from the in-memory buckets — zero per-user DB round-trips.
5. Push sends fan out in `Promise.all` chunks of ~20 (keep per-user send, just parallelized).

**Equivalence requirement:** the set of users who get a push, and the streak value computed, must be identical to the old per-user path on a fixture set. This is the primary test.

**Risk:** Medium (most logic change). Mitigated by an equivalence unit test against the old path.

---

## N2.4 — Prompt indexes `[LOW]` (migration)

**Where:** `prisma/schema.prisma` (Prompt model), used by `app/lib/data.ts` `getActivePrompts`

**Current state:** Prompt model has **zero `@@index` declarations**. Queries filter on `(organizationId, isActive, isGlobal)` and `(organizationId, isActive, categoryId/categoryString)`.

**Fix:** Add to the Prompt model:
- `@@index([organizationId, isActive, isGlobal])` — global-prompt path
- `@@index([organizationId, isActive, categoryId])` — category path

Generate a Prisma migration (`CREATE INDEX` only — non-destructive, safe on the prod SQLite file).

**Risk:** Low. Additive indexes; no data change.

---

## N2.5 — Task select `[LOW]`

**Where:** `app/dashboard/page.tsx` (~lines 110–115), consumed by `components/TaskSidebar.tsx`

**Current state:** `prisma.taskAssignment.findMany({ ..., include: { task: true } })` pulls every Task column. `TaskSidebar` reads only `task.id`, `task.title`, `task.priority`, `task.dueDate`, `task.description`.

**Fix:** Narrow to `include: { task: { select: { id: true, title: true, priority: true, dueDate: true, description: true } } }`.

**Risk:** Low. Must confirm no other consumer of this query result reads a now-omitted field (trace the prop through the page).

---

## N2.6 — SQLite WAL + busy_timeout `[LOW]` (enable in code + document)

**Where:** `lib/prisma.ts`, `prisma/schema.prisma` datasource, `DEPLOYMENT.md`

**Current state:** Datasource is plain `provider = "sqlite"`. `lib/prisma.ts` constructs `new PrismaClient(...)` with no PRAGMA setup. Nothing sets WAL or busy_timeout — production runs SQLite defaults (rollback journal, ~5s default busy handling), which serialize readers against writers.

**Fix:**
1. In `lib/prisma.ts`, on client init run `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` via `$executeRawUnsafe`.
   - **Caveat:** WAL is a persistent file-level property (set once, sticks). `busy_timeout` is **per-connection**. With Prisma's SQLite connection handling, the PRAGMA must run reliably on the connection(s) actually used. Set at startup; the test reads back `PRAGMA journal_mode` to confirm `wal` actually took. Document the per-connection nuance.
2. Document WAL/busy_timeout in `DEPLOYMENT.md`, plus the existing Postgres-as-escape-hatch note for when concurrent users grow.

**Risk:** Low-Medium — touches the prod DB file (WAL switch). Non-destructive but prod-affecting; verify read-back in test, and the deploy runbook should note the one-time WAL switch. Honors "never impact historical user data" — WAL is a journaling-mode change, not a data change.

---

## Testing strategy

| Fix  | Test |
|------|------|
| N2.2 | Achievement upserts still happen; `evaluate`-before-`mark` ordering holds; dashboard render path unbroken. |
| N2.3 | Equivalence unit test: batch-fetch path yields identical push-recipient set + streak values vs. old per-user path on a fixture set. |
| N2.4 | Migration applies cleanly; indexes present in schema. |
| N2.5 | `TaskSidebar` renders identically with narrowed select; no other consumer reads omitted fields. |
| N2.6 | Read-back test confirms `journal_mode=wal`. |

**Before merge (all required):**
- `npx eslint` (NOT `npm run lint` — broken repo-wide since Next 16 removed `next lint`)
- `npm run build` (the `'use server'` re-export/non-async-export gotcha — tsc/vitest won't catch it)
- `vitest`

## Out of scope

- N1.x, N3.x, N4.x items (separate passes).
- Postgres migration (only documented as escape hatch, not implemented).
- Any user-visible behavior change.
