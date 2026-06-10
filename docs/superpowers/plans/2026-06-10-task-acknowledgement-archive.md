# Task Acknowledgement + Next-Day Auto-Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user completes a task, surface it to the admin in an in-app queue; let the admin acknowledge it (with an optional note) which pops a one-time confirmation toast on the user's dashboard; then auto-archive the task the next day, lazily on page load.

**Architecture:** All business logic lives in two new testable `lib/` modules (`lib/taskArchive.ts`, `lib/taskAcknowledgements.ts`) that take a `PrismaClient` and plain params — mirroring the existing `setDayLike` / `achievementEvaluator` convention. Server actions and pages are thin wrappers. Acknowledgement state is stored as four new nullable columns on `TaskAssignment`. Auto-archive runs at the top of the dashboard and admin-tasks page loads (no scheduler). The user toast reuses the existing `ToastProvider`, marked-on-server-render like `AchievementToasts`.

**Tech Stack:** Next.js 16 (App Router, server components + server actions), Prisma + SQLite, Tailwind v4, Vitest (node env for lib/DB tests, jsdom env for component tests via `// @vitest-environment jsdom`), `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-06-10-task-acknowledgement-archive-design.md`

---

## File Structure

**New files:**
- `lib/taskArchive.ts` — `isTaskArchivable()` (pure) + `archiveAcknowledgedTasks(prisma, orgId)` (DB).
- `lib/taskAcknowledgements.ts` — `acknowledgeCompletion()`, `getPendingAcknowledgements()`, `countPendingAcknowledgements()`, `getAndMarkAcknowledgements()`, `canUncomplete()`.
- `components/admin/AcknowledgeCompletionItem.tsx` — client row with note input + Acknowledge button.
- `components/AcknowledgementToasts.tsx` — client toast trigger for the user dashboard.
- `tests/lib/taskArchive.test.ts`
- `tests/lib/taskAcknowledgements.test.ts`
- `tests/components/acknowledgementToasts.test.tsx`
- `tests/components/adminSidebarBadge.test.tsx`

**Modified files:**
- `prisma/schema.prisma` — 4 new columns + index on `TaskAssignment`.
- `app/actions/tasks.ts` — new `acknowledgeCompletion` action wrapper; `uncompleteTask` guard.
- `app/admin/page.tsx` — render the pending-acknowledgement queue card.
- `app/admin/layout.tsx` — fetch pending count, pass to sidebar.
- `components/admin/AdminSidebar.tsx` — accept `pendingAcknowledgements` prop, render badge on Tasks.
- `app/dashboard/page.tsx` — run auto-archive, fetch+mark acknowledgements, render toasts.
- `app/admin/tasks/page.tsx` — run auto-archive at top of load.

---

## Task 1: Schema — acknowledgement columns on TaskAssignment

**Files:**
- Modify: `prisma/schema.prisma:192-205`

- [ ] **Step 1: Add the four nullable columns and index**

Replace the `TaskAssignment` model (currently at `prisma/schema.prisma:192-205`) with:

```prisma
model TaskAssignment {
  id          String    @id @default(uuid())
  taskId      String
  task        Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation("TaskAssignments", fields: [userId], references: [id], onDelete: Cascade)
  completedAt DateTime?
  notes       String?
  acknowledgedAt      DateTime?
  acknowledgedById    String?
  acknowledgementNote String?
  userNotifiedAt      DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([taskId, userId])
  @@index([userId, completedAt])
  @@index([acknowledgedAt])
}
```

