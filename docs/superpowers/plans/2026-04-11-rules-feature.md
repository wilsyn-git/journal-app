# Rules Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a habit-tracking Rules system where admins create rule types with reset schedules, define rules within those types, assign them to users, and users check them off with streak tracking.

**Architecture:** Four new Prisma models (RuleType, Rule, RuleAssignment, RuleCompletion) follow existing task/assignment fan-out patterns. Admin pages follow the type-first navigation pattern (`/admin/rules/types` → `/admin/rules/types/[typeId]`). User-facing `/rules` page shows grouped checklists with streak indicators. Period computation is timezone-aware and render-time (no cron).

**Tech Stack:** Next.js 16 (App Router), Prisma 6 (SQLite), TypeScript, Tailwind 4, server actions

---

## File Structure

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | Add RuleType, Rule, RuleAssignment, RuleCompletion models |
| `lib/ruleConstants.ts` | RESET_MODES, ASSIGNMENT_MODES re-export, type definitions |
| `lib/rules.ts` | getPeriodKey, getNextResetTime, calculateRuleStreaks, query helpers |
| `app/actions/rules.ts` | Server actions: admin CRUD for types and rules, user completion toggle |
| `app/admin/rules/types/page.tsx` | Admin: rule type list + create |
| `app/admin/rules/types/[typeId]/page.tsx` | Admin: rule type detail with rules list |
| `app/admin/rules/types/[typeId]/edit/page.tsx` | Admin: edit rule type |
| `app/admin/rules/types/[typeId]/rules/new/page.tsx` | Admin: create rule within a type |
| `app/admin/rules/types/[typeId]/rules/[ruleId]/page.tsx` | Admin: rule detail with completion stats |
| `app/admin/rules/types/[typeId]/rules/[ruleId]/edit/page.tsx` | Admin: edit rule |
| `components/admin/RuleTypeForm.tsx` | Admin: form for creating/editing rule types |
| `components/admin/RuleForm.tsx` | Admin: form for creating/editing rules (with assignment mode) |
| `app/rules/page.tsx` | User-facing: grouped checklist with streaks |
| `components/RuleCheckbox.tsx` | User-facing: individual rule check-off with optimistic UI |
| `app/dashboard/page.tsx` | Modify: add Rules nav link with badge counter |
| `components/admin/AdminSidebar.tsx` | Modify: add Rules link to admin nav |

---

### Task 1: Schema — Add RuleType, Rule, RuleAssignment, RuleCompletion models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the four new models to the Prisma schema**

Add these models at the end of `prisma/schema.prisma`, before the closing of the file. Also add the relation fields on existing models.

Add to the `Organization` model (after the `tasks` field):

```prisma
  ruleTypes  RuleType[]
  rules      Rule[]
```

Add to the `User` model (after the `achievements` field):

```prisma
  rulesCreated     Rule[]           @relation("RulesCreated")
  ruleAssignments  RuleAssignment[] @relation("UserRuleAssignments")
  ruleCompletions  RuleCompletion[] @relation("UserRuleCompletions")
```

Add these new models at the end of the file:

```prisma
model RuleType {
  id                 String    @id @default(uuid())
  name               String
  description        String?
  resetMode          String    // DAILY, WEEKLY, INTERVAL
  resetDay           Int?      // Day of week for WEEKLY (0=Sunday). Null otherwise.
  resetIntervalDays  Int?      // For INTERVAL mode. Null otherwise.
  resetIntervalStart DateTime? // Start date for INTERVAL period counting. Null otherwise.
  organizationId     String
  organization       Organization @relation(fields: [organizationId], references: [id])
  sortOrder          Int       @default(0)
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  rules              Rule[]

  @@unique([organizationId, name])
}

model Rule {
  id             String       @id @default(uuid())
  title          String
  description    String?
  ruleTypeId     String
  ruleType       RuleType     @relation(fields: [ruleTypeId], references: [id], onDelete: Cascade)
  assignmentMode String       @default("USER")
  groupId        String?
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  createdById    String
  createdBy      User         @relation("RulesCreated", fields: [createdById], references: [id])
  isActive       Boolean      @default(true)
  sortOrder      Int          @default(0)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  assignments    RuleAssignment[]
  completions    RuleCompletion[]

  @@index([ruleTypeId, sortOrder])
  @@index([organizationId])
}

model RuleAssignment {
  id        String   @id @default(uuid())
  ruleId    String
  rule      Rule     @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation("UserRuleAssignments", fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  completions RuleCompletion[]

  @@unique([ruleId, userId])
  @@index([userId])
}

model RuleCompletion {
  id               String         @id @default(uuid())
  ruleAssignmentId String
  ruleAssignment   RuleAssignment @relation(fields: [ruleAssignmentId], references: [id], onDelete: Cascade)
  userId           String
  user             User           @relation("UserRuleCompletions", fields: [userId], references: [id], onDelete: Cascade)
  ruleId           String
  rule             Rule           @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  periodKey        String
  completedAt      DateTime       @default(now())
  createdAt        DateTime       @default(now())

  @@unique([ruleAssignmentId, periodKey])
  @@index([userId, ruleId])
  @@index([ruleId, periodKey])
}
```

- [ ] **Step 2: Generate migration and Prisma client**

Run:
```bash
npx prisma migrate dev --name add-rules-feature
```

Expected: Migration created successfully, Prisma client regenerated.

- [ ] **Step 3: Verify the schema compiles**

Run:
```bash
npx prisma validate
```

Expected: "The schema is valid."

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add RuleType, Rule, RuleAssignment, RuleCompletion schema models"
```

---

### Task 2: Constants and period computation library

**Files:**
- Create: `lib/ruleConstants.ts`
- Create: `lib/rules.ts`

- [ ] **Step 1: Create rule constants**

Create `lib/ruleConstants.ts`:

```typescript
export const RESET_MODES = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  INTERVAL: 'INTERVAL',
} as const

export type ResetMode = typeof RESET_MODES[keyof typeof RESET_MODES]

export const RESET_MODE_LABELS: Record<ResetMode, string> = {
  [RESET_MODES.DAILY]: 'Daily',
  [RESET_MODES.WEEKLY]: 'Weekly',
  [RESET_MODES.INTERVAL]: 'Every N Days',
}

export const DAY_LABELS: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}
```

- [ ] **Step 2: Create the rules library with period key computation**

Create `lib/rules.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { RESET_MODES } from '@/lib/ruleConstants'

type RuleTypeForPeriod = {
  resetMode: string
  resetDay: number | null
  resetIntervalDays: number | null
  resetIntervalStart: Date | null
}

/**
 * Get the current date string in a timezone (YYYY-MM-DD).
 */
function getDateInTimezone(timezone: string, date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone })
}

/**
 * Get the current day of week (0=Sunday) in a timezone.
 */
function getDayOfWeekInTimezone(timezone: string, date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).formatToParts(date)
  const weekday = parts.find(p => p.type === 'weekday')?.value
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  return dayMap[weekday || 'Sun'] ?? 0
}

/**
 * Compute the period key for a rule type given user timezone and optional date.
 *
 * - DAILY: "2026-04-11"
 * - WEEKLY: "2026-W15-R0" (ISO week adjusted for reset day)
 * - INTERVAL: "interval-5" (period number from start date)
 */
