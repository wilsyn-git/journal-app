# Priority Hardening (newissues.md Priorities 1–4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four priority-1–4 issue groups from `docs/newissues.md`: (1) transactional streak freeze/shield earning and spending (N1.1, N1.2), (2) organization scoping for admin queries and mutations (N1.3, N1.4), (3) journal autosave failure visibility and unsaved-changes protection (N3.1, N3.2), (4) DEPLOYMENT.md corrections (N4.3, N4.4).

**Architecture:** Extract the racy inventory read-modify-write logic out of server actions into pure-ish lib functions (`lib/inventoryEarning.ts`, `lib/streakSpend.ts`) that take a Prisma client and run inside interactive transactions with guarded updates — this both fixes the races and makes the logic testable against a throwaway SQLite database. Org scoping is enforced by new guard helpers in `lib/adminGuards.ts` (deliberately NOT a `'use server'` file, so guards are not exposed as POST endpoints) applied to every by-id admin mutation. The JournalEditor gains dirty-tracking refs so `beforeunload`, tab-hide flush, and a persistent error + Retry state all see current save state.

**Tech Stack:** Next.js 16 App Router, Prisma 6 (SQLite), NextAuth v5, React 19. New dev deps: vitest, @vitejs/plugin-react, jsdom, @testing-library/react, @testing-library/jest-dom.

**Branch/worktree strategy:** All tasks run sequentially on one feature branch `fix/priority-hardening`, executed in an isolated worktree created via `superpowers:using-git-worktrees`. Sequential (not parallel worktrees) because Tasks 2–5 build on Task 1's test infra, Tasks 7–9 share `lib/adminGuards.ts`, and per-task review between subagents is the established workflow. One subagent per task, code review between tasks.

**Verification commands** (used throughout):
- `npm test` → `vitest run`
- `npx tsc --noEmit` (typecheck; repo has no test script today, `next lint` exists)
- `npm run build`

**Out of scope (do not do):** schema migrations, fixing the pre-existing `isAdminOverride` unused-variable wart in `auth.ts`, rate limiting, any other issue from `docs/newissues.md` or `ISSUES.md`.

---

### Task 1: Branch + test infrastructure (vitest, test DB helper, fixtures)

The repo has **zero test infrastructure** — no test runner, no `test` script. This task installs vitest and creates a throwaway-SQLite-DB helper used by Tasks 2–5.

**Files:**
- Modify: `package.json` (add `test` script + dev deps)
- Create: `vitest.config.ts`
- Create: `tests/helpers/testDb.ts`
- Create: `tests/helpers/fixtures.ts`
- Create: `tests/helpers/infra.test.ts` (smoke test)

- [ ] **Step 1: Create the worktree/branch**

Use the `superpowers:using-git-worktrees` skill to create an isolated worktree on a new branch:

```bash
git worktree add ../journal-app-hardening -b fix/priority-hardening
cd ../journal-app-hardening
npm install
```

(If worktree creation is unavailable, `git checkout -b fix/priority-hardening` in the main checkout is the fallback.)

- [ ] **Step 2: Install test dependencies**

```bash
npm install --save-dev vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Add the test script**

In `package.json` `"scripts"`, after `"lint"`:

```json
"test": "vitest run",
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

Note: default environment is `node` (DB tests). The component test in Task 10 opts into jsdom with a `// @vitest-environment jsdom` file comment.

- [ ] **Step 5: Create `tests/helpers/testDb.ts`**

Creates a fresh SQLite DB in a temp dir, pushes the Prisma schema into it, returns a connected client:

```ts
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

export type TestDb = {
  prisma: PrismaClient
  cleanup: () => Promise<void>
}

export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'journalAppTest-'))
  const url = `file:${join(dir, 'test.db')}`

  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })

  const prisma = new PrismaClient({ datasources: { db: { url } } })

  return {
    prisma,
    cleanup: async () => {
      await prisma.$disconnect()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
```

- [ ] **Step 6: Create `tests/helpers/fixtures.ts`**

All non-defaulted required fields verified against `prisma/schema.prisma`: Organization needs `name` + unique `code`; User needs `email`, `password`, `organizationId`; Prompt needs only `content` + `organizationId` (type/categoryString/isActive default).

```ts
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

export async function createUserFixture(prisma: PrismaClient) {
  const org = await prisma.organization.create({
    data: { name: 'Test Org', code: `org-${randomUUID()}` },
  })
  const user = await prisma.user.create({
    data: {
      email: `user-${randomUUID()}@test.local`,
      password: 'not-a-real-hash',
      organizationId: org.id,
    },
  })
  const prompt = await prisma.prompt.create({
    data: { content: 'Test prompt', organizationId: org.id },
  })
  const secondPrompt = await prisma.prompt.create({
    data: { content: 'Second test prompt', organizationId: org.id },
  })
  return { org, user, prompt, secondPrompt }
}
```

- [ ] **Step 7: Write the smoke test `tests/helpers/infra.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from './testDb'
import { createUserFixture } from './fixtures'

describe('test infrastructure', () => {
  let db: TestDb

  beforeAll(() => {
    db = createTestDb()
  })

  afterAll(async () => {
    await db.cleanup()
  })

  it('creates an isolated database with the app schema and fixtures', async () => {
    const { user, prompt } = await createUserFixture(db.prisma)
    const found = await db.prisma.user.findUnique({ where: { id: user.id } })
    expect(found?.email).toBe(user.email)
    expect(prompt.organizationId).toBe(found?.organizationId)
  })
})
```

- [ ] **Step 8: Run the smoke test**