(`acknowledgedById` is a plain column — no relation; the admin's display name is resolved by a separate lookup to keep the schema simple.)

- [ ] **Step 2: Create the migration**

Run: `npx prisma migrate dev --name task_acknowledgement`
Expected: a new folder `prisma/migrations/<timestamp>_task_acknowledgement/migration.sql` is created adding 4 columns + index; Prisma Client regenerates without error.

> Note: this is local only. Production deploy uses `npx prisma migrate deploy` (forward-only). Do NOT run `migrate reset`.

- [ ] **Step 3: Verify the client picks up the fields**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: no type errors. (The new fields are now part of the generated `TaskAssignment` type.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(tasks): add acknowledgement columns to TaskAssignment"
```

---

## Task 2: `isTaskArchivable` pure helper

**Files:**
- Create: `lib/taskArchive.ts`
- Test: `tests/lib/taskArchive.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/taskArchive.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isTaskArchivable } from '@/lib/taskArchive'

const start = new Date('2026-06-10T04:00:00.000Z') // midnight ET on 2026-06-10
const yesterday = new Date('2026-06-09T15:00:00.000Z')
const todayLater = new Date('2026-06-10T13:00:00.000Z')

describe('isTaskArchivable', () => {
  it('returns false for a task with no assignments', () => {
    expect(isTaskArchivable([])).toBe(false)
  })

  it('archives a single assignment acknowledged before today', () => {
    expect(isTaskArchivable([{ acknowledgedAt: yesterday, startOfTodayUtc: start }])).toBe(true)
  })

  it('does not archive an assignment acknowledged today', () => {
    expect(isTaskArchivable([{ acknowledgedAt: todayLater, startOfTodayUtc: start }])).toBe(false)
  })

  it('does not archive when acknowledgedAt equals start of today', () => {
    expect(isTaskArchivable([{ acknowledgedAt: start, startOfTodayUtc: start }])).toBe(false)
  })

  it('does not archive when any assignment is unacknowledged', () => {
    expect(isTaskArchivable([
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
      { acknowledgedAt: null, startOfTodayUtc: start },
    ])).toBe(false)
  })

  it('archives only when every assignment is acknowledged before its own today', () => {
    expect(isTaskArchivable([
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
    ])).toBe(true)
  })

  it('does not archive when one assignment was acknowledged today (different tz boundary)', () => {
    expect(isTaskArchivable([
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
      { acknowledgedAt: todayLater, startOfTodayUtc: new Date('2026-06-10T07:00:00.000Z') },
    ])).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/taskArchive.test.ts`
Expected: FAIL — `isTaskArchivable` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/taskArchive.ts`:

```ts
export type ArchivableAssignment = {
  acknowledgedAt: Date | null
  startOfTodayUtc: Date
}

/**
 * A task is archivable when it has at least one assignment and EVERY assignment
 * has been acknowledged strictly before the start of its assignee's current local day.
 */
export function isTaskArchivable(assignments: ArchivableAssignment[]): boolean {
  if (assignments.length === 0) return false
  return assignments.every(
    (a) => a.acknowledgedAt !== null && a.acknowledgedAt.getTime() < a.startOfTodayUtc.getTime()
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/taskArchive.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/taskArchive.ts tests/lib/taskArchive.test.ts
git commit -m "feat(tasks): add isTaskArchivable pure helper"
```

---

## Task 3: `archiveAcknowledgedTasks` (DB orchestrator)

**Files:**
- Modify: `lib/taskArchive.ts`
- Test: `tests/lib/taskArchive.test.ts` (add a new describe block)

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/taskArchive.test.ts` (add imports at top: `beforeAll, afterAll` to the existing `vitest` import line, and the DB helpers):

```ts
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { archiveAcknowledgedTasks } from '@/lib/taskArchive'

describe('archiveAcknowledgedTasks', () => {
  let db: TestDb
  beforeAll(() => { db = createTestDb() })
  afterAll(async () => { await db.cleanup() })

  async function makeTask(prisma: TestDb['prisma'], orgId: string, createdById: string) {
    return prisma.task.create({ data: { title: 'T', organizationId: orgId, createdById } })
  }

  it('archives a task whose only assignment was acknowledged yesterday', async () => {
    const { org, user } = await createUserFixture(db.prisma)
    const task = await makeTask(db.prisma, org.id, user.id)
    await db.prisma.taskAssignment.create({
      data: {
        taskId: task.id, userId: user.id,
        completedAt: new Date('2026-06-09T15:00:00.000Z'),
        acknowledgedAt: new Date('2020-01-01T00:00:00.000Z'), // long ago → before today
      },
    })

    const count = await archiveAcknowledgedTasks(db.prisma, org.id)
    expect(count).toBe(1)
    const after = await db.prisma.task.findUnique({ where: { id: task.id } })
    expect(after!.archivedAt).not.toBeNull()
  })

  it('does not archive a task acknowledged just now (today)', async () => {
    const { org, user } = await createUserFixture(db.prisma)
    const task = await makeTask(db.prisma, org.id, user.id)
    await db.prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id, completedAt: new Date(), acknowledgedAt: new Date() },
    })

    const count = await archiveAcknowledgedTasks(db.prisma, org.id)
    expect(count).toBe(0)
    const after = await db.prisma.task.findUnique({ where: { id: task.id } })
    expect(after!.archivedAt).toBeNull()
  })

  it('does not archive a multi-assignee task until all are acknowledged', async () => {
    const { org, user } = await createUserFixture(db.prisma)
    const second = await db.prisma.user.create({
      data: { email: `u2-${Date.now()}@test.local`, password: 'x', organizationId: org.id },
    })
    const task = await makeTask(db.prisma, org.id, user.id)
    await db.prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id, completedAt: new Date(), acknowledgedAt: new Date('2020-01-01T00:00:00.000Z') },
    })
    await db.prisma.taskAssignment.create({
      data: { taskId: task.id, userId: second.id, completedAt: new Date() }, // not acknowledged
    })

    const count = await archiveAcknowledgedTasks(db.prisma, org.id)
    expect(count).toBe(0)
  })

  it('ignores already-archived tasks and tasks with no acknowledgements', async () => {
    const { org, user } = await createUserFixture(db.prisma)
    const task = await makeTask(db.prisma, org.id, user.id)
    await db.prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id, completedAt: new Date() }, // completed, not acknowledged
    })
    const count = await archiveAcknowledgedTasks(db.prisma, org.id)
    expect(count).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/taskArchive.test.ts`
Expected: FAIL — `archiveAcknowledgedTasks` not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/taskArchive.ts` (add the import at the very top of the file):