export function getPeriodKey(
  ruleType: RuleTypeForPeriod,
  timezone: string,
  date: Date = new Date()
): string {
  if (ruleType.resetMode === RESET_MODES.DAILY) {
    return getDateInTimezone(timezone, date)
  }

  if (ruleType.resetMode === RESET_MODES.WEEKLY) {
    const resetDay = ruleType.resetDay ?? 0
    const localDate = getDateInTimezone(timezone, date)
    const localDow = getDayOfWeekInTimezone(timezone, date)

    // Calculate days since last reset day
    const daysSinceReset = (localDow - resetDay + 7) % 7
    const resetDate = new Date(localDate)
    resetDate.setDate(resetDate.getDate() - daysSinceReset)

    // Use the reset date as the period identifier
    const resetDateStr = resetDate.toISOString().split('T')[0]
    return `week-${resetDateStr}-R${resetDay}`
  }

  if (ruleType.resetMode === RESET_MODES.INTERVAL) {
    const intervalDays = ruleType.resetIntervalDays ?? 1
    const startDate = ruleType.resetIntervalStart ?? new Date()
    const localDateStr = getDateInTimezone(timezone, date)
    const localDate = new Date(localDateStr)
    const startStr = startDate.toISOString().split('T')[0]
    const start = new Date(startStr)
    const diffMs = localDate.getTime() - start.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const periodNum = Math.floor(diffDays / intervalDays)
    return `interval-${periodNum}`
  }

  return getDateInTimezone(timezone, date)
}

/**
 * Get milliseconds until the next reset for a rule type.
 */
export function getNextResetTime(
  ruleType: RuleTypeForPeriod,
  timezone: string
): number {
  const now = new Date()

  if (ruleType.resetMode === RESET_MODES.DAILY) {
    // Next midnight in user's timezone
    const tomorrow = new Date(
      new Date(getDateInTimezone(timezone, now) + 'T00:00:00').getTime() +
        24 * 60 * 60 * 1000
    )
    // Convert to timezone-aware midnight
    const tomorrowStr = getDateInTimezone(timezone, new Date(now.getTime() + 24 * 60 * 60 * 1000))
    const midnightUtc = new Date(`${tomorrowStr}T00:00:00`)
    // Approximate: the difference between local midnight and UTC
    const offsetMs = now.getTime() - new Date(getDateInTimezone(timezone, now) + 'T00:00:00').getTime()
    return midnightUtc.getTime() + (24 * 60 * 60 * 1000 - offsetMs) - now.getTime()
  }

  if (ruleType.resetMode === RESET_MODES.WEEKLY) {
    const resetDay = ruleType.resetDay ?? 0
    const localDow = getDayOfWeekInTimezone(timezone, now)
    const daysUntilReset = (resetDay - localDow + 7) % 7 || 7
    return daysUntilReset * 24 * 60 * 60 * 1000
  }

  if (ruleType.resetMode === RESET_MODES.INTERVAL) {
    const intervalDays = ruleType.resetIntervalDays ?? 1
    const startDate = ruleType.resetIntervalStart ?? new Date()
    const localDateStr = getDateInTimezone(timezone, now)
    const localDate = new Date(localDateStr)
    const startStr = startDate.toISOString().split('T')[0]
    const start = new Date(startStr)
    const diffMs = localDate.getTime() - start.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const currentPeriodStart = diffDays - (diffDays % intervalDays)
    const nextPeriodStartDay = currentPeriodStart + intervalDays
    const nextResetDate = new Date(start.getTime() + nextPeriodStartDay * 24 * 60 * 60 * 1000)
    return nextResetDate.getTime() - now.getTime()
  }

  return 24 * 60 * 60 * 1000
}

/**
 * Format milliseconds until reset as a human-readable countdown.
 */
export function formatResetCountdown(ms: number): string {
  if (ms <= 0) return 'Resetting...'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `Resets in ${days}d`
  }
  if (hours > 0) return `Resets in ${hours}h`
  return `Resets in ${minutes}m`
}

/**
 * Calculate streak for a single rule assignment.
 * Returns consecutive completed periods working backwards from the previous period
 * (current period is still open, so we start from the one before).
 */
export function calculateRuleStreak(
  completedPeriodKeys: string[],
  allPeriodKeys: string[]
): { current: number; max: number } {
  if (completedPeriodKeys.length === 0) return { current: 0, max: 0 }

  const completedSet = new Set(completedPeriodKeys)

  // Max streak: walk through all period keys in order, count consecutive completions
  let maxStreak = 0
  let tempStreak = 0
  for (const key of allPeriodKeys) {
    if (completedSet.has(key)) {
      tempStreak++
      if (tempStreak > maxStreak) maxStreak = tempStreak
    } else {
      tempStreak = 0
    }
  }

  // Current streak: walk backwards from the most recent completed period
  // Skip the current (latest) period since it's still open
  let currentStreak = 0
  const keysWithoutCurrent = allPeriodKeys.slice(0, -1)
  for (let i = keysWithoutCurrent.length - 1; i >= 0; i--) {
    if (completedSet.has(keysWithoutCurrent[i])) {
      currentStreak++
    } else {
      break
    }
  }

  return { current: currentStreak, max: maxStreak }
}

/**
 * Generate period keys from a start date to today for a given rule type.
 * Used for streak calculation — produces the ordered list of all periods.
 */
export function generatePeriodKeys(
  ruleType: RuleTypeForPeriod,
  timezone: string,
  since: Date
): string[] {
  const keys: string[] = []
  const now = new Date()
  const current = new Date(since)

  while (current <= now) {
    keys.push(getPeriodKey(ruleType, timezone, current))

    if (ruleType.resetMode === RESET_MODES.DAILY) {
      current.setDate(current.getDate() + 1)
    } else if (ruleType.resetMode === RESET_MODES.WEEKLY) {
      current.setDate(current.getDate() + 7)
    } else if (ruleType.resetMode === RESET_MODES.INTERVAL) {
      current.setDate(current.getDate() + (ruleType.resetIntervalDays ?? 1))
    }
  }

  // Deduplicate (in case of timezone edge cases)
  return [...new Set(keys)]
}

/**
 * Get rule assignments for a user with current period completion status.
 * Groups by rule type for display.
 */
export async function getUserRulesWithStatus(userId: string, timezone: string) {
  const assignments = await prisma.ruleAssignment.findMany({
    where: {
      userId,
      rule: { isActive: true },
    },
    include: {
      rule: {
        include: { ruleType: true },
      },
      completions: true,
    },
  })

  // Group by rule type
  const byType = new Map<string, {
    ruleType: typeof assignments[0]['rule']['ruleType']
    rules: {
      assignmentId: string
      ruleId: string
      title: string
      description: string | null
      periodKey: string
      isCompleted: boolean
      completionId: string | null
    }[]
  }>()

  for (const assignment of assignments) {
    const { rule } = assignment
    const { ruleType } = rule
    const periodKey = getPeriodKey(ruleType, timezone)

    const completion = assignment.completions.find(c => c.periodKey === periodKey)

    if (!byType.has(ruleType.id)) {
      byType.set(ruleType.id, { ruleType, rules: [] })
    }

    byType.get(ruleType.id)!.rules.push({
      assignmentId: assignment.id,
      ruleId: rule.id,
      title: rule.title,
      description: rule.description,
      periodKey,
      isCompleted: !!completion,
      completionId: completion?.id ?? null,
    })
  }

  // Sort rules within each type by sort order
  for (const group of byType.values()) {
    group.rules.sort((a, b) => {
      const ruleA = assignments.find(x => x.rule.id === a.ruleId)!.rule
      const ruleB = assignments.find(x => x.rule.id === b.ruleId)!.rule
      return ruleA.sortOrder - ruleB.sortOrder
    })
  }

  // Convert to sorted array by type sort order
  return Array.from(byType.values()).sort(
    (a, b) => a.ruleType.sortOrder - b.ruleType.sortOrder
  )
}