Run: `npm test`
Expected: PASS (1 test). If `prisma db push` fails, check that `npx prisma generate` has been run (`npm install` triggers it via postinstall, or run it manually).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/
git commit -m "test: add vitest infrastructure with throwaway sqlite test db"
```

---

### Task 2: Transactional earning logic — `lib/inventoryEarning.ts` (fixes N1.1)

Extract the freeze/shield earning logic from `app/actions/journal.ts:78-171` into a lib function that runs the day-check and both counter updates in **one interactive transaction**. Today the logic is ~8 separate awaits on the bare client; concurrent submits (or a spend interleaving with an earn — `useStreakRecovery` resets the same `metadata.earningCounter`) can lose updates.

**Known behavior change (intentional bug fix):** the old code created a brand-new inventory row with `earningCounter: 1` and then *also* ran the increment branch (the `inventory.metadata` truthiness check always passes after upsert-create), so a user's first-ever entry counted twice. New logic: create with counter 0, always increment once → first day yields counter 1.

**Files:**
- Create: `lib/inventoryEarning.ts`
- Test: `tests/lib/inventoryEarning.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/inventoryEarning.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { processFirstEntryEarning } from '@/lib/inventoryEarning'
import { STREAK_FREEZE, STREAK_SHIELD } from '@/lib/inventory'

function dayRange() {
  return {
    start: new Date(Date.now() - 60 * 60 * 1000),
    end: new Date(Date.now() + 60 * 60 * 1000),
  }
}

async function getInventory(db: TestDb, userId: string, itemType: string) {
  return db.prisma.userInventory.findUnique({
    where: { userId_itemType: { userId, itemType } },
  })
}