```ts
import type { PrismaClient } from '@prisma/client'
import { DEFAULT_TIMEZONE, getTodayForUser, startOfDayInTimezone } from '@/lib/timezone'
```

```ts
/**
 * Lazily archive tasks in an org whose assignments are all acknowledged before
 * the start of each assignee's current local day. Returns the number archived.
 * Uses the passed-in prisma so it is testable against an isolated test DB.
 */
export async function archiveAcknowledgedTasks(prisma: PrismaClient, orgId: string): Promise<number> {
  const candidates = await prisma.task.findMany({
    where: {
      organizationId: orgId,
      archivedAt: null,
      assignments: { some: { acknowledgedAt: { not: null } } },
    },
    select: {
      id: true,
      assignments: { select: { acknowledgedAt: true, userId: true } },
    },
  })
  if (candidates.length === 0) return 0

  const userIds = [...new Set(candidates.flatMap((t) => t.assignments.map((a) => a.userId)))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, timezone: true },
  })
  const tzByUser = new Map(users.map((u) => [u.id, u.timezone || DEFAULT_TIMEZONE]))

  const startCache = new Map<string, Date>()
  const startFor = (tz: string): Date => {
    let s = startCache.get(tz)
    if (!s) {
      s = startOfDayInTimezone(getTodayForUser(tz), tz)
      startCache.set(tz, s)
    }
    return s
  }

  const toArchive = candidates
    .filter((t) =>
      isTaskArchivable(
        t.assignments.map((a) => ({
          acknowledgedAt: a.acknowledgedAt,
          startOfTodayUtc: startFor(tzByUser.get(a.userId) || DEFAULT_TIMEZONE),
        }))
      )
    )
    .map((t) => t.id)

  if (toArchive.length === 0) return 0
  const res = await prisma.task.updateMany({
    where: { id: { in: toArchive } },
    data: { archivedAt: new Date() },
  })
  return res.count
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/taskArchive.test.ts`
Expected: PASS (all tests, including the 4 new DB-backed ones).

- [ ] **Step 5: Commit**

```bash
git add lib/taskArchive.ts tests/lib/taskArchive.test.ts
git commit -m "feat(tasks): add archiveAcknowledgedTasks lazy archiver"
```

---

## Task 4: `acknowledgeCompletion` + `canUncomplete` (core logic)

**Files:**
- Create: `lib/taskAcknowledgements.ts`
- Test: `tests/lib/taskAcknowledgements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/taskAcknowledgements.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { acknowledgeCompletion, canUncomplete } from '@/lib/taskAcknowledgements'

describe('acknowledgeCompletion', () => {
  let db: TestDb
  beforeAll(() => { db = createTestDb() })
  afterAll(async () => { await db.cleanup() })

  async function setup() {
    const { org, user } = await createUserFixture(db.prisma)
    const admin = await db.prisma.user.create({
      data: { email: `admin-${Date.now()}@test.local`, password: 'x', organizationId: org.id, name: 'Becca', role: 'ADMIN' },
    })
    const task = await db.prisma.task.create({ data: { title: 'Meds', organizationId: org.id, createdById: admin.id } })
    const assignment = await db.prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id, completedAt: new Date() },
    })
    return { org, user, admin, task, assignment }
  }

  it('sets acknowledgedAt, acknowledgedById and trimmed note', async () => {
    const { org, admin, assignment } = await setup()
    const res = await acknowledgeCompletion(db.prisma, {
      assignmentId: assignment.id, adminId: admin.id, orgId: org.id, note: '  Nice work!  ',
    })
    expect(res).toEqual({ success: true })
    const after = await db.prisma.taskAssignment.findUnique({ where: { id: assignment.id } })
    expect(after!.acknowledgedAt).not.toBeNull()
    expect(after!.acknowledgedById).toBe(admin.id)
    expect(after!.acknowledgementNote).toBe('Nice work!')
  })

  it('stores null note when note is empty/whitespace', async () => {
    const { org, admin, assignment } = await setup()
    await acknowledgeCompletion(db.prisma, { assignmentId: assignment.id, adminId: admin.id, orgId: org.id, note: '   ' })
    const after = await db.prisma.taskAssignment.findUnique({ where: { id: assignment.id } })
    expect(after!.acknowledgementNote).toBeNull()
  })

  it('caps the note at 280 characters', async () => {
    const { org, admin, assignment } = await setup()
    await acknowledgeCompletion(db.prisma, { assignmentId: assignment.id, adminId: admin.id, orgId: org.id, note: 'x'.repeat(500) })
    const after = await db.prisma.taskAssignment.findUnique({ where: { id: assignment.id } })
    expect(after!.acknowledgementNote!.length).toBe(280)
  })

  it('rejects when the assignment belongs to another org', async () => {
    const { admin, assignment } = await setup()
    const res = await acknowledgeCompletion(db.prisma, {
      assignmentId: assignment.id, adminId: admin.id, orgId: 'some-other-org', note: '',
    })
    expect(res).toEqual({ error: 'Unauthorized' })
  })

  it('rejects when the assignment is not completed', async () => {
    const { org, admin, user } = await setup()
    // Fresh task so the (taskId,userId) unique pair does not collide with setup()'s assignment.
    const t2 = await db.prisma.task.create({ data: { title: 'T2', organizationId: org.id, createdById: admin.id } })
    const incomplete = await db.prisma.taskAssignment.create({ data: { taskId: t2.id, userId: user.id } })
    const res = await acknowledgeCompletion(db.prisma, { assignmentId: incomplete.id, adminId: admin.id, orgId: org.id })
    expect(res).toEqual({ error: 'Task not completed' })
  })

  it('is a no-op success when already acknowledged', async () => {
    const { org, admin, assignment } = await setup()
    await acknowledgeCompletion(db.prisma, { assignmentId: assignment.id, adminId: admin.id, orgId: org.id, note: 'first' })
    const res = await acknowledgeCompletion(db.prisma, { assignmentId: assignment.id, adminId: admin.id, orgId: org.id, note: 'second' })
    expect(res).toEqual({ success: true })
    const after = await db.prisma.taskAssignment.findUnique({ where: { id: assignment.id } })
    expect(after!.acknowledgementNote).toBe('first') // unchanged
  })

  it('returns error for a missing assignment', async () => {
    const { org, admin } = await setup()
    const res = await acknowledgeCompletion(db.prisma, { assignmentId: 'nope', adminId: admin.id, orgId: org.id })
    expect(res).toEqual({ error: 'Assignment not found' })
  })
})

describe('canUncomplete', () => {
  it('allows uncomplete when not acknowledged', () => {
    expect(canUncomplete({ acknowledgedAt: null })).toBe(true)
  })
  it('blocks uncomplete once acknowledged', () => {
    expect(canUncomplete({ acknowledgedAt: new Date() })).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/taskAcknowledgements.test.ts`