/**
 * Count total and completed rules for the current period (for sidebar badge).
 */
export async function getRuleProgress(userId: string, timezone: string) {
  const groups = await getUserRulesWithStatus(userId, timezone)
  let total = 0
  let completed = 0
  for (const group of groups) {
    for (const rule of group.rules) {
      total++
      if (rule.isCompleted) completed++
    }
  }
  return { total, completed }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/ruleConstants.ts lib/rules.ts
git commit -m "feat: add rule constants and period/streak computation library"
```

---

### Task 3: Server actions — admin CRUD for rule types and rules, user completion toggle

**Files:**
- Create: `app/actions/rules.ts`

- [ ] **Step 1: Create the server actions file**

Create `app/actions/rules.ts`:

```typescript
'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { ensureAdmin } from '@/app/actions/helpers'
import { resolveUserId } from '@/lib/auth-helpers'
import { ASSIGNMENT_MODES } from '@/lib/taskConstants'
import { RESET_MODES } from '@/lib/ruleConstants'
import { getPeriodKey } from '@/lib/rules'
import { getUserTimezoneById } from '@/lib/timezone'

// ── Shared helper ──

async function resolveAssignmentUserIds(
  assignmentMode: string,
  targetId: string | null,
  organizationId: string
): Promise<string[]> {
  if (assignmentMode === ASSIGNMENT_MODES.USER) {
    return targetId ? [targetId] : []
  }
  if (assignmentMode === ASSIGNMENT_MODES.GROUP) {
    if (!targetId) return []
    const group = await prisma.userGroup.findUnique({
      where: { id: targetId },
      include: { users: { select: { id: true } } },
    })
    return group ? group.users.map(u => u.id) : []
  }
  if (assignmentMode === ASSIGNMENT_MODES.ALL) {
    const users = await prisma.user.findMany({
      where: { organizationId },
      select: { id: true },
    })
    return users.map(u => u.id)
  }
  return []
}

// ── Rule Type CRUD (Admin) ──

export async function createRuleType(formData: FormData) {
  const session = await ensureAdmin()
  const organizationId = session.user.organizationId

  const name = (formData.get('name') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const resetMode = formData.get('resetMode') as string
  const resetDay = resetMode === RESET_MODES.WEEKLY
    ? parseInt(formData.get('resetDay') as string)
    : null
  const resetIntervalDays = resetMode === RESET_MODES.INTERVAL
    ? parseInt(formData.get('resetIntervalDays') as string)
    : null
  const resetIntervalStart = resetMode === RESET_MODES.INTERVAL
    ? new Date()
    : null

  if (!name) return { error: 'Name is required' }
  if (!Object.values(RESET_MODES).includes(resetMode as any)) {
    return { error: 'Invalid reset mode' }
  }
  if (resetMode === RESET_MODES.WEEKLY && (resetDay === null || resetDay < 0 || resetDay > 6)) {
    return { error: 'Invalid reset day' }
  }
  if (resetMode === RESET_MODES.INTERVAL && (!resetIntervalDays || resetIntervalDays < 1)) {
    return { error: 'Interval must be at least 1 day' }
  }

  try {
    const existing = await prisma.ruleType.findUnique({
      where: { organizationId_name: { organizationId, name } },
    })
    if (existing) return { error: 'A rule type with this name already exists' }

    const maxSort = await prisma.ruleType.aggregate({
      where: { organizationId },
      _max: { sortOrder: true },
    })

    await prisma.ruleType.create({
      data: {
        name,
        description,
        resetMode,
        resetDay,
        resetIntervalDays,
        resetIntervalStart,
        organizationId,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    })

    revalidatePath('/admin/rules/types')
    return { success: true }
  } catch (e) {
    console.error('Create rule type error:', e)
    return { error: 'Failed to create rule type' }
  }
}

export async function updateRuleType(typeId: string, formData: FormData) {
  const session = await ensureAdmin()
  const organizationId = session.user.organizationId

  const name = (formData.get('name') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const resetMode = formData.get('resetMode') as string
  const resetDay = resetMode === RESET_MODES.WEEKLY
    ? parseInt(formData.get('resetDay') as string)
    : null
  const resetIntervalDays = resetMode === RESET_MODES.INTERVAL
    ? parseInt(formData.get('resetIntervalDays') as string)
    : null

  if (!name) return { error: 'Name is required' }

  try {
    const ruleType = await prisma.ruleType.findUnique({ where: { id: typeId } })
    if (!ruleType || ruleType.organizationId !== organizationId) {
      return { error: 'Rule type not found' }
    }

    // Check name uniqueness (excluding self)
    const duplicate = await prisma.ruleType.findFirst({
      where: { organizationId, name, id: { not: typeId } },
    })
    if (duplicate) return { error: 'A rule type with this name already exists' }

    await prisma.ruleType.update({
      where: { id: typeId },
      data: {
        name,
        description,
        resetMode,
        resetDay,
        resetIntervalDays,
        // Keep existing resetIntervalStart if switching to INTERVAL
        ...(resetMode === RESET_MODES.INTERVAL && !ruleType.resetIntervalStart
          ? { resetIntervalStart: new Date() }
          : {}),
      },
    })

    revalidatePath('/admin/rules/types')
    revalidatePath(`/admin/rules/types/${typeId}`)
    return { success: true }
  } catch (e) {
    console.error('Update rule type error:', e)
    return { error: 'Failed to update rule type' }
  }
}

export async function deleteRuleType(typeId: string) {
  const session = await ensureAdmin()
  const organizationId = session.user.organizationId

  try {
    const ruleType = await prisma.ruleType.findUnique({
      where: { id: typeId },
      include: { _count: { select: { rules: true } } },
    })
    if (!ruleType || ruleType.organizationId !== organizationId) {
      return { error: 'Rule type not found' }
    }
    if (ruleType._count.rules > 0) {
      return { error: 'Cannot delete a rule type that has rules. Remove all rules first.' }
    }

    await prisma.ruleType.delete({ where: { id: typeId } })

    revalidatePath('/admin/rules/types')
    return { success: true }
  } catch (e) {
    console.error('Delete rule type error:', e)
    return { error: 'Failed to delete rule type' }
  }
}

// ── Rule CRUD (Admin) ──

export async function createRule(ruleTypeId: string, formData: FormData) {
  const session = await ensureAdmin()
  const organizationId = session.user.organizationId
  const createdById = session.user.id

  const title = (formData.get('title') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const assignmentMode = (formData.get('assignmentMode') as string) || ASSIGNMENT_MODES.USER
  const targetId = formData.get('targetId') as string | null

  if (!title) return { error: 'Title is required' }
  if (!createdById) return { error: 'Could not resolve user' }

  try {
    const ruleType = await prisma.ruleType.findUnique({ where: { id: ruleTypeId } })
    if (!ruleType || ruleType.organizationId !== organizationId) {
      return { error: 'Rule type not found' }
    }

    const userIds = await resolveAssignmentUserIds(assignmentMode, targetId, organizationId)

    const maxSort = await prisma.rule.aggregate({
      where: { ruleTypeId },
      _max: { sortOrder: true },
    })

    await prisma.$transaction(async (tx) => {
      const rule = await tx.rule.create({
        data: {
          title,
          description,
          ruleTypeId,
          assignmentMode,
          groupId: assignmentMode === ASSIGNMENT_MODES.GROUP ? targetId : null,
          organizationId,
          createdById,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
      })

      if (userIds.length > 0) {
        await tx.ruleAssignment.createMany({
          data: userIds.map(userId => ({
            ruleId: rule.id,
            userId,
          })),
        })
      }
    })

    revalidatePath(`/admin/rules/types/${ruleTypeId}`)
    revalidatePath('/dashboard')
    revalidatePath('/rules')
    return { success: true }
  } catch (e) {
    console.error('Create rule error:', e)
    return { error: 'Failed to create rule' }
  }
}

export async function updateRule(ruleId: string, ruleTypeId: string, formData: FormData) {
  const session = await ensureAdmin()
  const organizationId = session.user.organizationId

  const title = (formData.get('title') as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const isActive = formData.get('isActive') === 'on'
  const assignmentMode = formData.get('assignmentMode') as string | null
  const targetId = formData.get('targetId') as string | null

  if (!title) return { error: 'Title is required' }

  try {
    const rule = await prisma.rule.findUnique({ where: { id: ruleId } })
    if (!rule || rule.organizationId !== organizationId) {
      return { error: 'Rule not found' }
    }

    const newUserIds = assignmentMode
      ? await resolveAssignmentUserIds(assignmentMode, targetId, organizationId)
      : []

    await prisma.$transaction(async (tx) => {
      await tx.rule.update({
        where: { id: ruleId },
        data: { title, description, isActive },
      })

      // Additive-only: never remove existing assignments
      if (assignmentMode && newUserIds.length > 0) {
        const existing = await tx.ruleAssignment.findMany({
          where: { ruleId },
          select: { userId: true },
        })
        const existingUserIds = new Set(existing.map(a => a.userId))
        const toCreate = newUserIds.filter(id => !existingUserIds.has(id))

        if (toCreate.length > 0) {
          await tx.ruleAssignment.createMany({
            data: toCreate.map(userId => ({ ruleId, userId })),
          })
        }
      }
    })

    revalidatePath(`/admin/rules/types/${ruleTypeId}`)
    revalidatePath('/dashboard')
    revalidatePath('/rules')
    return { success: true }
  } catch (e) {
    console.error('Update rule error:', e)
    return { error: 'Failed to update rule' }
  }
}

export async function deleteRule(ruleId: string, ruleTypeId: string) {
  const session = await ensureAdmin()
  const organizationId = session.user.organizationId

  try {
    const rule = await prisma.rule.findUnique({ where: { id: ruleId } })
    if (!rule || rule.organizationId !== organizationId) {
      return { error: 'Rule not found' }
    }

    await prisma.rule.delete({ where: { id: ruleId } })

    revalidatePath(`/admin/rules/types/${ruleTypeId}`)
    revalidatePath('/dashboard')
    revalidatePath('/rules')
    return { success: true }
  } catch (e) {
    console.error('Delete rule error:', e)
    return { error: 'Failed to delete rule' }
  }
}

// ── User Completion Toggle ──

export async function toggleRuleCompletion(assignmentId: string) {
  const session = await auth()
  if (!session?.user) return { error: 'Unauthorized' }

  const userId = await resolveUserId(session)
  if (!userId) return { error: 'Could not resolve user' }

  try {
    const assignment = await prisma.ruleAssignment.findUnique({
      where: { id: assignmentId },
      include: { rule: { include: { ruleType: true } } },
    })

    if (!assignment) return { error: 'Assignment not found' }
    if (assignment.userId !== userId) return { error: 'Unauthorized' }

    const timezone = await getUserTimezoneById(userId)
    const periodKey = getPeriodKey(assignment.rule.ruleType, timezone)

    // Check if already completed for this period
    const existing = await prisma.ruleCompletion.findUnique({
      where: { ruleAssignmentId_periodKey: { ruleAssignmentId: assignmentId, periodKey } },
    })

    if (existing) {
      // Uncomplete: remove the completion
      await prisma.ruleCompletion.delete({ where: { id: existing.id } })
    } else {
      // Complete: create the completion
      await prisma.ruleCompletion.create({
        data: {
          ruleAssignmentId: assignmentId,
          userId,
          ruleId: assignment.ruleId,
          periodKey,
        },
      })
    }

    revalidatePath('/rules')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (e) {
    console.error('Toggle rule completion error:', e)
    return { error: 'Failed to toggle rule completion' }
  }
}

// ── Pre-seed helper ──

export async function ensureDefaultRuleTypes(organizationId: string) {
  const existing = await prisma.ruleType.findMany({
    where: { organizationId },
    select: { name: true },
  })
  const existingNames = new Set(existing.map(t => t.name))

  const defaults = [
    { name: 'Daily', resetMode: RESET_MODES.DAILY, sortOrder: 0 },
    { name: 'Weekly', resetMode: RESET_MODES.WEEKLY, resetDay: 0, sortOrder: 1 },
  ]

  for (const def of defaults) {
    if (!existingNames.has(def.name)) {
      await prisma.ruleType.create({
        data: { ...def, organizationId },
      })
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/actions/rules.ts
git commit -m "feat: add server actions for rule types, rules, and completion toggle"
```

---

### Task 4: Admin — Rule Types list page

**Files:**
- Create: `app/admin/rules/types/page.tsx`
- Create: `components/admin/RuleTypeForm.tsx`
- Modify: `components/admin/AdminSidebar.tsx`

- [ ] **Step 1: Create the RuleTypeForm component**

Create `components/admin/RuleTypeForm.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/providers/ToastProvider'
import { RESET_MODES, RESET_MODE_LABELS, DAY_LABELS } from '@/lib/ruleConstants'

type RuleTypeFormProps = {
  action: (formData: FormData) => Promise<{ success?: boolean; error?: string }>
  initialData?: {
    id: string
    name: string
    description: string | null
    resetMode: string
    resetDay: number | null
    resetIntervalDays: number | null
  }
  mode: 'create' | 'edit'
  cancelHref: string
}

export function RuleTypeForm({ action, initialData, mode, cancelHref }: RuleTypeFormProps) {
  const [resetMode, setResetMode] = useState(initialData?.resetMode || RESET_MODES.DAILY)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await action(formData)
      if (result.success) {
        showToast(mode === 'create' ? 'Rule type created' : 'Rule type updated', 'success')
        router.push(cancelHref)
      } else {
        showToast(result.error || 'Something went wrong', 'error')
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-lg">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">Name</label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={initialData?.name}
          required
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="e.g., Daily, Weekly, Traveling"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">Description (optional)</label>
        <textarea
          id="description"
          name="description"
          defaultValue={initialData?.description || ''}
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="What kind of rules belong in this type?"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Reset Schedule</label>
        <div className="flex gap-2">
          {Object.entries(RESET_MODE_LABELS).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setResetMode(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                resetMode === value
                  ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input type="hidden" name="resetMode" value={resetMode} />
      </div>

      {resetMode === RESET_MODES.WEEKLY && (
        <div>
          <label htmlFor="resetDay" className="block text-sm font-medium text-gray-300 mb-1">Reset Day</label>
          <select
            id="resetDay"
            name="resetDay"
            defaultValue={initialData?.resetDay ?? 0}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {Object.entries(DAY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Rules reset at midnight on this day</p>
        </div>
      )}

      {resetMode === RESET_MODES.INTERVAL && (
        <div>
          <label htmlFor="resetIntervalDays" className="block text-sm font-medium text-gray-300 mb-1">
            Interval (days)
          </label>
          <input
            id="resetIntervalDays"
            name="resetIntervalDays"
            type="number"
            min={1}
            defaultValue={initialData?.resetIntervalDays ?? 3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-gray-500 mt-1">Rules reset every N days from creation</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {isPending
            ? (mode === 'create' ? 'Creating...' : 'Saving...')
            : (mode === 'create' ? 'Create Rule Type' : 'Save Changes')}
        </button>
        <button
          type="button"
          onClick={() => router.push(cancelHref)}
          className="px-6 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Create the rule types list page**

Create `app/admin/rules/types/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { ensureDefaultRuleTypes } from '@/app/actions/rules'
import { RESET_MODES, DAY_LABELS } from '@/lib/ruleConstants'
import { RuleTypeForm } from '@/components/admin/RuleTypeForm'
import { createRuleType } from '@/app/actions/rules'

function formatResetSchedule(ruleType: { resetMode: string; resetDay: number | null; resetIntervalDays: number | null }) {
  if (ruleType.resetMode === RESET_MODES.DAILY) return 'Resets daily at midnight'
  if (ruleType.resetMode === RESET_MODES.WEEKLY) {
    return `Resets weekly on ${DAY_LABELS[ruleType.resetDay ?? 0]} at midnight`
  }
  if (ruleType.resetMode === RESET_MODES.INTERVAL) {
    return `Resets every ${ruleType.resetIntervalDays} day${ruleType.resetIntervalDays === 1 ? '' : 's'}`
  }
  return 'Unknown schedule'
}

export default async function RuleTypesPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard')

  const organizationId = session.user.organizationId

  // Pre-seed Daily and Weekly if they don't exist
  await ensureDefaultRuleTypes(organizationId)

  const ruleTypes = await prisma.ruleType.findMany({
    where: { organizationId },
    include: { _count: { select: { rules: true } } },
    orderBy: { sortOrder: 'asc' },
  })

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Rule Types</h1>
      </div>

      {/* Rule type list */}
      <div className="space-y-3 mb-10">
        {ruleTypes.map(rt => (
          <Link
            key={rt.id}
            href={`/admin/rules/types/${rt.id}`}
            className="block p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/20 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-medium">{rt.name}</h3>
                {rt.description && (
                  <p className="text-sm text-gray-400 mt-0.5">{rt.description}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">{formatResetSchedule(rt)}</p>
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-400">
                  {rt._count.rules} rule{rt._count.rules === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Create new type */}
      <div className="border-t border-white/10 pt-8">
        <h2 className="text-lg font-semibold text-white mb-4">Create New Type</h2>
        <RuleTypeForm
          action={createRuleType}
          mode="create"
          cancelHref="/admin/rules/types"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add Rules link to AdminSidebar**

In `components/admin/AdminSidebar.tsx`, add a Rules link after the Tasks link. Find this block:

```typescript
                <Link href="/admin/tasks" className={linkClass('/admin/tasks')} onClick={() => setIsOpen(false)}>
                    Tasks
                </Link>
```

Add after it:

```typescript
                <Link href="/admin/rules/types" className={linkClass('/admin/rules')} onClick={() => setIsOpen(false)}>
                    Rules
                </Link>
```

- [ ] **Step 4: Verify the page loads**

Run: `npm run dev`

Navigate to `http://localhost:3000/admin/rules/types`. Verify:
- Daily and Weekly types are pre-seeded
- The create form renders with reset mode toggle
- The admin sidebar shows the Rules link

- [ ] **Step 5: Commit**

```bash
git add app/admin/rules/types/page.tsx components/admin/RuleTypeForm.tsx components/admin/AdminSidebar.tsx
git commit -m "feat: add admin rule types list page with pre-seeding and create form"
```

---

### Task 5: Admin — Rule Type detail page (with rules list)

**Files:**
- Create: `app/admin/rules/types/[typeId]/page.tsx`
- Create: `components/admin/RuleForm.tsx`

- [ ] **Step 1: Create the RuleForm component**

Create `components/admin/RuleForm.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/providers/ToastProvider'
import { ASSIGNMENT_MODES } from '@/lib/taskConstants'

type RuleFormProps = {
  users: { id: string; name: string | null; email: string }[]
  groups: { id: string; name: string; _count: { users: number } }[]
  action: (formData: FormData) => Promise<{ success?: boolean; error?: string }>
  initialData?: {
    id: string
    title: string
    description: string | null
    assignmentMode: string
    groupId: string | null
    isActive: boolean
  }
  mode: 'create' | 'edit'
  cancelHref: string
}

export function RuleForm({ users, groups, action, initialData, mode, cancelHref }: RuleFormProps) {
  const [assignmentMode, setAssignmentMode] = useState(initialData?.assignmentMode || ASSIGNMENT_MODES.ALL)
  const [targetId, setTargetId] = useState(initialData?.groupId || '')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await action(formData)
      if (result.success) {
        showToast(mode === 'create' ? 'Rule created' : 'Rule updated', 'success')
        router.push(cancelHref)
      } else {
        showToast(result.error || 'Something went wrong', 'error')
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-lg">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">Title</label>
        <input
          id="title"
          name="title"
          type="text"
          defaultValue={initialData?.title}
          required
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="e.g., Morning meditation"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">Description (optional)</label>
        <textarea
          id="description"
          name="description"
          defaultValue={initialData?.description || ''}
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {mode === 'create' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Assign To</label>
            <div className="flex gap-2">
              {Object.entries({ ALL: 'Everyone', GROUP: 'Group', USER: 'User' }).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setAssignmentMode(value); setTargetId('') }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    assignmentMode === value
                      ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                      : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input type="hidden" name="assignmentMode" value={assignmentMode} />
            <input type="hidden" name="targetId" value={targetId} />
          </div>

          {assignmentMode === ASSIGNMENT_MODES.USER && (
            <div>
              <label htmlFor="userSelect" className="block text-sm font-medium text-gray-300 mb-1">User</label>
              <select
                id="userSelect"
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select a user...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
            </div>
          )}

          {assignmentMode === ASSIGNMENT_MODES.GROUP && (
            <div>
              <label htmlFor="groupSelect" className="block text-sm font-medium text-gray-300 mb-1">Group</label>
              <select
                id="groupSelect"
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">Select a group...</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g._count.users} members)</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {mode === 'edit' && (
        <div className="flex items-center gap-3">
          <input
            id="isActive"
            name="isActive"
            type="checkbox"
            defaultChecked={initialData?.isActive ?? true}
            className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
          />
          <label htmlFor="isActive" className="text-sm text-gray-300">Active</label>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {isPending
            ? (mode === 'create' ? 'Creating...' : 'Saving...')
            : (mode === 'create' ? 'Create Rule' : 'Save Changes')}
        </button>
        <button
          type="button"
          onClick={() => router.push(cancelHref)}
          className="px-6 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Create the rule type detail page**

Create `app/admin/rules/types/[typeId]/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { RESET_MODES, DAY_LABELS } from '@/lib/ruleConstants'
import { ASSIGNMENT_MODES } from '@/lib/taskConstants'
import { deleteRule } from '@/app/actions/rules'

function formatResetSchedule(ruleType: { resetMode: string; resetDay: number | null; resetIntervalDays: number | null }) {
  if (ruleType.resetMode === RESET_MODES.DAILY) return 'Resets daily at midnight'
  if (ruleType.resetMode === RESET_MODES.WEEKLY) {
    return `Resets weekly on ${DAY_LABELS[ruleType.resetDay ?? 0]} at midnight`
  }
  if (ruleType.resetMode === RESET_MODES.INTERVAL) {
    return `Resets every ${ruleType.resetIntervalDays} day${ruleType.resetIntervalDays === 1 ? '' : 's'}`
  }
  return 'Unknown schedule'
}

const MODE_BADGES: Record<string, { label: string; className: string }> = {
  [ASSIGNMENT_MODES.ALL]: { label: 'Everyone', className: 'bg-green-500/20 text-green-400' },
  [ASSIGNMENT_MODES.GROUP]: { label: 'Group', className: 'bg-blue-500/20 text-blue-400' },
  [ASSIGNMENT_MODES.USER]: { label: 'User', className: 'bg-yellow-500/20 text-yellow-400' },
}

export default async function RuleTypeDetailPage({ params }: { params: Promise<{ typeId: string }> }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard')

  const { typeId } = await params

  const ruleType = await prisma.ruleType.findUnique({
    where: { id: typeId },
    include: {
      rules: {
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: { select: { assignments: true } },
        },
      },
    },
  })

  if (!ruleType || ruleType.organizationId !== session.user.organizationId) {
    notFound()
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/admin/rules/types" className="text-sm text-gray-400 hover:text-white mb-2 inline-block">
        &larr; Back to Rule Types
      </Link>

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">{ruleType.name}</h1>
        <Link
          href={`/admin/rules/types/${typeId}/edit`}
          className="text-sm px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors"
        >
          Edit Type
        </Link>
      </div>

      {ruleType.description && (
        <p className="text-gray-400 mb-2">{ruleType.description}</p>
      )}
      <p className="text-sm text-gray-500 mb-8">{formatResetSchedule(ruleType)}</p>

      {/* Rules list */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Rules</h2>
        <Link
          href={`/admin/rules/types/${typeId}/rules/new`}
          className="text-sm px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
        >
          + Add Rule
        </Link>
      </div>

      {ruleType.rules.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white/5 rounded-xl border border-white/10">
          <p className="text-lg mb-2">No rules yet</p>
          <p className="text-sm">Create rules that users will check off each {ruleType.resetMode === RESET_MODES.DAILY ? 'day' : ruleType.resetMode === RESET_MODES.WEEKLY ? 'week' : 'period'}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ruleType.rules.map(rule => {
            const badge = MODE_BADGES[rule.assignmentMode] || MODE_BADGES.ALL

            return (
              <div
                key={rule.id}
                className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/[0.07] transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className={`font-medium ${rule.isActive ? 'text-white' : 'text-gray-500'}`}>
                        {rule.title}
                      </h3>
                      {!rule.isActive && (
                        <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">Inactive</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-sm text-gray-400 mt-1">{rule.description}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {rule._count.assignments} assigned user{rule._count.assignments === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link
                      href={`/admin/rules/types/${typeId}/rules/${rule.id}`}
                      className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors"
                    >
                      Details
                    </Link>
                    <Link
                      href={`/admin/rules/types/${typeId}/rules/${rule.id}/edit`}
                      className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors"
                    >
                      Edit
                    </Link>
                    <form action={async () => {
                      'use server'
                      await deleteRule(rule.id, typeId)
                    }}>
                      <button className="text-xs px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify the page loads**

Navigate to `http://localhost:3000/admin/rules/types`, click on "Daily". Verify the empty state renders correctly with the "Add Rule" button.

- [ ] **Step 4: Commit**

```bash
git add app/admin/rules/types/[typeId]/page.tsx components/admin/RuleForm.tsx
git commit -m "feat: add admin rule type detail page with rules list"
```

---

### Task 6: Admin — Rule Type edit page

**Files:**
- Create: `app/admin/rules/types/[typeId]/edit/page.tsx`

- [ ] **Step 1: Create the edit page**

Create `app/admin/rules/types/[typeId]/edit/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { RuleTypeForm } from '@/components/admin/RuleTypeForm'
import { updateRuleType, deleteRuleType } from '@/app/actions/rules'

export default async function EditRuleTypePage({ params }: { params: Promise<{ typeId: string }> }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard')

  const { typeId } = await params

  const ruleType = await prisma.ruleType.findUnique({
    where: { id: typeId },
    include: { _count: { select: { rules: true } } },
  })

  if (!ruleType || ruleType.organizationId !== session.user.organizationId) {
    notFound()
  }

  const handleUpdate = async (formData: FormData) => {
    'use server'
    return updateRuleType(typeId, formData)
  }

  const handleDelete = async () => {
    'use server'
    const result = await deleteRuleType(typeId)
    if (result.success) {
      redirect('/admin/rules/types')
    }
    return result
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link href={`/admin/rules/types/${typeId}`} className="text-sm text-gray-400 hover:text-white mb-2 inline-block">
        &larr; Back to {ruleType.name}
      </Link>

      <h1 className="text-2xl font-bold text-white mb-8">Edit Rule Type</h1>

      <RuleTypeForm
        action={handleUpdate}
        initialData={{
          id: ruleType.id,
          name: ruleType.name,
          description: ruleType.description,
          resetMode: ruleType.resetMode,
          resetDay: ruleType.resetDay,
          resetIntervalDays: ruleType.resetIntervalDays,
        }}
        mode="edit"
        cancelHref={`/admin/rules/types/${typeId}`}
      />

      {ruleType._count.rules === 0 && (
        <div className="mt-12 pt-8 border-t border-white/10">
          <h2 className="text-sm font-medium text-red-400 mb-3">Danger Zone</h2>
          <form action={handleDelete}>
            <button className="text-sm px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors">
              Delete Rule Type
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/rules/types/[typeId]/edit/page.tsx
git commit -m "feat: add admin rule type edit page"
```

---

### Task 7: Admin — Create rule page and rule detail page

**Files:**
- Create: `app/admin/rules/types/[typeId]/rules/new/page.tsx`
- Create: `app/admin/rules/types/[typeId]/rules/[ruleId]/page.tsx`
- Create: `app/admin/rules/types/[typeId]/rules/[ruleId]/edit/page.tsx`

- [ ] **Step 1: Create the new rule page**

Create `app/admin/rules/types/[typeId]/rules/new/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { RuleForm } from '@/components/admin/RuleForm'
import { createRule } from '@/app/actions/rules'

export default async function NewRulePage({ params }: { params: Promise<{ typeId: string }> }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard')

  const { typeId } = await params

  const ruleType = await prisma.ruleType.findUnique({ where: { id: typeId } })
  if (!ruleType || ruleType.organizationId !== session.user.organizationId) {
    notFound()
  }

  const [users, groups] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true, name: true, email: true },
      orderBy: { email: 'asc' },
    }),
    prisma.userGroup.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true, name: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    }),
  ])

  const handleCreate = async (formData: FormData) => {
    'use server'
    return createRule(typeId, formData)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link href={`/admin/rules/types/${typeId}`} className="text-sm text-gray-400 hover:text-white mb-2 inline-block">
        &larr; Back to {ruleType.name}
      </Link>

      <h1 className="text-2xl font-bold text-white mb-8">New {ruleType.name} Rule</h1>

      <RuleForm
        users={users}
        groups={groups}
        action={handleCreate}
        mode="create"
        cancelHref={`/admin/rules/types/${typeId}`}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create the rule detail page**

Create `app/admin/rules/types/[typeId]/rules/[ruleId]/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { getPeriodKey } from '@/lib/rules'
import { getUserTimezone } from '@/lib/timezone'

export default async function RuleDetailPage({
  params,
}: {
  params: Promise<{ typeId: string; ruleId: string }>
}) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard')

  const { typeId, ruleId } = await params
  const timezone = await getUserTimezone(session.user.id)

  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    include: {
      ruleType: true,
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          completions: true,
        },
      },
    },
  })

  if (!rule || rule.organizationId !== session.user.organizationId || rule.ruleTypeId !== typeId) {
    notFound()
  }

  const periodKey = getPeriodKey(rule.ruleType, timezone)
  const totalAssigned = rule.assignments.length
  const completedThisPeriod = rule.assignments.filter(a =>
    a.completions.some(c => c.periodKey === periodKey)
  ).length

  const completionRate = totalAssigned > 0
    ? Math.round((completedThisPeriod / totalAssigned) * 100)
    : 0

  return (
    <div className="max-w-4xl mx-auto">
      <Link href={`/admin/rules/types/${typeId}`} className="text-sm text-gray-400 hover:text-white mb-2 inline-block">
        &larr; Back to {rule.ruleType.name}
      </Link>

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">{rule.title}</h1>
        <Link
          href={`/admin/rules/types/${typeId}/rules/${ruleId}/edit`}
          className="text-sm px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors"
        >
          Edit
        </Link>
      </div>

      {rule.description && (
        <p className="text-gray-400 mb-6">{rule.description}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{totalAssigned}</div>
          <div className="text-xs text-gray-400">Assigned</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{completedThisPeriod}</div>
          <div className="text-xs text-gray-400">Completed (this period)</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{completionRate}%</div>
          <div className="text-xs text-gray-400">Completion Rate</div>
        </div>
      </div>

      {/* Progress bar */}
      {totalAssigned > 0 && (
        <div className="mb-8">
          <div className="bg-white/10 rounded-full h-2 overflow-hidden">
            <div
              className="bg-purple-500 h-full rounded-full transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Per-user breakdown */}
      <h2 className="text-lg font-semibold text-white mb-4">Assignments</h2>
      <div className="space-y-2">
        {rule.assignments
          .sort((a, b) => {
            const aComplete = a.completions.some(c => c.periodKey === periodKey)
            const bComplete = b.completions.some(c => c.periodKey === periodKey)
            if (aComplete !== bComplete) return aComplete ? -1 : 1
            return (a.user.name || a.user.email).localeCompare(b.user.name || b.user.email)
          })
          .map(assignment => {
            const completed = assignment.completions.some(c => c.periodKey === periodKey)
            return (
              <div
                key={assignment.id}
                className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-lg ${completed ? 'opacity-100' : 'opacity-30'}`}>
                    {completed ? '✅' : '⬜'}
                  </span>
                  <span className="text-white">{assignment.user.name || assignment.user.email}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {assignment.completions.length} total completion{assignment.completions.length === 1 ? '' : 's'}
                </span>
              </div>
            )
          })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create the rule edit page**

Create `app/admin/rules/types/[typeId]/rules/[ruleId]/edit/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { RuleForm } from '@/components/admin/RuleForm'
import { updateRule } from '@/app/actions/rules'

export default async function EditRulePage({
  params,
}: {
  params: Promise<{ typeId: string; ruleId: string }>
}) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard')

  const { typeId, ruleId } = await params

  const rule = await prisma.rule.findUnique({ where: { id: ruleId } })
  if (!rule || rule.organizationId !== session.user.organizationId || rule.ruleTypeId !== typeId) {
    notFound()
  }

  const ruleType = await prisma.ruleType.findUnique({ where: { id: typeId } })

  const [users, groups] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true, name: true, email: true },
      orderBy: { email: 'asc' },
    }),
    prisma.userGroup.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true, name: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    }),
  ])

  const handleUpdate = async (formData: FormData) => {
    'use server'
    return updateRule(ruleId, typeId, formData)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link href={`/admin/rules/types/${typeId}`} className="text-sm text-gray-400 hover:text-white mb-2 inline-block">
        &larr; Back to {ruleType?.name || 'Rules'}
      </Link>

      <h1 className="text-2xl font-bold text-white mb-8">Edit Rule</h1>

      <RuleForm
        users={users}
        groups={groups}
        action={handleUpdate}
        initialData={{
          id: rule.id,
          title: rule.title,
          description: rule.description,
          assignmentMode: rule.assignmentMode,
          groupId: rule.groupId,
          isActive: rule.isActive,
        }}
        mode="edit"
        cancelHref={`/admin/rules/types/${typeId}`}
      />
    </div>
  )
}
```

- [ ] **Step 4: Verify the full admin flow**

1. Navigate to `/admin/rules/types`
2. Click "Daily" → Click "+ Add Rule" → Create a rule assigned to "Everyone"
3. Verify the rule appears in the list with "Everyone" badge
4. Click "Details" → Verify stats and assignment list
5. Click "Edit" → Verify form populates, modify title, save

- [ ] **Step 5: Commit**

```bash
git add app/admin/rules/types/[typeId]/rules/
git commit -m "feat: add admin pages for creating, viewing, and editing rules"
```

---

### Task 8: User-facing Rules page

**Files:**
- Create: `app/rules/page.tsx`
- Create: `components/RuleCheckbox.tsx`

- [ ] **Step 1: Create the RuleCheckbox component**

Create `components/RuleCheckbox.tsx`:

```typescript
'use client'

import { useTransition } from 'react'
import { toggleRuleCompletion } from '@/app/actions/rules'

type RuleCheckboxProps = {
  assignmentId: string
  title: string
  description: string | null
  isCompleted: boolean
  streakCurrent: number
}

export function RuleCheckbox({ assignmentId, title, description, isCompleted, streakCurrent }: RuleCheckboxProps) {
  const [isPending, startTransition] = useTransition()

  const handleToggle = () => {
    startTransition(async () => {
      await toggleRuleCompletion(assignmentId)
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
        isCompleted
          ? 'bg-green-500/10 border border-green-500/20'
          : 'bg-white/5 border border-white/10 hover:bg-white/10'
      } ${isPending ? 'opacity-50' : ''}`}
    >
      <span className="text-lg flex-shrink-0">
        {isPending ? '⏳' : isCompleted ? '✅' : '⬜'}
      </span>
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${isCompleted ? 'text-green-300 line-through' : 'text-white'}`}>
          {title}
        </span>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{description}</p>
        )}
      </div>
      {streakCurrent > 0 && (
        <span className="text-xs text-orange-400 flex-shrink-0" title={`${streakCurrent} period streak`}>
          🔥 {streakCurrent}
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Create the Rules page**

Create `app/rules/page.tsx`:

```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUserRulesWithStatus, getNextResetTime, formatResetCountdown, generatePeriodKeys, calculateRuleStreak } from '@/lib/rules'
import { resolveUserId } from '@/lib/auth-helpers'
import { getUserTimezone } from '@/lib/timezone'
import { prisma } from '@/lib/prisma'
import { RuleCheckbox } from '@/components/RuleCheckbox'

export default async function RulesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const userId = await resolveUserId(session)
  if (!userId) redirect('/login')

  const timezone = await getUserTimezone(userId)
  const ruleGroups = await getUserRulesWithStatus(userId, timezone)

  if (ruleGroups.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">No rules assigned to you yet.</p>
          <Link href="/dashboard" className="text-purple-400 hover:text-purple-300 transition-colors">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Compute streaks for each rule
  const streakData = new Map<string, { current: number; max: number }>()
  for (const group of ruleGroups) {
    for (const rule of group.rules) {
      // Get all completions for this assignment
      const completions = await prisma.ruleCompletion.findMany({
        where: { ruleAssignmentId: rule.assignmentId },
        select: { periodKey: true },
        orderBy: { periodKey: 'asc' },
      })

      // Get the assignment creation date for period generation
      const assignment = await prisma.ruleAssignment.findUnique({
        where: { id: rule.assignmentId },
        select: { createdAt: true },
      })

      if (assignment) {
        const allKeys = generatePeriodKeys(group.ruleType, timezone, assignment.createdAt)
        const completedKeys = completions.map(c => c.periodKey)
        streakData.set(rule.assignmentId, calculateRuleStreak(completedKeys, allKeys))
      }
    }
  }

  // Compute per-type "perfect" streaks
  const perfectStreaks = new Map<string, number>()
  for (const group of ruleGroups) {
    // For simplicity in v1, count consecutive periods where ALL rules were completed
    // This is a lightweight approximation — check the most recent periods
    const allRuleKeys = group.rules.map(r => streakData.get(r.assignmentId)?.current ?? 0)
    const minStreak = allRuleKeys.length > 0 ? Math.min(...allRuleKeys) : 0
    perfectStreaks.set(group.ruleType.id, minStreak)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Rules</h1>
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">
            &larr; Dashboard
          </Link>
        </div>

        <div className="space-y-8">
          {ruleGroups.map(group => {
            const completed = group.rules.filter(r => r.isCompleted).length
            const total = group.rules.length
            const resetMs = getNextResetTime(group.ruleType, timezone)
            const perfectStreak = perfectStreaks.get(group.ruleType.id) ?? 0

            return (
              <div key={group.ruleType.id}>
                {/* Type header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-white">{group.ruleType.name}</h2>
                    <span className="text-sm text-gray-400">{completed}/{total}</span>
                    {perfectStreak > 0 && (
                      <span className="text-xs text-orange-400" title={`${perfectStreak} perfect period streak`}>
                        🔥 {perfectStreak} perfect
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">{formatResetCountdown(resetMs)}</span>
                </div>

                {/* Progress bar */}
                <div className="bg-white/10 rounded-full h-1.5 overflow-hidden mb-4">
                  <div
                    className={`h-full rounded-full transition-all ${
                      completed === total ? 'bg-green-500' : 'bg-purple-500'
                    }`}
                    style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
                  />
                </div>

                {/* Rule checkboxes */}
                <div className="space-y-2">
                  {group.rules.map(rule => (
                    <RuleCheckbox
                      key={rule.assignmentId}
                      assignmentId={rule.assignmentId}
                      title={rule.title}
                      description={rule.description}
                      isCompleted={rule.isCompleted}
                      streakCurrent={streakData.get(rule.assignmentId)?.current ?? 0}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify the rules page**

1. As admin, create a Daily rule assigned to Everyone via `/admin/rules/types`
2. Navigate to `/rules` as a regular user
3. Verify the rule appears with unchecked checkbox
4. Check it off — verify it shows as completed
5. Uncheck it — verify it reverts

- [ ] **Step 4: Commit**

```bash
git add app/rules/page.tsx components/RuleCheckbox.tsx
git commit -m "feat: add user-facing rules page with check-off and streak display"
```

---

### Task 9: Sidebar integration — Rules nav link with badge

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Add Rules data fetch and nav link to the dashboard sidebar**

In `app/dashboard/page.tsx`, add the import at the top of the file:

```typescript
import { getRuleProgress } from '@/lib/rules'
```

Add `getRuleProgress(targetUserId, timezone)` to the existing `Promise.all` data fetch block. Since `timezone` is fetched in that same `Promise.all`, you'll need to restructure slightly — fetch timezone first, then fetch rule progress. The simplest approach: add a second fetch after the main `Promise.all`:

After the main `Promise.all` block and after `timezone` is available, add:

```typescript
const ruleProgress = await getRuleProgress(targetUserId, timezone)
```

Then in the `SidebarContent` JSX, inside the `{isViewingSelf && (...)}` block, after the Inventory link and before the closing `</div>`, add:

```typescript
                    {ruleProgress.total > 0 && (
                      <Link href="/rules" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white hover:bg-white/5 transition-colors">
                        <span className="text-lg">📋</span>
                        <span className="font-medium">Rules</span>
                        <span className="ml-auto text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full">
                          {ruleProgress.completed}/{ruleProgress.total}
                        </span>
                      </Link>
                    )}
```

- [ ] **Step 2: Verify the sidebar**

1. Navigate to `/dashboard`
2. Verify the "Rules" link appears in the sidebar with badge counter
3. Verify it links to `/rules`
4. If no rules are assigned, verify the link doesn't appear

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: add Rules nav link with progress badge to dashboard sidebar"
```

---

### Task 10: End-to-end verification and cleanup

**Files:**
- None new — verification only

- [ ] **Step 1: Full admin flow test**

1. Navigate to `/admin/rules/types`
2. Verify Daily and Weekly are pre-seeded
3. Create a custom "Traveling" type with INTERVAL mode (every 3 days)
4. Drill into "Daily" → Create a rule "Morning meditation" assigned to Everyone
5. Create a rule "Exercise" assigned to a specific group
6. Click "Details" on "Morning meditation" → Verify stats show assigned users
7. Edit the rule → Toggle inactive → Save → Verify it shows as inactive in list
8. Edit the rule → Toggle active again → Save

- [ ] **Step 2: Full user flow test**

1. Navigate to `/rules` as a non-admin user
2. Verify rules appear grouped by type
3. Check off "Morning meditation" → Verify green state and completion persists on refresh
4. Uncheck it → Verify it reverts
5. Check off all daily rules → Verify progress bar fills to green
6. Navigate to `/dashboard` → Verify sidebar badge updates

- [ ] **Step 3: Edge case verification**

1. Test with a user who has no rule assignments → Verify `/rules` shows empty state and sidebar hides the Rules link
2. Test the admin sidebar → Verify "Rules" link appears and highlights correctly on rule pages
3. Verify streak display after multiple check-offs across refreshes

- [ ] **Step 4: Commit any cleanup**

If any issues found during testing, fix and commit:

```bash
git add -A
git commit -m "fix: address issues found during rules feature verification"
```