describe('processFirstEntryEarning', () => {
  let db: TestDb

  beforeAll(() => {
    db = createTestDb()
  })

  afterAll(async () => {
    await db.cleanup()
  })

  it('increments both counters to 1 on the first entry of the day', async () => {
    const { user, prompt } = await createUserFixture(db.prisma)
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: prompt.id, answer: 'hello' },
    })

    const earned = await processFirstEntryEarning(db.prisma, user.id, 1, dayRange())

    expect(earned).toBe(true)
    const freeze = await getInventory(db, user.id, STREAK_FREEZE.itemType)
    const shield = await getInventory(db, user.id, STREAK_SHIELD.itemType)
    expect(JSON.parse(freeze!.metadata!)).toEqual({ earningCounter: 1 })
    expect(JSON.parse(shield!.metadata!)).toEqual({ earningCounter: 1 })
    expect(freeze!.quantity).toBe(0)
  })

  it('returns false and leaves counters untouched when entries already existed today', async () => {
    const { user, prompt, secondPrompt } = await createUserFixture(db.prisma)
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: prompt.id, answer: 'earlier entry' },
    })
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: secondPrompt.id, answer: 'the new entry' },
    })

    // 2 entries exist today but only 1 was just created -> not the first batch
    const earned = await processFirstEntryEarning(db.prisma, user.id, 1, dayRange())

    expect(earned).toBe(false)
    expect(await getInventory(db, user.id, STREAK_FREEZE.itemType)).toBeNull()
  })

  it('awards a freeze and resets the counter when the interval is reached', async () => {
    const { user, prompt } = await createUserFixture(db.prisma)
    await db.prisma.userInventory.create({
      data: {
        userId: user.id,
        itemType: STREAK_FREEZE.itemType,
        quantity: 2,
        metadata: JSON.stringify({ earningCounter: STREAK_FREEZE.earningInterval - 1 }),
      },
    })
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: prompt.id, answer: 'interval day' },
    })

    await processFirstEntryEarning(db.prisma, user.id, 1, dayRange())

    const freeze = await getInventory(db, user.id, STREAK_FREEZE.itemType)
    expect(freeze!.quantity).toBe(3)
    expect(JSON.parse(freeze!.metadata!)).toEqual({ earningCounter: 0 })
  })

  it('caps quantity at maxQuantity when awarding', async () => {
    const { user, prompt } = await createUserFixture(db.prisma)
    await db.prisma.userInventory.create({
      data: {
        userId: user.id,
        itemType: STREAK_SHIELD.itemType,
        quantity: STREAK_SHIELD.maxQuantity,
        metadata: JSON.stringify({ earningCounter: STREAK_SHIELD.earningInterval - 1 }),
      },
    })
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: prompt.id, answer: 'capped day' },
    })

    await processFirstEntryEarning(db.prisma, user.id, 1, dayRange())

    const shield = await getInventory(db, user.id, STREAK_SHIELD.itemType)
    expect(shield!.quantity).toBe(STREAK_SHIELD.maxQuantity)
    expect(JSON.parse(shield!.metadata!)).toEqual({ earningCounter: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/lib/inventoryEarning.test.ts`
Expected: FAIL — `Cannot find module '@/lib/inventoryEarning'` (or equivalent resolve error).

- [ ] **Step 3: Implement `lib/inventoryEarning.ts`**

```ts
import type { PrismaClient, Prisma } from '@prisma/client'
import { STREAK_FREEZE, STREAK_SHIELD, parseItemMetadata } from './inventory'

type EarnableItem = {
  itemType: string
  earningInterval: number
  maxQuantity: number
}

async function incrementEarningCounter(
  tx: Prisma.TransactionClient,
  userId: string,
  item: EarnableItem
): Promise<void> {
  const inventory = await tx.userInventory.upsert({
    where: { userId_itemType: { userId, itemType: item.itemType } },
    create: {
      userId,
      itemType: item.itemType,
      quantity: 0,
      metadata: JSON.stringify({ earningCounter: 0 }),
    },
    update: {},
    select: { quantity: true, metadata: true },
  })

  const newCounter = parseItemMetadata(inventory.metadata).earningCounter + 1

  if (newCounter >= item.earningInterval) {
    await tx.userInventory.update({
      where: { userId_itemType: { userId, itemType: item.itemType } },
      data: {
        quantity: Math.min(inventory.quantity + 1, item.maxQuantity),
        metadata: JSON.stringify({ earningCounter: 0 }),
      },
    })
  } else {
    await tx.userInventory.update({
      where: { userId_itemType: { userId, itemType: item.itemType } },
      data: { metadata: JSON.stringify({ earningCounter: newCounter }) },
    })
  }
}

/**
 * Increments freeze and shield earning counters if the entries just created are
 * the user's first of the day. The day-check and both counter updates run in a
 * single transaction: a concurrent submit or spend either serializes behind it
 * or fails the whole unit, so counters can no longer lose updates.
 * Returns true if counters were incremented.
 */
export async function processFirstEntryEarning(
  client: PrismaClient,
  userId: string,
  entriesJustCreated: number,
  dayRange: { start: Date; end: Date }
): Promise<boolean> {
  return client.$transaction(async (tx) => {
    const todayEntryCount = await tx.journalEntry.count({
      where: {
        userId,
        createdAt: { gte: dayRange.start, lte: dayRange.end },
      },
    })

    if (todayEntryCount > entriesJustCreated) {
      return false
    }

    await incrementEarningCounter(tx, userId, STREAK_FREEZE)
    await incrementEarningCounter(tx, userId, STREAK_SHIELD)
    return true
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/inventoryEarning.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/inventoryEarning.ts tests/lib/inventoryEarning.test.ts
git commit -m "feat: transactional streak freeze/shield earning logic"
```

---

### Task 3: Wire `submitEntry` to the new earning function

**Files:**
- Modify: `app/actions/journal.ts` (lines 1–9 imports, lines 78–171 earning block)

- [ ] **Step 1: Replace the earning block**

In `app/actions/journal.ts`, replace the entire inline earning block (the `try { ... } catch (earningError)` spanning lines 79–171, starting at comment `// Streak freeze earning: increment counter if this is the user's first entry today`) with:

```ts
        // Streak freeze/shield earning: increment counters if this is the user's
        // first entry batch today. Runs transactionally in processFirstEntryEarning.
        try {
            const timezone = await getUserTimezoneById(userId)
            const todayStr = getTodayForUser(timezone)
            await processFirstEntryEarning(prisma, userId, validEntries.length, {
                start: startOfDayInTimezone(todayStr, timezone),
                end: endOfDayInTimezone(todayStr, timezone),
            })
        } catch (earningError) {
            // Non-critical — don't fail the journal entry save
            console.error('Streak freeze earning error:', earningError)
        }
```

- [ ] **Step 2: Update imports**

At the top of `app/actions/journal.ts`:
- Remove: `import { STREAK_FREEZE, STREAK_SHIELD, parseStreakFreezeMetadata } from '@/lib/inventory'`
- Add: `import { processFirstEntryEarning } from '@/lib/inventoryEarning'`

(The timezone import line stays as-is — all four helpers are still used: `getUserTimezoneById`, `startOfDayInTimezone`, `endOfDayInTimezone`, `getTodayForUser` are also used by `saveJournalResponse`.)

- [ ] **Step 3: Typecheck and run all tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean typecheck, all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions/journal.ts
git commit -m "refactor: submitEntry uses transactional earning logic"
```

---

### Task 4: Guarded spend logic — `lib/streakSpend.ts` (fixes N1.2)

`useStreakRecovery` currently reads quantities with `findUnique`, checks in JS, then decrements — concurrent calls can both pass the check and overdraft. Fix: guarded `updateMany` (`quantity: { gte: cost }` in the `where`) inside one transaction with the usage-row creates, so an insufficient balance can never go negative and a failed shield spend rolls back the freeze spend. Also validates `frozenDate` strings (`YYYY-MM-DD`) before writing them.

**Files:**
- Create: `lib/streakSpend.ts`
- Test: `tests/lib/streakSpend.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/streakSpend.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { spendStreakRecovery } from '@/lib/streakSpend'
import { STREAK_FREEZE, STREAK_SHIELD } from '@/lib/inventory'

async function seedInventory(db: TestDb, userId: string, itemType: string, quantity: number) {
  await db.prisma.userInventory.create({
    data: { userId, itemType, quantity, metadata: JSON.stringify({ earningCounter: 5 }) },
  })
}

async function getQuantity(db: TestDb, userId: string, itemType: string) {
  const row = await db.prisma.userInventory.findUnique({
    where: { userId_itemType: { userId, itemType } },
  })
  return row?.quantity ?? null
}

describe('spendStreakRecovery', () => {
  let db: TestDb

  beforeAll(() => {
    db = createTestDb()
  })

  afterAll(async () => {
    await db.cleanup()
  })

  it('rejects when costs do not match the number of missed days', async () => {
    const { user } = await createUserFixture(db.prisma)
    const result = await spendStreakRecovery(db.prisma, user.id, ['2026-06-01'], 2, 0)
    expect(result).toEqual({ error: 'Cost mismatch' })
  })

  it('rejects malformed date keys', async () => {
    const { user } = await createUserFixture(db.prisma)
    const result = await spendStreakRecovery(db.prisma, user.id, ['06/01/2026'], 1, 0)
    expect(result).toEqual({ error: 'Invalid date format' })
  })

  it('decrements inventory, resets counters, and records frozen days on success', async () => {
    const { user } = await createUserFixture(db.prisma)
    await seedInventory(db, user.id, STREAK_FREEZE.itemType, 3)
    await seedInventory(db, user.id, STREAK_SHIELD.itemType, 2)

    const result = await spendStreakRecovery(
      db.prisma, user.id, ['2026-06-01', '2026-06-02', '2026-06-03'], 2, 1
    )

    expect(result).toEqual({ success: true, freezesUsed: 2, shieldsUsed: 1 })
    expect(await getQuantity(db, user.id, STREAK_FREEZE.itemType)).toBe(1)
    expect(await getQuantity(db, user.id, STREAK_SHIELD.itemType)).toBe(1)
    const usages = await db.prisma.streakFreezeUsage.findMany({ where: { userId: user.id } })
    expect(usages.map((u) => u.frozenDate).sort()).toEqual([
      '2026-06-01', '2026-06-02', '2026-06-03',
    ])
  })

  it('rolls back the freeze decrement when shields are insufficient', async () => {
    const { user } = await createUserFixture(db.prisma)
    await seedInventory(db, user.id, STREAK_FREEZE.itemType, 2)
    // no shield inventory row at all

    const result = await spendStreakRecovery(
      db.prisma, user.id, ['2026-06-01', '2026-06-02', '2026-06-03'], 2, 1
    )

    expect(result).toEqual({ error: 'Not enough streak shields' })
    // Transaction rolled back: freezes untouched, no usage rows
    expect(await getQuantity(db, user.id, STREAK_FREEZE.itemType)).toBe(2)
    expect(await db.prisma.streakFreezeUsage.count({ where: { userId: user.id } })).toBe(0)
  })

  it('never overdrafts: a second spend against an emptied balance fails', async () => {
    const { user } = await createUserFixture(db.prisma)
    await seedInventory(db, user.id, STREAK_FREEZE.itemType, 1)

    const first = await spendStreakRecovery(db.prisma, user.id, ['2026-05-01'], 1, 0)
    const second = await spendStreakRecovery(db.prisma, user.id, ['2026-05-02'], 1, 0)

    expect(first).toEqual({ success: true, freezesUsed: 1, shieldsUsed: 0 })
    expect(second).toEqual({ error: 'Not enough streak freezes' })
    expect(await getQuantity(db, user.id, STREAK_FREEZE.itemType)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/lib/streakSpend.test.ts`
Expected: FAIL — cannot resolve `@/lib/streakSpend`.

- [ ] **Step 3: Implement `lib/streakSpend.ts`**

```ts
import type { PrismaClient } from '@prisma/client'
import { STREAK_FREEZE, STREAK_SHIELD } from './inventory'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type SpendResult =
  | { success: true; freezesUsed: number; shieldsUsed: number }
  | { error: string }

class InsufficientInventoryError extends Error {}

/**
 * Spends freezes/shields to recover missed streak days. The decrements use a
 * guarded updateMany (quantity >= cost in the WHERE) inside one transaction
 * with the usage-row inserts, so concurrent spends cannot overdraft and a
 * partial spend always rolls back.
 */
export async function spendStreakRecovery(
  client: PrismaClient,
  userId: string,
  missedDays: string[],
  freezesCost: number,
  shieldsCost: number
): Promise<SpendResult> {
  if (freezesCost < 0 || shieldsCost < 0 || freezesCost + shieldsCost !== missedDays.length) {
    return { error: 'Cost mismatch' }
  }
  if (missedDays.some((day) => !DATE_KEY_PATTERN.test(day))) {
    return { error: 'Invalid date format' }
  }

  try {
    await client.$transaction(async (tx) => {
      const spends: Array<{ itemType: string; cost: number; label: string }> = [
        { itemType: STREAK_FREEZE.itemType, cost: freezesCost, label: 'streak freezes' },
        { itemType: STREAK_SHIELD.itemType, cost: shieldsCost, label: 'streak shields' },
      ]

      for (const { itemType, cost, label } of spends) {
        if (cost === 0) continue
        const updated = await tx.userInventory.updateMany({
          where: { userId, itemType, quantity: { gte: cost } },
          data: {
            quantity: { decrement: cost },
            metadata: JSON.stringify({ earningCounter: 0 }),
          },
        })
        if (updated.count === 0) {
          throw new InsufficientInventoryError(`Not enough ${label}`)
        }
      }

      for (const frozenDate of missedDays) {
        await tx.streakFreezeUsage.create({ data: { userId, frozenDate } })
      }
    })
  } catch (e) {
    if (e instanceof InsufficientInventoryError) {
      return { error: e.message }
    }
    throw e
  }

  return { success: true, freezesUsed: freezesCost, shieldsUsed: shieldsCost }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/lib/streakSpend.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/streakSpend.ts tests/lib/streakSpend.test.ts
git commit -m "feat: guarded transactional streak recovery spending"
```

---

### Task 5: Wire `useStreakRecovery` to the new spend function

**Files:**
- Modify: `app/actions/inventory.ts` (full rewrite — file is 73 lines)

- [ ] **Step 1: Rewrite `app/actions/inventory.ts`**

Replace the entire file content with:

```ts
'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { resolveUserId } from '@/lib/auth-helpers'
import { spendStreakRecovery } from '@/lib/streakSpend'
import { revalidatePath } from 'next/cache'

export async function useStreakRecovery(missedDays: string[], freezesCost: number, shieldsCost: number) {
  const session = await auth()
  if (!session?.user?.email) throw new Error('Unauthorized')

  const userId = await resolveUserId(session)
  if (!userId) throw new Error('User not found')

  try {
    const result = await spendStreakRecovery(prisma, userId, missedDays, freezesCost, shieldsCost)
    if ('success' in result) {
      revalidatePath('/dashboard')
    }
    return result
  } catch (e) {
    console.error('Streak recovery failed:', e)
    return { error: 'Failed to apply streak recovery' }
  }
}
```

(Behavior note: error shape and success shape `{ success, freezesUsed, shieldsUsed }` are unchanged, so `StreakFreezeBanner.tsx` needs no changes. Unexpected errors — e.g. a duplicate `frozenDate` hitting the `@@unique([userId, frozenDate])` constraint — now return `{ error }` instead of throwing to the client, which is strictly better.)

- [ ] **Step 2: Typecheck and run all tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all PASS.

- [ ] **Step 3: Commit**

```bash
git add app/actions/inventory.ts
git commit -m "refactor: useStreakRecovery uses guarded transactional spend"
```

---

### Task 6: Org-scope the admin user list queries (fixes N1.3)

**Files:**
- Modify: `app/dashboard/page.tsx:80-82`
- Modify: `app/admin/users/page.tsx:1-17`

- [ ] **Step 1: Scope the dashboard admin user list**

In `app/dashboard/page.tsx`, the `Promise.all` entry at lines 80–82 currently reads:

```ts
        isAdmin
            ? prisma.user.findMany({ select: { id: true, email: true, name: true }, orderBy: { email: 'asc' } })
            : Promise.resolve([] as { id: string, email: string, name: string | null }[]),
```

Replace with:

```ts
        isAdmin
            ? prisma.user.findMany({
                where: { organizationId: session.user.organizationId },
                select: { id: true, email: true, name: true },
                orderBy: { email: 'asc' }
              })
            : Promise.resolve([] as { id: string, email: string, name: string | null }[]),
```

(`session` is in scope and `session.user.organizationId` is already used at line 104 in the same `Promise.all`; the type is declared in `types/next-auth.d.ts`.)

- [ ] **Step 2: Scope the admin users page**

In `app/admin/users/page.tsx`, add the auth import after line 2 and scope the query. Top of file becomes:

```tsx
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import Link from "next/link"

import { NewUserForm } from "@/components/admin/NewUserForm"
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog"
import { DeleteUserDialog } from "@/components/admin/DeleteUserDialog"

export default async function AdminUsersPage() {
    const session = await auth()
    if (!session?.user?.organizationId) {
        throw new Error("Unauthorized")
    }

    const users = await prisma.user.findMany({
        where: { organizationId: session.user.organizationId },
        orderBy: { createdAt: 'desc' },
        include: {
            _count: {
                select: { entries: true }
            }
        }
    })
```

(Rest of the file unchanged.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx app/admin/users/page.tsx
git commit -m "fix: scope admin user lists to the session organization"
```

---

### Task 7: Org-ownership guards — `lib/adminGuards.ts` + user mutations (fixes N1.4, part 1)

New guard helpers live in `lib/adminGuards.ts`, **not** in `app/actions/helpers.ts` — that file is `'use server'`, so any export becomes a client-invokable POST endpoint; guards should not be remotely callable. Guards both check the ADMIN role and verify the target record's `organizationId` matches the session's.

**Testing note:** these guards call `auth()` directly, and the repo has no next-auth mocking infrastructure. They are 6-line mechanical checks; verification is typecheck + the manual admin smoke test in Task 12. The genuinely tricky logic (Tasks 2/4) is what gets automated tests.

**Files:**
- Create: `lib/adminGuards.ts`
- Modify: `app/actions/users.ts:64-68, 94-95`
- Modify: `app/actions/auth.ts:31-37`

- [ ] **Step 1: Create `lib/adminGuards.ts`**

```ts
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import type { Session } from 'next-auth'

/** Throws unless the session belongs to an ADMIN. */
export async function requireAdminSession(): Promise<Session> {
    const session = await auth()
    if (session?.user?.role !== 'ADMIN') {
        throw new Error('Unauthorized: Admin access required')
    }
    return session
}

/** Throws unless the admin and the target user share an organization. */
export async function requireAdminForUser(targetUserId: string): Promise<Session> {
    const session = await requireAdminSession()
    const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { organizationId: true },
    })
    if (!target || target.organizationId !== session.user.organizationId) {
        throw new Error('Unauthorized: User not found in your organization')
    }
    return session
}

/** Throws unless the admin and the target group share an organization. */
export async function requireAdminForGroup(groupId: string): Promise<Session> {
    const session = await requireAdminSession()
    const target = await prisma.userGroup.findUnique({
        where: { id: groupId },
        select: { organizationId: true },
    })
    if (!target || target.organizationId !== session.user.organizationId) {
        throw new Error('Unauthorized: Group not found in your organization')
    }
    return session
}

/** Throws unless ALL given prompts belong to the admin's organization. */
export async function requireAdminForPrompts(promptIds: string[]): Promise<Session> {
    const session = await requireAdminSession()
    const count = await prisma.prompt.count({
        where: { id: { in: promptIds }, organizationId: session.user.organizationId },
    })
    if (count !== promptIds.length) {
        throw new Error('Unauthorized: Prompt not found in your organization')
    }
    return session
}

/** Throws unless the admin and the target prompt category share an organization. */
export async function requireAdminForCategory(categoryId: string): Promise<Session> {
    const session = await requireAdminSession()
    const target = await prisma.promptCategory.findUnique({
        where: { id: categoryId },
        select: { organizationId: true },
    })
    if (!target || target.organizationId !== session.user.organizationId) {
        throw new Error('Unauthorized: Category not found in your organization')
    }
    return session
}
```

- [ ] **Step 2: Guard `updateUser` and `deleteUser` in `app/actions/users.ts`**

Add the import after line 8 (`import { ensureAdmin } from './helpers'`):

```ts
import { requireAdminForUser } from '@/lib/adminGuards'
```

In `updateUser` (line 66-68), replace:

```ts
    await ensureAdmin();
    // Validate org access? Ideally check if target user is in same org.
    // For simplicity assuming shared org context or admin super-power properly scoped.
```

with:

```ts
    await requireAdminForUser(userId);
```

In `deleteUser` (line 95), replace:

```ts
    const session = await ensureAdmin();
```

with:

```ts
    const session = await requireAdminForUser(userId);
```

(`createUser` keeps `ensureAdmin` — it creates inside the session's own org. The `ensureAdmin` import stays.)

- [ ] **Step 3: Guard the admin path of `changePassword` in `app/actions/auth.ts`**

In `changePassword`, replace the admin-mode block (lines 31–37):

```ts
    if (targetUserId) {
        // Admin Mode Check
        if (session.user.role !== 'ADMIN') {
            return { error: "Unauthorized: Only admins can reset other users' passwords" }
        }
        userIdToUpdate = targetUserId
        isAdminOverride = true
    } else {
```

with:

```ts
    if (targetUserId) {
        // Admin Mode Check
        if (session.user.role !== 'ADMIN') {
            return { error: "Unauthorized: Only admins can reset other users' passwords" }
        }
        const target = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { organizationId: true }
        })
        if (!target || target.organizationId !== session.user.organizationId) {
            return { error: "Unauthorized: User not found in your organization" }
        }
        userIdToUpdate = targetUserId
        isAdminOverride = true
    } else {
```

(This action returns `{ error }` rather than throwing, so it does the check inline instead of using the throwing guard.)

- [ ] **Step 4: Typecheck and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/adminGuards.ts app/actions/users.ts app/actions/auth.ts
git commit -m "fix: verify org ownership in admin user mutations"
```

---

### Task 8: Org-ownership guards — group mutations (fixes N1.4, part 2)

**Files:**
- Modify: `app/actions/groups.ts` (functions `updateUserGroup`, `deleteGroup`, `updateGroupProfiles`, `addUserToGroup`, `removeUserFromGroup`)

- [ ] **Step 1: Add the import**

After line 5 (`import { ensureAdmin } from './helpers'`):

```ts
import { requireAdminForGroup } from '@/lib/adminGuards'
```

(`ensureAdmin` stays — `createGroup` still uses it.)

- [ ] **Step 2: Replace the guard in each by-id mutation**

- `updateUserGroup` (line 41): `await ensureAdmin();` → `await requireAdminForGroup(id);`
- `deleteGroup` (line 63): `await ensureAdmin();` → `await requireAdminForGroup(id);`
- `updateGroupProfiles` (line 73): `await ensureAdmin();` → `await requireAdminForGroup(groupId);`
- `removeUserFromGroup` (line 132): `await ensureAdmin();` → `await requireAdminForGroup(groupId);`

- [ ] **Step 3: Guard `addUserToGroup` (group AND target user)**

`addUserToGroup` connects an arbitrary email to the group, so it must also verify the user being added is in the same org. Replace the function body start (lines 109–115):

```ts
export async function addUserToGroup(groupId: string, formData: FormData) {
    await ensureAdmin();
    const email = formData.get('email') as string;

    // Verify user exists and is in same org
    // For simplicity, just connect by email
    try {
```

with:

```ts
export async function addUserToGroup(groupId: string, formData: FormData) {
    const session = await requireAdminForGroup(groupId);
    const email = formData.get('email') as string;

    const targetUser = await prisma.user.findUnique({
        where: { email },
        select: { organizationId: true }
    });
    if (!targetUser || targetUser.organizationId !== session.user.organizationId) {
        return { error: 'User not found' }
    }

    try {
```

- [ ] **Step 4: Typecheck and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/groups.ts
git commit -m "fix: verify org ownership in admin group mutations"
```

---

### Task 9: Org-ownership guards — prompt mutations (fixes N1.4, part 3)

**Files:**
- Modify: `app/actions/prompts.ts` (functions `deletePromptCategory`, `updatePrompt`, `togglePrompt`, `deletePrompt`, `reorderPrompts`)

- [ ] **Step 1: Add the import**

After line 5 (`import { ensureAdmin, resolveCategory } from './helpers'`):

```ts
import { requireAdminForPrompts, requireAdminForCategory } from '@/lib/adminGuards'
```

(`ensureAdmin` stays — `createPromptCategory`, `createPrompt`, and `importPrompts` still use it and are already session-org-scoped.)

- [ ] **Step 2: Replace the guard in each by-id mutation**

- `deletePromptCategory` (line 46): `const session = await ensureAdmin();` → `const session = await requireAdminForCategory(id);`
- `updatePrompt` (line 136): `const session = await ensureAdmin();` → `const session = await requireAdminForPrompts([id]);`
- `togglePrompt` (line 172): `await ensureAdmin()` → `await requireAdminForPrompts([id])`
- `deletePrompt` (line 188): `await ensureAdmin()` → `await requireAdminForPrompts([id])`
- `reorderPrompts` (line 205): `await ensureAdmin();` → `await requireAdminForPrompts(items.map((item) => item.id));`

- [ ] **Step 3: Typecheck and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all PASS.

- [ ] **Step 4: Commit**

```bash
git add app/actions/prompts.ts
git commit -m "fix: verify org ownership in admin prompt mutations"
```

---

### Task 10: JournalEditor — persistent error + Retry, unsaved-changes guard, tab-hide flush (fixes N3.1, N3.2)

Current behavior (`components/JournalEditor.tsx`): save errors flash for the render of `status === 'error'` but the component never re-alerts, errors only hit the console, "Saved" resets to idle after 2s, and nothing guards navigation while a debounce (1s) or save is pending.

New behavior:
- Dirty prompt IDs tracked in a ref (`dirtyRef`); a prompt is dirty from keystroke until a save of its *current* value succeeds.
- `status === 'error'` persists until a save succeeds, and renders "Save failed — your latest changes are not saved" with a **Retry** button that immediately re-saves all dirty prompts.
- "Saved HH:MM" persists until the next edit (no 2s reset).
- `beforeunload` warns while anything is dirty or in flight.
- `visibilitychange → hidden` flushes pending debounced saves immediately (best-effort persistence when the user switches tabs/closes on mobile).

**Files:**
- Modify: `components/JournalEditor.tsx` (full rewrite below)
- Test: `tests/components/journalEditor.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `tests/components/journalEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const saveMock = vi.fn()

vi.mock('@/app/actions/journal', () => ({
  saveJournalResponse: (...args: unknown[]) => saveMock(...args),
}))

// PromptCard pulls in app styling concerns; stub it with a labeled textarea.
vi.mock('@/components/PromptCard', () => ({
  PromptCard: ({ prompt, value, onChange }: {
    prompt: { id: string; content: string }
    value?: string
    onChange: (v: string) => void
  }) => (
    <textarea
      aria-label={prompt.content}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

import { JournalEditor } from '@/components/JournalEditor'

const prompts = [
  { id: 'p1', content: 'How was your day?' },
] as never

function typeIntoPrompt(text: string) {
  fireEvent.change(screen.getByLabelText('How was your day?'), { target: { value: text } })
}

describe('JournalEditor save feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    saveMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a persistent error with a Retry button when autosave fails', async () => {
    saveMock.mockResolvedValue({ error: 'Failed to auto-save' })
    render(<JournalEditor prompts={prompts} />)

    typeIntoPrompt('my precious entry')
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

    expect(screen.getByText(/save failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()

    // Error must persist, not auto-dismiss after 2 seconds like the old code
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByText(/save failed/i)).toBeInTheDocument()
  })

  it('retries all unsaved prompts when Retry is clicked and shows Saved on success', async () => {
    saveMock.mockResolvedValueOnce({ error: 'Failed to auto-save' })
    saveMock.mockResolvedValue({ success: true, timestamp: new Date().toISOString() })
    render(<JournalEditor prompts={prompts} />)

    typeIntoPrompt('my precious entry')
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(screen.getByText(/save failed/i)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(saveMock).toHaveBeenCalledTimes(2)
    expect(saveMock).toHaveBeenLastCalledWith('p1', 'my precious entry')
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
  })

  it('shows Saved after a successful autosave and keeps it visible', async () => {
    saveMock.mockResolvedValue({ success: true, timestamp: new Date().toISOString() })
    render(<JournalEditor prompts={prompts} />)

    typeIntoPrompt('hello')
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

    expect(screen.getByText(/saved/i)).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
  })

  it('blocks beforeunload while changes are unsaved, allows it once saved', async () => {
    saveMock.mockResolvedValue({ success: true, timestamp: new Date().toISOString() })
    render(<JournalEditor prompts={prompts} />)

    typeIntoPrompt('unsaved text')

    // Debounce still pending -> dirty -> unload must be prevented
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)
  })

  it('flushes pending debounced saves when the tab becomes hidden', async () => {
    saveMock.mockResolvedValue({ success: true, timestamp: new Date().toISOString() })
    render(<JournalEditor prompts={prompts} />)

    typeIntoPrompt('quick note before switching tabs')
    expect(saveMock).not.toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(10)
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    expect(saveMock).toHaveBeenCalledWith('p1', 'quick note before switching tabs')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/components/journalEditor.test.tsx`
Expected: FAIL — the persistent-error, Retry, beforeunload, and flush tests fail against the current component (the "shows Saved" test may also fail on the 5s-persistence assertion since the old code resets to idle after 2s).

- [ ] **Step 3: Rewrite `components/JournalEditor.tsx`**

Replace the entire file with:

```tsx
'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PromptCard } from './PromptCard';
import { saveJournalResponse } from '@/app/actions/journal';
import { Prompt } from '@prisma/client';

interface JournalEditorProps {
    prompts: Prompt[];
    initialAnswers?: Record<string, string>;
}

export function JournalEditor({ prompts, initialAnswers = {} }: JournalEditorProps) {
    // State to store answers: { [promptId]: answerString }
    const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);

    // Saving status: 'idle' | 'saving' | 'saved' | 'error'
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    // Refs so unload/flush handlers always see current save state:
    // - answersRef: latest values (debounced saves and Retry read from here)
    // - dirtyRef: prompt IDs changed since their last successful save
    // - inFlightRef: number of save requests currently awaiting a response
    const answersRef = useRef(answers);
    const dirtyRef = useRef<Set<string>>(new Set());
    const inFlightRef = useRef(0);

    // Debounce saves per prompt ID so editing one doesn't delay saving another
    const timeoutRefs = useRef<Record<string, NodeJS.Timeout>>({});

    const saveNow = useCallback(async (promptId: string) => {
        const value = answersRef.current[promptId] ?? '';
        inFlightRef.current += 1;
        setStatus('saving');
        try {
            const result = await saveJournalResponse(promptId, value);
            if (result.error) {
                setStatus('error');
                return;
            }
            // Only mark clean if the value didn't change while the save was in flight
            if ((answersRef.current[promptId] ?? '') === value) {
                dirtyRef.current.delete(promptId);
            }
            if (dirtyRef.current.size === 0) {
                setStatus('saved');
                setLastSaved(new Date());
            }
        } catch (e) {
            console.error(e);
            setStatus('error');
        } finally {
            inFlightRef.current -= 1;
        }
    }, []);

    const retryDirty = useCallback(() => {
        for (const promptId of Array.from(dirtyRef.current)) {
            if (timeoutRefs.current[promptId]) {
                clearTimeout(timeoutRefs.current[promptId]);
                delete timeoutRefs.current[promptId];
            }
            void saveNow(promptId);
        }
    }, [saveNow]);

    const debouncedSave = useCallback((promptId: string) => {
        setStatus('saving');

        if (timeoutRefs.current[promptId]) {
            clearTimeout(timeoutRefs.current[promptId]);
        }

        timeoutRefs.current[promptId] = setTimeout(() => {
            delete timeoutRefs.current[promptId];
            void saveNow(promptId);
        }, 1000); // 1 second debounce
    }, [saveNow]);

    const handleChange = (promptId: string, newValue: string) => {
        // 1. Update UI immediately (ref updated synchronously for unload handlers)
        setAnswers(prev => {
            const next = { ...prev, [promptId]: newValue };
            answersRef.current = next;
            return next;
        });
        dirtyRef.current.add(promptId);

        // 2. Trigger debounced save
        debouncedSave(promptId);
    };

    // Warn before unload while changes are unsaved or saves are in flight
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (dirtyRef.current.size > 0 || inFlightRef.current > 0) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    // Flush pending debounced saves as soon as the tab is hidden
    useEffect(() => {
        const flushPending = () => {
            if (document.visibilityState !== 'hidden') return;
            for (const promptId of Object.keys(timeoutRefs.current)) {
                clearTimeout(timeoutRefs.current[promptId]);
                delete timeoutRefs.current[promptId];
                void saveNow(promptId);
            }
        };
        document.addEventListener('visibilitychange', flushPending);
        return () => document.removeEventListener('visibilitychange', flushPending);
    }, [saveNow]);

    // Cleanup timeouts on unmount
    useEffect(() => {
        const timeouts = timeoutRefs.current;
        return () => {
            Object.values(timeouts).forEach(clearTimeout);
        };
    }, []);

    return (
        <div className="animate-[fade-in_0.5s_ease-out]">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 mb-2">Today</h2>
                    <p className="text-muted-foreground">What is on your mind?</p>
                </div>

                {/* Status Indicator */}
                <div role="status" aria-live="polite" className="flex flex-col items-end h-10 justify-center">
                    {status === 'saving' && (
                        <span className="text-sm text-yellow-400 animate-pulse">Saving...</span>
                    )}
                    {status === 'saved' && lastSaved && (
                        <span className="text-sm text-green-400">
                            Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    {status === 'error' && (
                        <span className="text-sm text-red-400 flex items-center gap-2">
                            Save failed — your latest changes are not saved.
                            <button
                                onClick={retryDirty}
                                className="underline text-white hover:text-red-200 transition-colors"
                            >
                                Retry
                            </button>
                        </span>
                    )}
                    {status === 'idle' && lastSaved && (
                        <span className="text-xs text-muted-foreground">Last saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                </div>
            </div>

            <div className="grid gap-2">
                {prompts.map(prompt => (
                    <PromptCard
                        key={prompt.id}
                        prompt={prompt}
                        value={answers[prompt.id]}
                        onChange={(val) => handleChange(prompt.id, val)}
                    />
                ))}
            </div>

            {/* Optional: Manual Save Button (Legacy / Force Save) */}
            <div className="mt-8 flex justify-end opacity-50 hover:opacity-100 transition-opacity">
                <button
                    className="text-xs text-muted-foreground hover:text-white transition-colors"
                >
                    Auto-save enabled
                </button>
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/components/journalEditor.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and run full suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all PASS.

- [ ] **Step 6: Commit**

```bash
git add components/JournalEditor.tsx tests/components/journalEditor.test.tsx
git commit -m "fix: persistent autosave error with retry, unsaved-changes guard, tab-hide flush"
```

---

### Task 11: DEPLOYMENT.md corrections (fixes N4.3, N4.4)

**Files:**
- Modify: `DEPLOYMENT.md:24, 61`

- [ ] **Step 1: Fix the Node version (line 24)**

Replace:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
```

with:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
```

(`package.json` engines pins `>=22.0.0 <23.0.0`.)

- [ ] **Step 2: Fix the email env var (line 61)**

Replace:

```bash
SOURCE_EMAIL="no-reply@your-domain.com"
```

with:

```bash
EMAIL_FROM="no-reply@your-domain.com"
```

(`lib/email/index.ts:23` reads `process.env.EMAIL_FROM`; `SOURCE_EMAIL` is read by nothing.)

- [ ] **Step 3: Commit**

```bash
git add DEPLOYMENT.md
git commit -m "docs: fix node version and email env var in deployment guide"
```

---

### Task 12: Final verification + issue log update

**Files:**
- Modify: `docs/newissues.md` (mark fixed items)

- [ ] **Step 1: Full automated verification**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass. Paste actual output before claiming success (see superpowers:verification-before-completion).

- [ ] **Step 2: Start the dev server and run the manual checklist**

Run: `npm run dev` (start it automatically — per workflow preference, don't ask Sam to do it). Against a **local dev database only** (never production):

1. Log in as admin → `/admin/users` lists users; dashboard admin user selector still populates.
2. Dashboard → type in a journal prompt → see "Saving..." then "Saved HH:MM" that does **not** disappear after 2 seconds.
3. Type in a prompt and immediately try to close the tab → browser shows the unsaved-changes warning; wait for "Saved", close again → no warning.
4. Stop the dev server mid-edit (simulates save failure) → red "Save failed — your latest changes are not saved. Retry" appears and stays; restart server, click Retry → "Saved".
5. Inventory page → use a streak freeze on a recoverable day (seed via `scripts/seedTestStreakUser.ts` if needed) → quantity decrements once, dashboard updates; attempt with 0 quantity → "Not enough streak freezes" error, quantity stays 0.
6. Admin: edit a user, reset a password, toggle a prompt, edit a group → all still succeed (guards pass for same-org records).

- [ ] **Step 3: Update `docs/newissues.md`**

Mark N1.1, N1.2, N1.3, N1.4, N3.1, N3.2, N4.3, N4.4 as resolved, e.g. change each heading to append ` — ✅ Fixed 2026-06-09 (fix/priority-hardening)` and note the partial coverage on N1.4: `updateGroupProfiles` verifies the group but not the profile IDs being connected (follow-up if profiles ever cross orgs).

- [ ] **Step 4: Commit**

```bash
git add docs/newissues.md
git commit -m "docs: mark priority 1-4 issues resolved in newissues.md"
```

- [ ] **Step 5: Hand off for user approval**

Per the development workflow: local testing done → present results to Sam for approval before merge to `main` and any deploy. Use superpowers:finishing-a-development-branch to present merge/PR options. **Do not deploy to EC2 without explicit approval.**