Expected: FAIL — module `@/lib/taskAcknowledgements` not found.

- [ ] **Step 3: Write the implementation**

Create `lib/taskAcknowledgements.ts`:

```ts
import type { PrismaClient } from '@prisma/client'

const NOTE_MAX = 280

type AcknowledgeResult = { success: true } | { error: string }

/**
 * Core acknowledgement logic. Org-scoped, idempotent. The server-action wrapper
 * supplies adminId/orgId from the authenticated session.
 */
export async function acknowledgeCompletion(
  prisma: PrismaClient,
  params: { assignmentId: string; adminId: string; orgId: string; note?: string }
): Promise<AcknowledgeResult> {
  const { assignmentId, adminId, orgId, note } = params

  const assignment = await prisma.taskAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, completedAt: true, acknowledgedAt: true, task: { select: { organizationId: true } } },
  })
  if (!assignment) return { error: 'Assignment not found' }
  if (assignment.task.organizationId !== orgId) return { error: 'Unauthorized' }
  if (!assignment.completedAt) return { error: 'Task not completed' }
  if (assignment.acknowledgedAt) return { success: true } // already acknowledged — no-op

  const trimmed = note?.trim()
  await prisma.taskAssignment.update({
    where: { id: assignmentId },
    data: {
      acknowledgedAt: new Date(),
      acknowledgedById: adminId,
      acknowledgementNote: trimmed ? trimmed.slice(0, NOTE_MAX) : null,
    },
  })
  return { success: true }
}

/** Whether a completed assignment may still be un-completed by the user. */
export function canUncomplete(assignment: { acknowledgedAt: Date | null }): boolean {
  return assignment.acknowledgedAt === null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/taskAcknowledgements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/taskAcknowledgements.ts tests/lib/taskAcknowledgements.test.ts
git commit -m "feat(tasks): add acknowledgeCompletion + canUncomplete logic"
```

---

## Task 5: Query helpers — pending queue, count, mark-and-get

**Files:**
- Modify: `lib/taskAcknowledgements.ts`
- Test: `tests/lib/taskAcknowledgements.test.ts` (add describe blocks)

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/taskAcknowledgements.test.ts` (extend the top import to also pull the three new functions):

```ts
import { getPendingAcknowledgements, countPendingAcknowledgements, getAndMarkAcknowledgements } from '@/lib/taskAcknowledgements'

