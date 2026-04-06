# User Inventory & Streak Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user inventory system with streak freezes as the first item type, allowing users to recover broken streaks within a 2-day grace window.

**Architecture:** Two new Prisma models (`UserInventory` for generic item storage, `StreakFreezeUsage` for recording frozen dates). Streak freeze earning is wired into the journal submission flow. The streak calculation engine (`lib/streaks.ts`) is updated to treat frozen dates as bridging gaps. A recovery banner on the dashboard prompts users to apply freezes. A new `/inventory` page shows freeze count, earning progress, and usage history. API endpoints mirror the web functionality for iOS.

**Tech Stack:** Prisma 6 + SQLite, Next.js 16 App Router (server actions, server components), React 19, TailwindCSS 4, TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-06-user-inventory-streak-freeze-design.md`

---

### Task 1: Database Schema — Add UserInventory and StreakFreezeUsage Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add UserInventory model to schema**

Add after the `DeviceSession` model at the end of `prisma/schema.prisma`:

```prisma
model UserInventory {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  itemType  String
  quantity  Int      @default(0)
  metadata  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, itemType])
  @@index([userId])
}

model StreakFreezeUsage {
  id         String   @id @default(uuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  frozenDate String
  appliedAt  DateTime @default(now())
  createdAt  DateTime @default(now())

  @@unique([userId, frozenDate])
  @@index([userId])
}
```

- [ ] **Step 2: Add relations to User model**

In the `User` model in `prisma/schema.prisma`, add these two relations after the `deviceSessions` field:

```prisma
  inventory         UserInventory[]
  streakFreezeUsage StreakFreezeUsage[]
```

- [ ] **Step 3: Create and apply the migration**

Run:
```bash
npx prisma migrate dev --name add-user-inventory-and-streak-freeze
```

Expected: Migration created and applied. `prisma generate` runs automatically.

- [ ] **Step 4: Verify schema**

Run:
```bash
npx prisma db push --dry-run
```

Expected: "All data is in sync" or similar confirmation.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add UserInventory and StreakFreezeUsage schema models"
```

---

### Task 2: Inventory Constants and Server Actions

**Files:**
- Create: `lib/inventory.ts`
- Create: `app/actions/inventory.ts`

- [ ] **Step 1: Create inventory constants and helpers**

Create `lib/inventory.ts`:

```typescript
export const STREAK_FREEZE = {
  itemType: 'STREAK_FREEZE',
  maxQuantity: 3,
  earningInterval: 14,
  graceWindowDays: 2,
} as const

export type StreakFreezeMetadata = {
  earningCounter: number
}

export function parseStreakFreezeMetadata(metadata: string | null): StreakFreezeMetadata {
  if (!metadata) return { earningCounter: 0 }
  try {
    const parsed = JSON.parse(metadata)
    return { earningCounter: parsed.earningCounter ?? 0 }
  } catch {
    return { earningCounter: 0 }
  }
}
```

- [ ] **Step 2: Create inventory server actions**

Create `app/actions/inventory.ts`:

```typescript
'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { resolveUserId } from '@/lib/auth-helpers'
import { STREAK_FREEZE, parseStreakFreezeMetadata } from '@/lib/inventory'
import { revalidatePath } from 'next/cache'

export async function useStreakFreeze(missedDays: string[]) {
  const session = await auth()
  if (!session?.user?.email) throw new Error('Unauthorized')

  const userId = await resolveUserId(session)
  if (!userId) throw new Error('User not found')

  // Get current inventory
  const inventory = await prisma.userInventory.findUnique({
    where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
  })

  if (!inventory || inventory.quantity < missedDays.length) {
    return { error: 'Not enough streak freezes' }
  }

  // Apply freezes in a transaction
  await prisma.$transaction([
    // Deduct quantity
    prisma.userInventory.update({
      where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
      data: {
        quantity: { decrement: missedDays.length },
        metadata: JSON.stringify({ earningCounter: 0 }),
      },
    }),
    // Record each frozen day
    ...missedDays.map((frozenDate) =>
      prisma.streakFreezeUsage.create({
        data: { userId, frozenDate },
      })
    ),
  ])

  revalidatePath('/dashboard')
  return { success: true, freezesUsed: missedDays.length }
}

export async function getInventory(userId: string) {
  const inventory = await prisma.userInventory.findUnique({
    where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
  })

  const metadata = parseStreakFreezeMetadata(inventory?.metadata ?? null)

  return {
    freezeCount: inventory?.quantity ?? 0,
    earningCounter: metadata.earningCounter,
    earningInterval: STREAK_FREEZE.earningInterval,
    maxQuantity: STREAK_FREEZE.maxQuantity,
  }
}

export async function getFrozenDates(userId: string): Promise<string[]> {
  const usages = await prisma.streakFreezeUsage.findMany({
    where: { userId },
    select: { frozenDate: true },
  })
  return usages.map((u) => u.frozenDate)
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/inventory.ts app/actions/inventory.ts
git commit -m "feat: add inventory constants and server actions for streak freezes"
```

---

### Task 3: Update Streak Calculation to Support Frozen Dates

**Files:**
- Modify: `lib/streaks.ts`

- [ ] **Step 1: Update calculateStreaks to accept frozen dates**

Replace the entire contents of `lib/streaks.ts` with:

```typescript
export function calculateStreaks(
  sortedDays: string[],
  todayStr: string,
  frozenDates: Set<string> = new Set()
) {
  // Merge journal days and frozen dates into a single sorted set of "covered" dates
  const allCoveredDays = new Set([...sortedDays, ...frozenDates])
  const allSorted = Array.from(allCoveredDays).sort().reverse()

  if (allSorted.length === 0) return { current: 0, max: 0 }

  // Max streak
  let maxStreak = 0
  let tempStreak = 0

  for (let i = 0; i < allSorted.length; i++) {
    if (i === 0) {
      tempStreak = 1
    } else {
      const current = new Date(allSorted[i - 1])
      const prev = new Date(allSorted[i])
      const diffDays = Math.round(
        Math.abs(current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (diffDays === 1) {
        tempStreak++
      } else {
        if (tempStreak > maxStreak) maxStreak = tempStreak
        tempStreak = 1
      }
    }
  }
  if (tempStreak > maxStreak) maxStreak = tempStreak

  // Current streak
  let cStreak = 0
  const t = new Date(todayStr)
  t.setUTCDate(t.getUTCDate() - 1)
  const yesterdayStr = t.toISOString().split('T')[0]

  if (allSorted.includes(todayStr) || allSorted.includes(yesterdayStr)) {
    cStreak = 1
    for (let i = 0; i < allSorted.length - 1; i++) {
      const d1 = new Date(allSorted[i])
      const d2 = new Date(allSorted[i + 1])
      const diff = Math.round((d1.getTime() - d2.getTime()) / (1000 * 3600 * 24))
      if (diff === 1) cStreak++
      else break
    }
  }

  return { current: cStreak, max: maxStreak }
}
```

The key change: `frozenDates` is an optional third parameter (defaults to empty set). Frozen dates are merged with journal days so gaps bridged by freezes don't break the streak. All existing callers pass no third arg, so they work unchanged.

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors related to `calculateStreaks`.

- [ ] **Step 3: Commit**

```bash
git add lib/streaks.ts
git commit -m "feat: update calculateStreaks to bridge gaps with frozen dates"
```

---

### Task 4: Wire Earning Logic into Journal Submission

**Files:**
- Modify: `app/actions/journal.ts`

- [ ] **Step 1: Add earning counter increment to submitEntry**

In `app/actions/journal.ts`, add this import at the top with the other imports:

```typescript
import { STREAK_FREEZE, parseStreakFreezeMetadata } from '@/lib/inventory'
```

Then, inside the `submitEntry` function, **after** the successful `prisma.$transaction(...)` call and **before** `revalidatePath('/dashboard')`, add the earning counter logic:

```typescript
        // Streak freeze earning: increment counter if this is the user's first entry today
        try {
            const timezone = await getUserTimezoneById(userId)
            const todayStr = getTodayForUser(timezone)
            const startOfDay = startOfDayInTimezone(todayStr, timezone)
            const endOfDay = endOfDayInTimezone(todayStr, timezone)

            const todayEntryCount = await prisma.journalEntry.count({
                where: {
                    userId,
                    createdAt: { gte: startOfDay, lte: endOfDay },
                },
            })

            // Only increment on first entry of the day (the ones we just created count,
            // so if count equals the number we just inserted, this is the first batch)
            if (todayEntryCount <= validEntries.length) {
                const inventory = await prisma.userInventory.upsert({
                    where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
                    create: {
                        userId,
                        itemType: STREAK_FREEZE.itemType,
                        quantity: 0,
                        metadata: JSON.stringify({ earningCounter: 1 }),
                    },
                    update: {},
                    select: { quantity: true, metadata: true },
                })

                // If row already existed, increment the counter
                if (todayEntryCount > 0 || inventory.quantity > 0 || inventory.metadata) {
                    const meta = parseStreakFreezeMetadata(inventory.metadata)
                    const newCounter = meta.earningCounter + 1

                    if (newCounter >= STREAK_FREEZE.earningInterval) {
                        // Award a freeze (up to cap)
                        const newQuantity = Math.min(inventory.quantity + 1, STREAK_FREEZE.maxQuantity)
                        await prisma.userInventory.update({
                            where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
                            data: {
                                quantity: newQuantity,
                                metadata: JSON.stringify({ earningCounter: 0 }),
                            },
                        })
                    } else {
                        await prisma.userInventory.update({
                            where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
                            data: {
                                metadata: JSON.stringify({ earningCounter: newCounter }),
                            },
                        })
                    }
                }
            }
        } catch (earningError) {
            // Non-critical — don't fail the journal entry save
            console.error('Streak freeze earning error:', earningError)
        }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/actions/journal.ts
git commit -m "feat: increment streak freeze earning counter on daily journal submission"
```

---

### Task 5: Streak Recovery Detection and Banner

**Files:**
- Create: `lib/streakRecovery.ts`
- Create: `components/StreakFreezeBanner.tsx`
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Create streak recovery detection helper**

Create `lib/streakRecovery.ts`:

```typescript
import { STREAK_FREEZE } from '@/lib/inventory'

export type RecoveryStatus = {
  needsRecovery: boolean
  missedDays: string[]
  freezesAvailable: number
  freezesCost: number
  streakAtRisk: number
}

/**
 * Determines if a user has a recoverable broken streak.
 *
 * @param sortedJournalDays - Descending sorted YYYY-MM-DD strings of days the user journaled
 * @param todayStr - Today's date as YYYY-MM-DD in the user's timezone
 * @param freezesAvailable - Number of streak freezes the user has
 * @param frozenDates - Set of already-frozen dates
 */
export function detectRecoverableStreak(
  sortedJournalDays: string[],
  todayStr: string,
  freezesAvailable: number,
  frozenDates: Set<string>
): RecoveryStatus {
  const noRecovery: RecoveryStatus = {
    needsRecovery: false,
    missedDays: [],
    freezesAvailable,
    freezesCost: 0,
    streakAtRisk: 0,
  }

  if (sortedJournalDays.length === 0 || freezesAvailable === 0) return noRecovery

  // Find the most recent journal day
  const allCovered = new Set([...sortedJournalDays, ...frozenDates])
  const allSorted = Array.from(allCovered).sort().reverse()
  const lastActiveDay = allSorted[0]

  // Calculate the gap between today and the last active day
  const today = new Date(todayStr + 'T12:00:00Z')
  const lastActive = new Date(lastActiveDay + 'T12:00:00Z')
  const gapDays = Math.round((today.getTime() - lastActive.getTime()) / (1000 * 3600 * 24))

  // No gap or already journaled today
  if (gapDays <= 0) return noRecovery

  // If today is a journal day, check for interior gaps
  const todayIsJournalDay = sortedJournalDays.includes(todayStr) || frozenDates.has(todayStr)

  // Collect missed days (the gap between last active day and today)
  const missedDays: string[] = []
  for (let i = 1; i < gapDays; i++) {
    const d = new Date(lastActive.getTime() + i * 24 * 3600 * 1000)
    const dStr = d.toISOString().split('T')[0]
    if (!allCovered.has(dStr)) {
      missedDays.push(dStr)
    }
  }

  // Also include today if it's not covered and the gap is within grace window
  if (!todayIsJournalDay && gapDays <= STREAK_FREEZE.graceWindowDays + 1) {
    // Today doesn't count as missed — the user is here now.
    // Only the days between last active and today are missed.
  }

  if (missedDays.length === 0) return noRecovery
  if (missedDays.length > STREAK_FREEZE.graceWindowDays) return noRecovery
  if (missedDays.length > freezesAvailable) {
    return { ...noRecovery, needsRecovery: true, missedDays, freezesCost: missedDays.length }
  }

  // Calculate the streak that would be preserved
  // Walk backwards from lastActiveDay counting consecutive covered days
  let streakAtRisk = 1
  for (let i = 0; i < allSorted.length - 1; i++) {
    const d1 = new Date(allSorted[i] + 'T12:00:00Z')
    const d2 = new Date(allSorted[i + 1] + 'T12:00:00Z')
    const diff = Math.round((d1.getTime() - d2.getTime()) / (1000 * 3600 * 24))
    if (diff === 1) streakAtRisk++
    else break
  }

  return {
    needsRecovery: true,
    missedDays,
    freezesAvailable,
    freezesCost: missedDays.length,
    streakAtRisk,
  }
}
```

- [ ] **Step 2: Create the StreakFreezeBanner component**

Create `components/StreakFreezeBanner.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useStreakFreeze } from '@/app/actions/inventory'

type Props = {
  missedDays: string[]
  freezesCost: number
  freezesAvailable: number
  streakAtRisk: number
}

export function StreakFreezeBanner({ missedDays, freezesCost, freezesAvailable, streakAtRisk }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (dismissed) return null

  const canAfford = freezesAvailable >= freezesCost
  const dayLabel = missedDays.length === 1 ? 'yesterday' : `the last ${missedDays.length} days`

  const handleUseFreeze = () => {
    startTransition(async () => {
      const result = await useStreakFreeze(missedDays)
      if (result.success) {
        router.refresh()
      }
    })
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-3 mb-4 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base flex-shrink-0" aria-hidden="true">🧊</span>
        <span className="text-[13px] text-white truncate">
          You missed {dayLabel}. Use{' '}
          <strong>{freezesCost} streak {freezesCost === 1 ? 'freeze' : 'freezes'}</strong> to keep
          your <strong>{streakAtRisk}-day streak</strong>?
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {canAfford && (
          <button
            onClick={handleUseFreeze}
            disabled={isPending}
            className="text-[12px] text-sky-400 hover:text-white transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {isPending ? 'Applying...' : `Use ${freezesCost === 1 ? 'freeze' : 'freezes'}`}
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss streak freeze notification"
          className="text-gray-400 hover:text-white transition-colors p-0.5"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire banner into dashboard page**

In `app/dashboard/page.tsx`:

**Add imports** at the top:

```typescript
import { StreakFreezeBanner } from '@/components/StreakFreezeBanner'
import { getInventory, getFrozenDates } from '@/app/actions/inventory'
import { detectRecoverableStreak } from '@/lib/streakRecovery'
```

**Add data fetching.** In the `Promise.all` block (line 56-98), add two more items to the array:

```typescript
        getInventory(targetUserId),
        getFrozenDates(targetUserId),
```

And add the corresponding destructured variables:

```typescript
    const [
        historyDates,
        userStats,
        profileIds,
        allUsers,
        timezone,
        userWithOrg,
        targetUserOrg,
        currentUser,
        taskAssignments,
        inventoryData,
        frozenDates,
    ] = await Promise.all([
```

**Add recovery detection** after the `Promise.all` block, near the `incompleteTasks` computation:

```typescript
    const recoveryStatus = isViewingSelf
        ? detectRecoverableStreak(
            Object.keys(userStats.heatmap).sort().reverse(),
            getTodayForUser(timezone),
            inventoryData.freezeCount,
            new Set(frozenDates)
          )
        : null
```

**Add the banner** in the JSX, right before the `<TaskBanner>` component (around line 280):

```tsx
                    {recoveryStatus?.needsRecovery && (
                        <StreakFreezeBanner
                            missedDays={recoveryStatus.missedDays}
                            freezesCost={recoveryStatus.freezesCost}
                            freezesAvailable={recoveryStatus.freezesAvailable}
                            streakAtRisk={recoveryStatus.streakAtRisk}
                        />
                    )}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add lib/streakRecovery.ts components/StreakFreezeBanner.tsx app/dashboard/page.tsx
git commit -m "feat: add streak recovery detection and freeze banner on dashboard"
```

---

### Task 6: Update Analytics to Use Frozen Dates in Streak Calculation

**Files:**
- Modify: `app/lib/analytics.ts`

- [ ] **Step 1: Update getUserStats to factor in frozen dates**

In `app/lib/analytics.ts`, add import at the top:

```typescript
import { getFrozenDates } from '@/app/actions/inventory'
```

Then, after the `sortedDays` computation (around line 115), fetch frozen dates and pass them to `calculateStreaks`:

Replace:
```typescript
    const { current, max } = calculateStreaks(sortedDays, todayStr);
```

With:
```typescript
    const frozenDates = await getFrozenDates(userId)
    const frozenSet = new Set(frozenDates)
    const { current, max } = calculateStreaks(sortedDays, todayStr, frozenSet);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/analytics.ts
git commit -m "feat: include frozen dates in analytics streak calculation"
```

---

### Task 7: Calendar Ice Block Icon for Frozen Days

**Files:**
- Modify: `components/CalendarSidebar.tsx`

- [ ] **Step 1: Add frozenDates prop and ice block rendering**

In `components/CalendarSidebar.tsx`, update the `Props` type:

```typescript
type Props = {
    completedDates: { date: string, hasLike: boolean }[]
    frozenDates?: string[]
}
```

Update the component signature:

```typescript
export function CalendarSidebar({ completedDates, frozenDates = [] }: Props) {
```

Add a `frozenSet` right after the `completedMap` initialization:

```typescript
    const frozenSet = new Set(frozenDates)
```

Update the `getStreakLength` function to also count frozen dates as streak-continuing:

```typescript
    const getStreakLength = (dateStr: string) => {
        if (!completedMap.has(dateStr) && !frozenSet.has(dateStr)) return 0;
        let streak = 1;
        const current = new Date(dateStr);
        while (true) {
            current.setDate(current.getDate() - 1);
            const prevStr = current.toISOString().split('T')[0];
            if (completedMap.has(prevStr) || frozenSet.has(prevStr)) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }
```

In the `renderDays` function, inside the day loop, add frozen day detection after the `isToday` line:

```typescript
            const isFrozen = frozenSet.has(dateStr)
```

Update the cell content rendering. After the existing fire icon `{showFlame && ...}` block, add the ice block icon:

```tsx
                    {isFrozen && (
                        <span className="absolute -top-3 -right-2 text-[10px] filter drop-shadow">🧊</span>
                    )}
```

Also update the styling for frozen days. In the className logic for the Link, add a frozen style. Replace the existing `isCompleted` ternary:

```typescript
                        ${isCompleted
                            ? (isLiked ? 'bg-rose-600 ' : 'bg-primary/80 ') + roundedClass
                            : isFrozen
                              ? 'bg-sky-500/30 rounded-full text-sky-200'
                              : 'hover:bg-white/10 rounded-full text-gray-400'
                        }
```

- [ ] **Step 2: Pass frozenDates from dashboard to CalendarSidebar**

In `app/dashboard/page.tsx`, update the `CalendarSidebar` usage (around line 228):

```tsx
                <CalendarSidebar completedDates={historyDates} frozenDates={frozenDates} />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/CalendarSidebar.tsx app/dashboard/page.tsx
git commit -m "feat: render ice block icon on calendar for frozen streak days"
```

---

### Task 8: Streak Badge Freeze Count Indicator

**Files:**
- Modify: `components/StreakBadge.tsx`

- [ ] **Step 1: Add freeze count display next to streak**

Replace the entire contents of `components/StreakBadge.tsx`:

```tsx
import React from 'react'

type Props = {
    streak: number
    freezeCount?: number
}

export function StreakBadge({ streak, freezeCount }: Props) {
    return (
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30 rounded-full">
                <span className="text-lg">🔥</span>
                <div className="flex flex-col">
                    <span className="text-lg font-bold text-orange-400 leading-none">{streak}</span>
                    <span className="text-xs uppercase tracking-wider text-orange-300/70 font-medium">Day Streak</span>
                </div>
            </div>
            {freezeCount !== undefined && freezeCount > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-sky-500/10 border border-sky-500/20 rounded-full" title={`${freezeCount} streak ${freezeCount === 1 ? 'freeze' : 'freezes'} available`}>
                    <span className="text-sm">🧊</span>
                    <span className="text-xs font-bold text-sky-300">{freezeCount}</span>
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 2: Pass freezeCount from dashboard**

In `app/dashboard/page.tsx`, update both `StreakBadge` usages.

The desktop one (around line 269):
```tsx
                    <StreakBadge streak={userStats.streak} freezeCount={isViewingSelf ? inventoryData.freezeCount : undefined} />
```

The `DashboardShell` receives streak for the mobile header. We need to also pass `freezeCount`. Update `DashboardShell` props and usage.

In `app/dashboard/page.tsx`, update the `DashboardShell` tag (around line 262):
```tsx
        <DashboardShell sidebar={SidebarContent} streak={userStats.streak} freezeCount={isViewingSelf ? inventoryData.freezeCount : undefined}>
```

- [ ] **Step 3: Update DashboardShell to pass freezeCount**

In `components/DashboardShell.tsx`, update the `Props` type:

```typescript
type Props = {
    sidebar: React.ReactNode
    children: React.ReactNode
    streak: number
    freezeCount?: number
}
```

Update the component destructuring:
```typescript
export function DashboardShell({ sidebar, children, streak, freezeCount }: Props) {
```

Find where `StreakBadge` is rendered in the mobile header and update it:
```tsx
                        <StreakBadge streak={streak} freezeCount={freezeCount} />
```

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add components/StreakBadge.tsx components/DashboardShell.tsx app/dashboard/page.tsx
git commit -m "feat: show freeze count indicator next to streak badge"
```

---

### Task 9: Inventory Page and Sidebar Navigation

**Files:**
- Create: `app/inventory/page.tsx`
- Modify: `app/dashboard/page.tsx` (sidebar nav)

- [ ] **Step 1: Create the inventory page**

Create `app/inventory/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { resolveUserId } from '@/lib/auth-helpers'
import { getInventory, getFrozenDates } from '@/app/actions/inventory'
import { getActiveOrganization } from '@/app/lib/data'
import { STREAK_FREEZE } from '@/lib/inventory'
import Link from 'next/link'
import { SidebarHeader } from '@/components/SidebarHeader'

export const metadata: Metadata = {
    title: 'Inventory | myJournal',
}

export default async function InventoryPage() {
    const session = await auth()
    if (!session?.user) redirect('/login')

    const userId = await resolveUserId(session)
    if (!userId) redirect('/login')

    const [inventory, frozenDates, org] = await Promise.all([
        getInventory(userId),
        getFrozenDates(userId),
        getActiveOrganization(),
    ])

    const progressPercent = Math.round((inventory.earningCounter / inventory.earningInterval) * 100)
    const daysUntilNext = inventory.earningInterval - inventory.earningCounter

    // Sort frozen dates descending for usage history
    const sortedFrozenDates = [...frozenDates].sort().reverse()

    return (
        <div className="flex min-h-screen bg-black text-white">
            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-20 border-b border-white/10 bg-black/90 backdrop-blur-md px-4 py-3 flex items-center gap-3">
                <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </Link>
                <span className="text-lg font-semibold text-white">Inventory</span>
            </div>

            {/* Sidebar */}
            <div className="w-64 border-r border-white/10 hidden md:flex flex-col bg-black/50">
                <div className="p-6 border-b border-white/10">
                    <SidebarHeader logoUrl={org?.logoUrl} siteName={org?.siteName} />
                </div>
                <div className="p-4 flex-1">
                    <Link href="/dashboard" className="block p-3 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors mb-2">
                        ← Back to Journal
                    </Link>
                </div>
            </div>

            {/* Main Content */}
            <main id="main-content" className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-16 md:pt-8">
                <div className="max-w-2xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-4xl font-bold text-white mb-2">Inventory</h1>
                        <p className="text-gray-400">Items you&apos;ve earned through consistent journaling.</p>
                    </div>

                    {/* Streak Freezes Card */}
                    <div className="glass-card p-6 rounded-xl border border-white/10 mb-8">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="text-3xl">🧊</span>
                            <div>
                                <h2 className="text-xl font-bold text-white">Streak Freezes</h2>
                                <p className="text-sm text-gray-400">Protect your streak when life gets in the way</p>
                            </div>
                        </div>

                        {/* Count */}
                        <div className="flex items-baseline gap-2 mb-6">
                            <span className="text-5xl font-bold text-sky-400">{inventory.freezeCount}</span>
                            <span className="text-lg text-gray-400">/ {inventory.maxQuantity}</span>
                        </div>

                        {/* Earning Progress */}
                        <div className="mb-2">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-400">Next freeze</span>
                                <span className="text-sky-300">{inventory.earningCounter} / {inventory.earningInterval} days</span>
                            </div>
                            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-full transition-all duration-500"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                            {inventory.freezeCount < inventory.maxQuantity ? (
                                <p className="text-xs text-gray-500 mt-1">
                                    {daysUntilNext} {daysUntilNext === 1 ? 'day' : 'days'} of journaling until your next freeze
                                </p>
                            ) : (
                                <p className="text-xs text-sky-400/60 mt-1">
                                    At maximum capacity
                                </p>
                            )}
                        </div>
                    </div>

                    {/* How It Works */}
                    <div className="glass-card p-6 rounded-xl border border-white/10 mb-8">
                        <h3 className="text-lg font-bold text-white mb-4">How It Works</h3>
                        <div className="space-y-3 text-sm text-gray-400">
                            <div className="flex gap-3">
                                <span className="text-sky-400 font-bold">1.</span>
                                <span>Journal for <strong className="text-white">14 consecutive days</strong> to earn a streak freeze</span>
                            </div>
                            <div className="flex gap-3">
                                <span className="text-sky-400 font-bold">2.</span>
                                <span>You can hold up to <strong className="text-white">{STREAK_FREEZE.maxQuantity} freezes</strong> at a time</span>
                            </div>
                            <div className="flex gap-3">
                                <span className="text-sky-400 font-bold">3.</span>
                                <span>If you miss a day, you&apos;ll see a prompt to use a freeze and keep your streak</span>
                            </div>
                            <div className="flex gap-3">
                                <span className="text-sky-400 font-bold">4.</span>
                                <span>You have <strong className="text-white">{STREAK_FREEZE.graceWindowDays} days</strong> to decide before the streak is lost</span>
                            </div>
                        </div>
                    </div>

                    {/* Usage History */}
                    {sortedFrozenDates.length > 0 && (
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <h3 className="text-lg font-bold text-white mb-4">Usage History</h3>
                            <div className="space-y-2">
                                {sortedFrozenDates.map((date) => (
                                    <div key={date} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                                        <span className="text-sm">🧊</span>
                                        <span className="text-sm text-gray-300">
                                            {new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
                                                weekday: 'short',
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })}
                                        </span>
                                        <span className="text-xs text-gray-500">Streak preserved</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
```

- [ ] **Step 2: Add Inventory link to sidebar navigation**

In `app/dashboard/page.tsx`, in the `isViewingSelf` nav block (around line 213-224), add the inventory link after "My Stats":

```tsx
                        <Link href="/inventory" className="flex items-center gap-3 px-3 py-2 rounded-lg text-white hover:bg-white/5 transition-colors">
                            <span className="text-lg">🧊</span>
                            <span className="font-medium">Inventory</span>
                        </Link>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/inventory/page.tsx app/dashboard/page.tsx
git commit -m "feat: add inventory page with streak freeze details and sidebar nav link"
```

---

### Task 10: Stats Page — Earning Progress Indicator

**Files:**
- Modify: `app/stats/page.tsx`

- [ ] **Step 1: Add freeze earning progress to stats page**

In `app/stats/page.tsx`, add imports:

```typescript
import { getInventory } from '@/app/actions/inventory'
```

In the `Promise.all` block (around line 41-50), add `getInventory`:

```typescript
    const [stats, org, targetUserInfo, allUsers, inventoryData] = await Promise.all([
        getUserStats(targetUserId || ""),
        getActiveOrganization(),
        !isViewingSelf
            ? prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true, name: true } })
            : Promise.resolve(null),
        isAdmin
            ? prisma.user.findMany({ select: { id: true, email: true, name: true }, orderBy: { email: 'asc' } })
            : Promise.resolve([] as any[]),
        isViewingSelf ? getInventory(targetUserId) : Promise.resolve(null),
    ]);
```

In the Achievements section (around line 160-163), add a freeze progress indicator after `<BadgeGrid>`:

```tsx
                    <div className="mb-12">
                        <h2 className="text-xl font-bold text-white mb-4">Achievements</h2>
                        <BadgeGrid badges={stats.badges} />
                        {isViewingSelf && inventoryData && (
                            <div className="mt-4 glass-card p-4 rounded-xl border border-white/10 flex items-center gap-3">
                                <span className="text-2xl">🧊</span>
                                <div className="flex-1">
                                    {inventoryData.freezeCount < inventoryData.maxQuantity ? (
                                        <>
                                            <span className="text-sm text-white font-medium">
                                                {inventoryData.earningInterval - inventoryData.earningCounter} days from +1 Streak Freeze
                                            </span>
                                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-1">
                                                <div
                                                    className="h-full bg-sky-500 rounded-full"
                                                    style={{ width: `${Math.round((inventoryData.earningCounter / inventoryData.earningInterval) * 100)}%` }}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-sm text-sky-400">
                                            Streak Freezes at max ({inventoryData.maxQuantity}/{inventoryData.maxQuantity})
                                        </span>
                                    )}
                                </div>
                                <Link href="/inventory" className="text-xs text-sky-400 hover:text-white transition-colors">
                                    View
                                </Link>
                            </div>
                        )}
                    </div>
```

Add `Link` import if not already present (it should already be imported).

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/stats/page.tsx
git commit -m "feat: show streak freeze earning progress on stats page"
```

---

### Task 11: API Endpoints for iOS

**Files:**
- Create: `app/api/v1/inventory/route.ts`
- Create: `app/api/v1/inventory/streak-freeze/use/route.ts`
- Create: `app/api/v1/streak-freeze/status/route.ts`
- Modify: `app/api/v1/stats/route.ts`

- [ ] **Step 1: Create GET /api/v1/inventory**

Create `app/api/v1/inventory/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { getInventory, getFrozenDates } from '@/app/actions/inventory'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload
    const [inventory, frozenDates] = await Promise.all([
      getInventory(userId),
      getFrozenDates(userId),
    ])

    return apiSuccess({
      streakFreezes: {
        count: inventory.freezeCount,
        max: inventory.maxQuantity,
        earningProgress: {
          current: inventory.earningCounter,
          target: inventory.earningInterval,
        },
      },
      frozenDates,
    })
  } catch (error) {
    console.error('Inventory error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to fetch inventory', 500)
  }
}
```

- [ ] **Step 2: Create POST /api/v1/inventory/streak-freeze/use**

Create `app/api/v1/inventory/streak-freeze/use/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { STREAK_FREEZE } from '@/lib/inventory'

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload
    const body = await request.json()
    const missedDays: string[] = body.missedDays

    if (!Array.isArray(missedDays) || missedDays.length === 0) {
      return apiError('BAD_REQUEST', 'missedDays must be a non-empty array of date strings', 400)
    }

    // Validate date format
    for (const day of missedDays) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return apiError('BAD_REQUEST', `Invalid date format: ${day}. Expected YYYY-MM-DD`, 400)
      }
    }

    const inventory = await prisma.userInventory.findUnique({
      where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
    })

    if (!inventory || inventory.quantity < missedDays.length) {
      return apiError('BAD_REQUEST', 'Not enough streak freezes', 400)
    }

    await prisma.$transaction([
      prisma.userInventory.update({
        where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
        data: {
          quantity: { decrement: missedDays.length },
          metadata: JSON.stringify({ earningCounter: 0 }),
        },
      }),
      ...missedDays.map((frozenDate) =>
        prisma.streakFreezeUsage.create({
          data: { userId, frozenDate },
        })
      ),
    ])

    return apiSuccess({ success: true, freezesUsed: missedDays.length })
  } catch (error) {
    console.error('Use streak freeze error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to apply streak freeze', 500)
  }
}
```

- [ ] **Step 3: Create GET /api/v1/streak-freeze/status**

Create `app/api/v1/streak-freeze/status/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { getUserTimezoneById, getTodayForUser } from '@/lib/timezone'
import { getInventory, getFrozenDates } from '@/app/actions/inventory'
import { detectRecoverableStreak } from '@/lib/streakRecovery'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload
    const timezone = request.headers.get('x-timezone')
      || await getUserTimezoneById(userId)

    const [entries, inventory, frozenDates] = await Promise.all([
      prisma.journalEntry.findMany({
        where: { userId },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      getInventory(userId),
      getFrozenDates(userId),
    ])

    const uniqueDays = new Set(
      entries.map((e) =>
        new Date(e.createdAt).toLocaleDateString('en-CA', { timeZone: timezone })
      )
    )
    const sortedDays = Array.from(uniqueDays).sort().reverse()
    const todayStr = getTodayForUser(timezone)

    const status = detectRecoverableStreak(
      sortedDays,
      todayStr,
      inventory.freezeCount,
      new Set(frozenDates)
    )

    return apiSuccess(status)
  } catch (error) {
    console.error('Streak freeze status error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to check streak freeze status', 500)
  }
}
```

- [ ] **Step 4: Update GET /api/v1/stats to include freeze data**

In `app/api/v1/stats/route.ts`, add imports:

```typescript
import { getInventory, getFrozenDates } from '@/app/actions/inventory'
```

In the try block, after the `userId` extraction, add parallel fetches:

```typescript
    const [inventory, frozenDates] = await Promise.all([
      getInventory(userId),
      getFrozenDates(userId),
    ])
    const frozenSet = new Set(frozenDates)
```

Update the `calculateStreaks` call (around line 66):

```typescript
    const { current, max } = calculateStreaks(sortedDays, todayStr, frozenSet)
```

Add freeze data to the response object (inside `apiSuccess`):

```typescript
      freezes: {
        count: inventory.freezeCount,
        earningProgress: inventory.earningCounter,
        earningTarget: inventory.earningInterval,
      },
```

- [ ] **Step 5: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/inventory/ app/api/v1/streak-freeze/ app/api/v1/stats/route.ts
git commit -m "feat: add inventory and streak freeze API endpoints for iOS"
```

---

### Task 12: Seed Test User with Streak and Freezes

**Files:**
- Create: `scripts/seedTestStreakUser.ts`

- [ ] **Step 1: Create seed script for test scenario**

Create `scripts/seedTestStreakUser.ts`:

```typescript
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

/**
 * Creates a test user with:
 * - 2 streak freezes in inventory
 * - A streak of ~20 consecutive journal days ending 2 days ago
 * - Yesterday missed (gap day)
 * - Today: no entry yet (user just returned)
 *
 * This allows testing the streak freeze banner and recovery flow.
 */
async function main() {
    const password = await bcrypt.hash('testfreeze123', 10)

    // Find the default org
    const org = await prisma.organization.findFirst({
        where: { code: 'default' },
    })
    if (!org) throw new Error('Default organization not found. Run prisma seed first.')

    // Find a prompt to create entries against
    const prompt = await prisma.prompt.findFirst({
        where: { organizationId: org.id, type: 'TEXT' },
    })
    if (!prompt) throw new Error('No TEXT prompt found. Run prisma seed first.')

    // Create or update the test user
    const user = await prisma.user.upsert({
        where: { email: 'freezetest@example.com' },
        update: { password, organizationId: org.id },
        create: {
            email: 'freezetest@example.com',
            name: 'Freeze Tester',
            password,
            role: 'USER',
            organizationId: org.id,
            timezone: 'America/New_York',
        },
    })

    console.log(`User: ${user.email} (${user.id})`)

    // Clean up any existing test data for this user
    await prisma.journalEntry.deleteMany({ where: { userId: user.id } })
    await prisma.userInventory.deleteMany({ where: { userId: user.id } })
    await prisma.streakFreezeUsage.deleteMany({ where: { userId: user.id } })

    // Create journal entries for 20 consecutive days ending 2 days ago
    const now = new Date()
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const today = new Date(todayStr + 'T12:00:00Z')

    // 2 days ago is the last journal day
    const lastJournalDay = new Date(today.getTime() - 2 * 24 * 3600 * 1000)

    const entries = []
    for (let i = 0; i < 20; i++) {
        const entryDate = new Date(lastJournalDay.getTime() - i * 24 * 3600 * 1000)
        // Set time to noon for the entry
        entryDate.setUTCHours(17, 0, 0, 0) // 5pm UTC = noon EST

        entries.push({
            userId: user.id,
            promptId: prompt.id,
            answer: `Test journal entry for day ${20 - i} of my streak. Feeling good about consistency.`,
            date: entryDate,
            createdAt: entryDate,
            updatedAt: entryDate,
        })
    }

    // Bulk create entries
    for (const entry of entries) {
        await prisma.journalEntry.create({ data: entry })
    }
    console.log(`Created ${entries.length} journal entries (20-day streak ending 2 days ago)`)

    // Create inventory with 2 freezes
    await prisma.userInventory.create({
        data: {
            userId: user.id,
            itemType: 'STREAK_FREEZE',
            quantity: 2,
            metadata: JSON.stringify({ earningCounter: 6 }),
        },
    })
    console.log('Created inventory: 2 streak freezes, earning counter at 6/14')

    // Assign user to a profile/group so they see prompts
    const profile = await prisma.profile.findFirst({
        where: { organizationId: org.id },
    })
    if (profile) {
        await prisma.profile.update({
            where: { id: profile.id },
            data: { users: { connect: { id: user.id } } },
        })
        console.log(`Assigned to profile: ${profile.name}`)
    }

    const group = await prisma.userGroup.findFirst({
        where: { organizationId: org.id },
    })
    if (group) {
        await prisma.userGroup.update({
            where: { id: group.id },
            data: { users: { connect: { id: user.id } } },
        })
        console.log(`Assigned to group: ${group.name}`)
    }

    console.log('\n--- Test Scenario Ready ---')
    console.log(`Login: freezetest@example.com / testfreeze123`)
    console.log(`Expected: Dashboard shows freeze banner for 1 missed day (yesterday)`)
    console.log(`Expected: Streak badge shows ~20 with freeze count of 2`)
    console.log(`Expected: Calendar shows 20 consecutive green days ending 2 days ago`)
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
```

- [ ] **Step 2: Run the seed script**

Run:
```bash
npx tsx scripts/seedTestStreakUser.ts
```

Expected: Output showing user created, 20 entries created, inventory set up.

- [ ] **Step 3: Commit**

```bash
git add scripts/seedTestStreakUser.ts
git commit -m "feat: add test seed script for streak freeze scenario"
```

---

### Task 13: TypeScript Verification and Dev Server

- [ ] **Step 1: Full TypeScript check**

Run:
```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Start dev server**

Run:
```bash
npm run dev
```

Expected: Dev server starts on localhost:3000 without errors.

- [ ] **Step 3: Verify test scenario**

Open `http://localhost:3000` in browser. Log in as `freezetest@example.com` / `testfreeze123`.

Expected:
- Dashboard shows the streak freeze banner ("You missed yesterday. Use 1 streak freeze to keep your 20-day streak?")
- Streak badge shows ~20 with "🧊 2" indicator
- Calendar shows 20 consecutive days ending 2 days ago
- Clicking "Use freeze" applies the freeze, banner disappears, streak is preserved
- Calendar shows ice block icon on yesterday
- Inventory page (`/inventory`) shows 1 freeze remaining, earning progress, usage history
- Stats page shows freeze earning progress in achievements section