describe('pending acknowledgement queries', () => {
  let db: TestDb
  beforeAll(() => { db = createTestDb() })
  afterAll(async () => { await db.cleanup() })

  async function seed() {
    const { org, user } = await createUserFixture(db.prisma)
    const admin = await db.prisma.user.create({
      data: { email: `adm-${Date.now()}@test.local`, password: 'x', organizationId: org.id, name: 'Becca', role: 'ADMIN' },
    })
    const t1 = await db.prisma.task.create({ data: { title: 'Completed-unacked', organizationId: org.id, createdById: admin.id } })
    const a1 = await db.prisma.taskAssignment.create({ data: { taskId: t1.id, userId: user.id, completedAt: new Date() } })
    const t2 = await db.prisma.task.create({ data: { title: 'Not-completed', organizationId: org.id, createdById: admin.id } })
    await db.prisma.taskAssignment.create({ data: { taskId: t2.id, userId: user.id } })
    return { org, user, admin, t1, a1 }
  }

  it('getPendingAcknowledgements returns only completed-and-unacknowledged items', async () => {
    const { org, t1 } = await seed()
    const pending = await getPendingAcknowledgements(db.prisma, org.id)
    expect(pending).toHaveLength(1)
    expect(pending[0].taskTitle).toBe('Completed-unacked')
    expect(pending[0].taskId).toBe(t1.id)
    expect(pending[0].userName).toBeTruthy()
  })

  it('countPendingAcknowledgements matches the queue length', async () => {
    const { org } = await seed()
    expect(await countPendingAcknowledgements(db.prisma, org.id)).toBe(1)
  })

  it('count excludes archived tasks', async () => {
    const { org, t1 } = await seed()
    await db.prisma.task.update({ where: { id: t1.id }, data: { archivedAt: new Date() } })
    expect(await countPendingAcknowledgements(db.prisma, org.id)).toBe(0)
  })

  it('getAndMarkAcknowledgements returns acknowledged-but-unnotified items and stamps userNotifiedAt', async () => {
    const { org, user, admin, a1 } = await seed()
    await acknowledgeCompletion(db.prisma, { assignmentId: a1.id, adminId: admin.id, orgId: org.id, note: 'Great job' })

    const first = await getAndMarkAcknowledgements(db.prisma, user.id)
    expect(first).toHaveLength(1)
    expect(first[0].taskTitle).toBe('Completed-unacked')
    expect(first[0].note).toBe('Great job')
    expect(first[0].acknowledgedByName).toBe('Becca')

    // Second call returns nothing — already notified
    const second = await getAndMarkAcknowledgements(db.prisma, user.id)
    expect(second).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/taskAcknowledgements.test.ts`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/taskAcknowledgements.ts`:

```ts
/** Completed assignments awaiting admin acknowledgement, for the admin queue. */
export async function getPendingAcknowledgements(prisma: PrismaClient, orgId: string) {
  const pending = await prisma.taskAssignment.findMany({
    where: {
      completedAt: { not: null },
      acknowledgedAt: null,
      task: { organizationId: orgId, archivedAt: null },
    },
    select: {
      id: true,
      completedAt: true,
      task: { select: { id: true, title: true } },
      user: { select: { name: true, email: true } },
    },
    orderBy: { completedAt: 'asc' },
  })
  return pending.map((p) => ({
    assignmentId: p.id,
    taskId: p.task.id,
    taskTitle: p.task.title,
    userName: p.user.name || p.user.email,
    completedAt: p.completedAt as Date,
  }))
}

/** Count of completed-but-unacknowledged assignments, for the nav badge. */
export async function countPendingAcknowledgements(prisma: PrismaClient, orgId: string): Promise<number> {
  return prisma.taskAssignment.count({
    where: {
      completedAt: { not: null },
      acknowledgedAt: null,
      task: { organizationId: orgId, archivedAt: null },
    },
  })
}

export type AcknowledgementToast = {
  assignmentId: string
  taskTitle: string
  note: string | null
  acknowledgedByName: string
}

/**
 * Return this user's acknowledged-but-not-yet-shown confirmations, marking them
 * notified so each shows exactly once. Mirrors getAndMarkUnnotifiedAchievements.
 */
export async function getAndMarkAcknowledgements(
  prisma: PrismaClient,
  userId: string
): Promise<AcknowledgementToast[]> {
  const items = await prisma.taskAssignment.findMany({
    where: {
      userId,
      acknowledgedAt: { not: null },
      userNotifiedAt: null,
      task: { archivedAt: null },
    },
    select: {
      id: true,
      acknowledgementNote: true,
      acknowledgedById: true,
      task: { select: { title: true } },
    },
  })
  if (items.length === 0) return []

  await prisma.taskAssignment.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { userNotifiedAt: new Date() },
  })

  const adminIds = [...new Set(items.map((i) => i.acknowledgedById).filter((x): x is string => !!x))]
  const admins = adminIds.length
    ? await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true, email: true } })
    : []
  const nameById = new Map(admins.map((a) => [a.id, a.name || a.email]))

  return items.map((i) => ({
    assignmentId: i.id,
    taskTitle: i.task.title,
    note: i.acknowledgementNote,
    acknowledgedByName: i.acknowledgedById ? nameById.get(i.acknowledgedById) || 'An admin' : 'An admin',
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/taskAcknowledgements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/taskAcknowledgements.ts tests/lib/taskAcknowledgements.test.ts
git commit -m "feat(tasks): add acknowledgement queue/count/mark queries"
```

---

## Task 6: Server-action wrapper + uncomplete guard

**Files:**
- Modify: `app/actions/tasks.ts` (imports at top; `uncompleteTask` at `:263-285`; new action at end)

- [ ] **Step 1: Add imports**

At the top of `app/actions/tasks.ts`, after the existing imports (line 8), add:

```ts
import { acknowledgeCompletion as ackCompletion, canUncomplete } from '@/lib/taskAcknowledgements'
```

- [ ] **Step 2: Add the `uncompleteTask` guard**

In `app/actions/tasks.ts`, inside `uncompleteTask`, after the ownership check (currently lines 271-272):

```ts
        const result = await verifyAssignmentOwnership(assignmentId, userId, session.user.organizationId)
        if ('error' in result) return result

        if (!canUncomplete(result.assignment)) {
            return { error: 'This completion has been acknowledged and can no longer be undone' }
        }

        await prisma.taskAssignment.update({
            where: { id: assignmentId },
            data: { completedAt: null },
        })
```

(`verifyAssignmentOwnership` returns the full assignment record via `findUnique`, so `result.assignment.acknowledgedAt` is present.)

- [ ] **Step 3: Add the acknowledge server action**

Append to the end of `app/actions/tasks.ts`:

```ts
export async function acknowledgeCompletion(assignmentId: string, note?: string) {
    const session = await ensureAdmin()
    const adminId = session.user?.id
    if (!adminId) return { error: 'Could not resolve user' }

    const result = await ackCompletion(prisma, {
        assignmentId,
        adminId,
        orgId: session.user.organizationId,
        note,
    })
    if ('error' in result) return result

    revalidatePath('/admin')
    revalidatePath('/admin/tasks')
    return { success: true }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/actions/tasks.ts
git commit -m "feat(tasks): acknowledge action + block uncomplete after acknowledgement"
```

---

## Task 7: Admin queue UI on `/admin`

**Files:**
- Create: `components/admin/AcknowledgeCompletionItem.tsx`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Create the client acknowledge row**

Create `components/admin/AcknowledgeCompletionItem.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { acknowledgeCompletion } from '@/app/actions/tasks'

type Props = {
    assignmentId: string
    taskTitle: string
    userName: string
    completedLabel: string
}

export function AcknowledgeCompletionItem({ assignmentId, taskTitle, userName, completedLabel }: Props) {
    const [note, setNote] = useState('')
    const [isPending, startTransition] = useTransition()
    const [done, setDone] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (done) return null

    const onAcknowledge = () => {
        setError(null)
        startTransition(async () => {
            const res = await acknowledgeCompletion(assignmentId, note)
            if (res && 'error' in res) setError(res.error)
            else setDone(true)
        })
    }

    return (
        <div className="flex flex-col gap-2 p-4 border border-white/10 rounded-xl bg-white/[0.02]">
            <div className="text-sm text-white">
                <span className="font-medium">{userName}</span>
                <span className="text-gray-400"> completed </span>
                <span className="font-medium">“{taskTitle}”</span>
            </div>
            <div className="text-xs text-gray-500">{completedLabel}</div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={280}
                    placeholder="Optional note to the user…"
                    className="flex-1 text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                />
                <button
                    onClick={onAcknowledge}
                    disabled={isPending}
                    className="shrink-0 text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                    {isPending ? 'Acknowledging…' : 'Acknowledge'}
                </button>
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
        </div>
    )
}
```

- [ ] **Step 2: Render the queue on the admin home**

In `app/admin/page.tsx`, add imports near the top (after line 6):

```ts
import { getPendingAcknowledgements } from "@/lib/taskAcknowledgements"
import { getUserTimezone } from "@/lib/timezone"
import { AcknowledgeCompletionItem } from "@/components/admin/AcknowledgeCompletionItem"
```

Then, after the `responseRate` calculation (line 189) and before `return (`, add:

```ts
    const pendingAcks = await getPendingAcknowledgements(prisma, organizationId)
    const adminTimezone = await getUserTimezone(session?.user?.id)
    const fmtCompleted = (d: Date) =>
        d.toLocaleDateString('en-US', { timeZone: adminTimezone, month: 'short', day: 'numeric' }) +
        ' · ' +
        d.toLocaleTimeString('en-US', { timeZone: adminTimezone, hour: 'numeric', minute: '2-digit' })
```

Finally, insert this block inside the returned JSX, immediately after the opening `<div>` and before `<h1 ...>Overview</h1>` (line 193):

```tsx
            {pendingAcks.length > 0 && (
                <div className="mb-8 glass-card border border-amber-500/20 rounded-xl p-6">
                    <h2 className="text-lg font-bold text-white mb-1">Completions awaiting acknowledgement</h2>
                    <p className="text-sm text-gray-400 mb-4">{pendingAcks.length} completed {pendingAcks.length === 1 ? 'task' : 'tasks'} need your sign-off.</p>
                    <div className="space-y-2">
                        {pendingAcks.map((p) => (
                            <AcknowledgeCompletionItem
                                key={p.assignmentId}
                                assignmentId={p.assignmentId}
                                taskTitle={p.taskTitle}
                                userName={p.userName}
                                completedLabel={`Completed ${fmtCompleted(p.completedAt)}`}
                            />
                        ))}
                    </div>
                </div>
            )}
```

- [ ] **Step 3: Typecheck + manual verification**

Run: `npx tsc --noEmit`
Expected: no errors.

Then start the dev server if not running (`npm run dev`), log in as an admin, and from a user dashboard complete a task. Load `/admin` — confirm the "Completions awaiting acknowledgement" card lists it, typing a note and clicking **Acknowledge** removes the row.
Expected: row disappears after acknowledging; no console errors.

- [ ] **Step 4: Commit**

```bash
git add components/admin/AcknowledgeCompletionItem.tsx app/admin/page.tsx
git commit -m "feat(admin): completions-awaiting-acknowledgement queue on admin home"
```

---

## Task 8: Admin sidebar Tasks badge

**Files:**
- Modify: `components/admin/AdminSidebar.tsx`
- Modify: `app/admin/layout.tsx`
- Test: `tests/components/adminSidebarBadge.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `tests/components/adminSidebarBadge.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))
vi.mock('@/components/BrandingProvider', () => ({ useBranding: () => ({ siteName: 'X', logoUrl: null }) }))

import { AdminSidebar } from '@/components/admin/AdminSidebar'

afterEach(() => cleanup())

describe('AdminSidebar pending-acknowledgement badge', () => {
  it('shows the count badge when there are pending acknowledgements', () => {
    render(<AdminSidebar pendingAcknowledgements={3} />)
    expect(screen.getByTestId('tasks-ack-badge')).toHaveTextContent('3')
  })

  it('renders no badge when count is zero', () => {
    render(<AdminSidebar pendingAcknowledgements={0} />)
    expect(screen.queryByTestId('tasks-ack-badge')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/adminSidebarBadge.test.tsx`
Expected: FAIL — `AdminSidebar` does not accept the prop / no badge element.

- [ ] **Step 3: Add the prop and badge**

In `components/admin/AdminSidebar.tsx`, change the component signature (line 64) and the Tasks link (lines 117-119).

Signature:

```tsx
export function AdminSidebar({ pendingAcknowledgements = 0 }: { pendingAcknowledgements?: number }) {
```

Replace the Tasks `<Link>` (lines 117-119) with:

```tsx
                <Link href="/admin/tasks" className={linkClass('/admin/tasks')} onClick={() => setIsOpen(false)}>
                    <span className="inline-flex items-center justify-between w-full">
                        <span>Tasks</span>
                        {pendingAcknowledgements > 0 && (
                            <span
                                data-testid="tasks-ack-badge"
                                className="ml-2 text-xs bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded-full"
                            >
                                {pendingAcknowledgements}
                            </span>
                        )}
                    </span>
                </Link>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/adminSidebarBadge.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the count in the layout**

In `app/admin/layout.tsx`, replace the file body with:

```tsx
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import { prisma } from "@/lib/prisma"
import { countPendingAcknowledgements } from "@/lib/taskAcknowledgements"

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
        redirect("/dashboard")
    }

    const pendingAcknowledgements = await countPendingAcknowledgements(prisma, session.user.organizationId)

    return (
        <div className="flex flex-col md:flex-row h-screen bg-background text-foreground">
            {/* Sidebar (Handles its own responsive rendering) */}
            <AdminSidebar pendingAcknowledgements={pendingAcknowledgements} />

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8">
                {children}
            </main>
        </div>
    )
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/admin/AdminSidebar.tsx app/admin/layout.tsx tests/components/adminSidebarBadge.test.tsx
git commit -m "feat(admin): pending-acknowledgement badge on Tasks nav"
```

---

## Task 9: User dashboard — confirmation toasts

**Files:**
- Create: `components/AcknowledgementToasts.tsx`
- Modify: `app/dashboard/page.tsx`
- Test: `tests/components/acknowledgementToasts.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `tests/components/acknowledgementToasts.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { AcknowledgementToasts } from '@/components/AcknowledgementToasts'

afterEach(() => { cleanup(); addToastMock.mockReset(); vi.useRealTimers() })

describe('AcknowledgementToasts', () => {
  it('fires one toast per item', () => {
    vi.useFakeTimers()
    render(<AcknowledgementToasts items={[
      { assignmentId: 'a1', taskTitle: 'Meds', note: 'Nice', acknowledgedByName: 'Becca' },
      { assignmentId: 'a2', taskTitle: 'Water', note: null, acknowledgedByName: 'Becca' },
    ]} />)
    vi.runAllTimers()
    expect(addToastMock).toHaveBeenCalledTimes(2)
  })

  it('fires nothing for an empty list', () => {
    vi.useFakeTimers()
    render(<AcknowledgementToasts items={[]} />)
    vi.runAllTimers()
    expect(addToastMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/acknowledgementToasts.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `components/AcknowledgementToasts.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useToast } from '@/components/providers/ToastProvider'

type Item = {
    assignmentId: string
    taskTitle: string
    note: string | null
    acknowledgedByName: string
}

export function AcknowledgementToasts({ items }: { items: Item[] }) {
    const { addToast } = useToast()
    const shown = useRef(false)

    useEffect(() => {
        if (shown.current || items.length === 0) return
        shown.current = true

        items.forEach((it, i) => {
            setTimeout(() => {
                addToast(
                    'success',
                    (
                        <div>
                            <div>{it.acknowledgedByName} acknowledged your completion of “{it.taskTitle}” ✅</div>
                            {it.note && <div className="mt-1 italic text-green-200/80">“{it.note}”</div>}
                        </div>
                    ),
                    8000
                )
            }, i * 800)
        })
    }, [items, addToast])

    return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/acknowledgementToasts.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into the dashboard**

In `app/dashboard/page.tsx`, add imports after line 28:

```ts
import { AcknowledgementToasts } from '@/components/AcknowledgementToasts'
import { getAndMarkAcknowledgements } from '@/lib/taskAcknowledgements'
```

Add the fetch alongside the existing `unnotifiedAchievements` setup. After line 156 (`}))` that closes the `unnotifiedAchievements` map), add:

```ts
    const acknowledgementToastItems = isViewingSelf
        ? await getAndMarkAcknowledgements(prisma, currentUserId)
        : []
```

Then render it right after the existing `<AchievementToasts ... />` (line 347):

```tsx
            <AchievementToasts achievements={unnotifiedAchievements} />
            <AcknowledgementToasts items={acknowledgementToastItems} />
```

- [ ] **Step 6: Typecheck + manual verification**

Run: `npx tsc --noEmit`
Expected: no errors.

Then on the dev server: as admin, acknowledge a user's completion (with a note). Log in / view as that user and load `/dashboard`.
Expected: a green toast appears bottom-right — "Becca acknowledged your completion of “…” ✅" with the note on a second line. Reloading the dashboard does NOT show it again.

- [ ] **Step 7: Commit**

```bash
git add components/AcknowledgementToasts.tsx app/dashboard/page.tsx tests/components/acknowledgementToasts.test.tsx
git commit -m "feat(dashboard): one-time acknowledgement confirmation toast"
```

---

## Task 10: Wire lazy auto-archive into page loads

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/admin/tasks/page.tsx`

- [ ] **Step 1: Run archive at top of the dashboard load**

In `app/dashboard/page.tsx`, add the import after line 28:

```ts
import { archiveAcknowledgedTasks } from '@/lib/taskArchive'
```

Then, immediately after the org guard around line 65 (after the `if (!isViewingSelf) { ... }` block, before the big `Promise.all` at line 68), add:

```ts
    await archiveAcknowledgedTasks(prisma, session.user.organizationId)
```

This runs before the `taskAssignments` query, so a freshly-archived task drops out of the dashboard in the same render.

- [ ] **Step 2: Run archive at top of the admin tasks load**

In `app/admin/tasks/page.tsx`, add this import after line 7 (`prisma` is already imported at line 2 — do NOT re-import it):

```ts
import { archiveAcknowledgedTasks } from "@/lib/taskArchive"
```

Then, immediately after `const isArchived = tab === 'archived';` (line 18), add:

```ts
    if (orgId) {
        await archiveAcknowledgedTasks(prisma, orgId)
    }
```

This runs before the `prisma.task.findMany` (line 23), so newly-archived tasks leave the active list immediately.

- [ ] **Step 3: Typecheck + manual verification**

Run: `npx tsc --noEmit`
Expected: no errors.

To verify the next-day behavior without waiting a day, in a SQLite client (or a throwaway script) set an acknowledged assignment's `acknowledgedAt` to a past date, then load `/admin/tasks` or `/dashboard`.
Expected: the task moves to the Archived tab / disappears from the dashboard. A task acknowledged *today* stays visible.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass (including the new lib + component suites).

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx app/admin/tasks/page.tsx
git commit -m "feat(tasks): lazily auto-archive acknowledged tasks on page load"
```

---

## Final verification

- [ ] **Full suite green:** `npm test` → all pass.
- [ ] **Typecheck clean:** `npx tsc --noEmit` → no errors.
- [ ] **End-to-end on dev server:**
  1. User completes a task → appears in `/admin` queue, badge count increments on Tasks nav.
  2. Admin acknowledges with a note → row disappears, badge decrements.
  3. User loads dashboard → green toast with the note, shown once.
  4. User can no longer un-complete the acknowledged task (error surfaced).
  5. Back-date the acknowledgement → task auto-archives on next `/admin/tasks` or `/dashboard` load.
- [ ] **Migration ready for prod:** `prisma/migrations/<ts>_task_acknowledgement` exists and is committed; prod deploy will apply it via `npx prisma migrate deploy`.

## Notes for deployment (not part of implementation)

- This adds a Prisma migration, so the prod deploy must run `npx prisma migrate deploy` (the standard flow already does). Back up `prisma/database.db` first, per the usual procedure.
- No new env vars, no scheduler, no infra changes.
