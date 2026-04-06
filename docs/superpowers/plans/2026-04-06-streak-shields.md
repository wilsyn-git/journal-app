# Streak Shields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add streak shields as a premium inventory item — harder to earn (30 days), rarer to hold (max 5), no grace window constraint — that integrates with the existing freeze recovery system.

**Architecture:** Shields reuse the existing `UserInventory` model with a new `itemType`. The earning logic in `submitEntry` is extended to track a second counter. The recovery detection in `lib/streakRecovery.ts` is updated to compute tiered costs (freezes first, shields for remainder). The banner, badge, inventory page, stats page, and API endpoints are all extended to show/use shields alongside freezes.

**Tech Stack:** Prisma 6 + SQLite, Next.js 16 App Router, React 19, TailwindCSS 4, TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-06-streak-shields-design.md`

---

### Task 1: Add Shield Constants to Inventory Config

**Files:**
- Modify: `lib/inventory.ts`

- [ ] **Step 1: Add STREAK_SHIELD constant and generalize metadata parser**

Replace the entire contents of `lib/inventory.ts` with:

```typescript
export const STREAK_FREEZE = {
  itemType: 'STREAK_FREEZE',
  maxQuantity: 3,
  earningInterval: 14,
  graceWindowDays: 2,
} as const

export const STREAK_SHIELD = {
  itemType: 'STREAK_SHIELD',
  maxQuantity: 5,
  earningInterval: 30,
} as const

export type InventoryItemMetadata = {
  earningCounter: number
}

export function parseItemMetadata(metadata: string | null): InventoryItemMetadata {
  if (!metadata) return { earningCounter: 0 }
  try {
    const parsed = JSON.parse(metadata)
    return { earningCounter: parsed.earningCounter ?? 0 }
  } catch {
    return { earningCounter: 0 }
  }
}

// Keep old name as alias for backward compatibility with journal.ts earning logic
export type StreakFreezeMetadata = InventoryItemMetadata
export const parseStreakFreezeMetadata = parseItemMetadata
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors. All existing callers of `parseStreakFreezeMetadata` still work.

- [ ] **Step 3: Commit**

```bash
git add lib/inventory.ts
git commit -m "feat: add STREAK_SHIELD constant and generalize metadata parser"
```

---

### Task 2: Add Shield Earning Logic to Journal Submission

**Files:**
- Modify: `app/actions/journal.ts`

- [ ] **Step 1: Add shield earning alongside freeze earning**

In `app/actions/journal.ts`, add `STREAK_SHIELD` to the existing import:

```typescript
import { STREAK_FREEZE, STREAK_SHIELD, parseStreakFreezeMetadata } from '@/lib/inventory'
```

Then, inside the `submitEntry` function, find the freeze earning `try` block (starts with `// Streak freeze earning:`). After the entire freeze earning logic (after the closing `}` of the freeze counter increment/award block, but still inside the outer `try`), add the identical pattern for shields:

```typescript
                // Shield earning: same pattern, independent counter
                const shieldInventory = await prisma.userInventory.upsert({
                    where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
                    create: {
                        userId,
                        itemType: STREAK_SHIELD.itemType,
                        quantity: 0,
                        metadata: JSON.stringify({ earningCounter: 1 }),
                    },
                    update: {},
                    select: { quantity: true, metadata: true },
                })

                if (todayEntryCount > 0 || shieldInventory.quantity > 0 || shieldInventory.metadata) {
                    const shieldMeta = parseStreakFreezeMetadata(shieldInventory.metadata)
                    const newShieldCounter = shieldMeta.earningCounter + 1

                    if (newShieldCounter >= STREAK_SHIELD.earningInterval) {
                        const newShieldQty = Math.min(shieldInventory.quantity + 1, STREAK_SHIELD.maxQuantity)
                        await prisma.userInventory.update({
                            where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
                            data: {
                                quantity: newShieldQty,
                                metadata: JSON.stringify({ earningCounter: 0 }),
                            },
                        })
                    } else {
                        await prisma.userInventory.update({
                            where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
                            data: {
                                metadata: JSON.stringify({ earningCounter: newShieldCounter }),
                            },
                        })
                    }
                }
```

This goes inside the existing `if (todayEntryCount <= validEntries.length)` block, after the freeze earning logic.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add app/actions/journal.ts
git commit -m "feat: add shield earning counter alongside freeze earning in journal submission"
```

---

### Task 3: Extend Inventory Data Layer for Shields

**Files:**
- Modify: `app/lib/inventoryData.ts`

- [ ] **Step 1: Add shield data to getInventory**

Replace the entire contents of `app/lib/inventoryData.ts` with:

```typescript
import { prisma } from '@/lib/prisma'
import { STREAK_FREEZE, STREAK_SHIELD, parseItemMetadata } from '@/lib/inventory'

export async function getInventory(userId: string) {
  const [freezeRow, shieldRow] = await Promise.all([
    prisma.userInventory.findUnique({
      where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
    }),
    prisma.userInventory.findUnique({
      where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
    }),
  ])

  const freezeMeta = parseItemMetadata(freezeRow?.metadata ?? null)
  const shieldMeta = parseItemMetadata(shieldRow?.metadata ?? null)

  return {
    freezeCount: freezeRow?.quantity ?? 0,
    earningCounter: freezeMeta.earningCounter,
    earningInterval: STREAK_FREEZE.earningInterval,
    maxQuantity: STREAK_FREEZE.maxQuantity,
    shieldCount: shieldRow?.quantity ?? 0,
    shieldEarningCounter: shieldMeta.earningCounter,
    shieldEarningInterval: STREAK_SHIELD.earningInterval,
    shieldMaxQuantity: STREAK_SHIELD.maxQuantity,
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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: Type errors in files that consume `getInventory` — they don't know about the new fields yet, but they won't break since we're only adding fields (not changing existing ones). Should compile clean.

- [ ] **Step 3: Commit**

```bash
git add app/lib/inventoryData.ts
git commit -m "feat: extend getInventory to return shield data alongside freeze data"
```

---

### Task 4: Update Recovery Detection for Tiered Costs

**Files:**
- Modify: `lib/streakRecovery.ts`

- [ ] **Step 1: Update RecoveryStatus type and detection logic**

Replace the entire contents of `lib/streakRecovery.ts` with:

```typescript
import { STREAK_FREEZE } from '@/lib/inventory'

export type RecoveryStatus = {
  needsRecovery: boolean
  missedDays: string[]
  freezesCost: number
  shieldsCost: number
  freezesAvailable: number
  shieldsAvailable: number
  streakAtRisk: number
}

/**
 * Determines if a user has a recoverable broken streak.
 * Uses tiered recovery: freezes first (within grace window), shields for the rest.
 */
export function detectRecoverableStreak(
  sortedJournalDays: string[],
  todayStr: string,
  freezesAvailable: number,
  shieldsAvailable: number,
  frozenDates: Set<string>
): RecoveryStatus {
  const noRecovery: RecoveryStatus = {
    needsRecovery: false,
    missedDays: [],
    freezesCost: 0,
    shieldsCost: 0,
    freezesAvailable,
    shieldsAvailable,
    streakAtRisk: 0,
  }

  if (sortedJournalDays.length === 0) return noRecovery

  // Find the most recent covered day
  const allCovered = new Set([...sortedJournalDays, ...frozenDates])
  const allSorted = Array.from(allCovered).sort().reverse()
  const lastActiveDay = allSorted[0]

  // Calculate the gap between today and the last active day
  const today = new Date(todayStr + 'T12:00:00Z')
  const lastActive = new Date(lastActiveDay + 'T12:00:00Z')
  const gapDays = Math.round((today.getTime() - lastActive.getTime()) / (1000 * 3600 * 24))

  if (gapDays <= 0) return noRecovery

  // Collect missed days
  const missedDays: string[] = []
  for (let i = 1; i < gapDays; i++) {
    const d = new Date(lastActive.getTime() + i * 24 * 3600 * 1000)
    const dStr = d.toISOString().split('T')[0]
    if (!allCovered.has(dStr)) {
      missedDays.push(dStr)
    }
  }

  if (missedDays.length === 0) return noRecovery

  // Tiered cost calculation
  const withinGrace = missedDays.length <= STREAK_FREEZE.graceWindowDays
  let freezesCost = 0
  let shieldsCost = 0

  if (withinGrace) {
    // Prefer freezes, shields cover remainder
    freezesCost = Math.min(missedDays.length, freezesAvailable)
    shieldsCost = missedDays.length - freezesCost
  } else {
    // Beyond grace window — only shields can help
    freezesCost = 0
    shieldsCost = missedDays.length
  }

  // Check if we can afford it
  if (shieldsCost > shieldsAvailable) return noRecovery

  // Calculate the streak at risk
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
    freezesCost,
    shieldsCost,
    freezesAvailable,
    shieldsAvailable,
    streakAtRisk,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: Errors in callers of `detectRecoverableStreak` (new signature) and `StreakFreezeBanner` (new `RecoveryStatus` shape). These will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add lib/streakRecovery.ts
git commit -m "feat: update recovery detection with tiered freeze/shield cost calculation"
```

---

### Task 5: Update Server Action for Mixed Recovery

**Files:**
- Modify: `app/actions/inventory.ts`

- [ ] **Step 1: Replace useStreakFreeze with useStreakRecovery**

Replace the entire contents of `app/actions/inventory.ts` with:

```typescript
'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { resolveUserId } from '@/lib/auth-helpers'
import { STREAK_FREEZE, STREAK_SHIELD } from '@/lib/inventory'
import { revalidatePath } from 'next/cache'

export async function useStreakRecovery(missedDays: string[], freezesCost: number, shieldsCost: number) {
  const session = await auth()
  if (!session?.user?.email) throw new Error('Unauthorized')

  const userId = await resolveUserId(session)
  if (!userId) throw new Error('User not found')

  // Validate costs add up
  if (freezesCost + shieldsCost !== missedDays.length) {
    return { error: 'Cost mismatch' }
  }

  // Build transaction operations
  const operations = []

  if (freezesCost > 0) {
    const freezeInv = await prisma.userInventory.findUnique({
      where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
    })
    if (!freezeInv || freezeInv.quantity < freezesCost) {
      return { error: 'Not enough streak freezes' }
    }
    operations.push(
      prisma.userInventory.update({
        where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
        data: {
          quantity: { decrement: freezesCost },
          metadata: JSON.stringify({ earningCounter: 0 }),
        },
      })
    )
  }

  if (shieldsCost > 0) {
    const shieldInv = await prisma.userInventory.findUnique({
      where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
    })
    if (!shieldInv || shieldInv.quantity < shieldsCost) {
      return { error: 'Not enough streak shields' }
    }
    operations.push(
      prisma.userInventory.update({
        where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
        data: {
          quantity: { decrement: shieldsCost },
          metadata: JSON.stringify({ earningCounter: 0 }),
        },
      })
    )
  }

  // Record each frozen day
  operations.push(
    ...missedDays.map((frozenDate) =>
      prisma.streakFreezeUsage.create({
        data: { userId, frozenDate },
      })
    )
  )

  await prisma.$transaction(operations)

  revalidatePath('/dashboard')
  return { success: true, freezesUsed: freezesCost, shieldsUsed: shieldsCost }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: Error in `StreakFreezeBanner.tsx` where it imports `useStreakFreeze` — will be fixed in next task.

- [ ] **Step 3: Commit**

```bash
git add app/actions/inventory.ts
git commit -m "feat: replace useStreakFreeze with useStreakRecovery supporting mixed costs"
```

---

### Task 6: Update Recovery Banner for Tiered Display

**Files:**
- Modify: `components/StreakFreezeBanner.tsx`

- [ ] **Step 1: Update banner to handle mixed freeze/shield costs**

Replace the entire contents of `components/StreakFreezeBanner.tsx` with:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useStreakRecovery } from '@/app/actions/inventory'

type Props = {
  missedDays: string[]
  freezesCost: number
  shieldsCost: number
  streakAtRisk: number
}

export function StreakFreezeBanner({ missedDays, freezesCost, shieldsCost, streakAtRisk }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (dismissed) return null

  const totalCost = freezesCost + shieldsCost
  const dayLabel = missedDays.length === 1 ? 'yesterday' : `the last ${missedDays.length} days`

  // Build cost label
  let costLabel: string
  if (freezesCost > 0 && shieldsCost > 0) {
    costLabel = `${freezesCost} ${freezesCost === 1 ? 'freeze' : 'freezes'} + ${shieldsCost} ${shieldsCost === 1 ? 'shield' : 'shields'}`
  } else if (shieldsCost > 0) {
    costLabel = `${shieldsCost} ${shieldsCost === 1 ? 'shield' : 'shields'}`
  } else {
    costLabel = `${freezesCost} ${freezesCost === 1 ? 'freeze' : 'freezes'}`
  }

  const handleUseRecovery = () => {
    startTransition(async () => {
      const result = await useStreakRecovery(missedDays, freezesCost, shieldsCost)
      if (result.success) {
        router.refresh()
      }
    })
  }

  // Use shield color if shields are involved, freeze color if freezes only
  const useShieldTheme = shieldsCost > 0
  const bgClass = useShieldTheme ? 'bg-amber-500/10 border-amber-500/20' : 'bg-sky-500/10 border-sky-500/20'
  const icon = useShieldTheme ? '🛡️' : '🧊'
  const buttonClass = useShieldTheme ? 'text-amber-400 hover:text-white' : 'text-sky-400 hover:text-white'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${bgClass} border rounded-lg p-3 mb-4 flex items-center justify-between gap-3`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base flex-shrink-0" aria-hidden="true">{icon}</span>
        <span className="text-[13px] text-white truncate">
          You missed {dayLabel}. Use <strong>{costLabel}</strong> to keep
          your <strong>{streakAtRisk}-day streak</strong>?
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleUseRecovery}
          disabled={isPending}
          className={`text-[12px] ${buttonClass} transition-colors whitespace-nowrap disabled:opacity-50`}
        >
          {isPending ? 'Applying...' : 'Recover'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss streak recovery notification"
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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: Errors in dashboard page where it passes old props to `StreakFreezeBanner`. Fixed in next task.

- [ ] **Step 3: Commit**

```bash
git add components/StreakFreezeBanner.tsx
git commit -m "feat: update recovery banner for tiered freeze/shield display"
```

---

### Task 7: Update Dashboard to Pass Shield Data

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Update recovery detection call and banner props**

In `app/dashboard/page.tsx`, find the `recoveryStatus` computation (around line 107). It currently calls:

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

Replace it with:

```typescript
    const recoveryStatus = isViewingSelf
        ? detectRecoverableStreak(
            Object.keys(userStats.heatmap).sort().reverse(),
            getTodayForUser(timezone),
            inventoryData.freezeCount,
            inventoryData.shieldCount,
            new Set(frozenDates)
          )
        : null
```

Then find where `StreakFreezeBanner` is rendered. It currently passes:

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

Replace it with:

```tsx
                    {recoveryStatus?.needsRecovery && (
                        <StreakFreezeBanner
                            missedDays={recoveryStatus.missedDays}
                            freezesCost={recoveryStatus.freezesCost}
                            shieldsCost={recoveryStatus.shieldsCost}
                            streakAtRisk={recoveryStatus.streakAtRisk}
                        />
                    )}
```

- [ ] **Step 2: Update StreakBadge to show shield count**

Find both `StreakBadge` usages in the file. Update the desktop one:

```tsx
                    <StreakBadge streak={userStats.streak} freezeCount={isViewingSelf ? inventoryData.freezeCount : undefined} shieldCount={isViewingSelf ? inventoryData.shieldCount : undefined} />
```

Update the `DashboardShell` tag:

```tsx
        <DashboardShell sidebar={SidebarContent} streak={userStats.streak} freezeCount={isViewingSelf ? inventoryData.freezeCount : undefined} shieldCount={isViewingSelf ? inventoryData.shieldCount : undefined}>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: Errors in `StreakBadge` and `DashboardShell` — they don't accept `shieldCount` yet. Fixed in next task.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: pass shield data through dashboard to recovery banner and badge"
```

---

### Task 8: Update StreakBadge and DashboardShell for Shields

**Files:**
- Modify: `components/StreakBadge.tsx`
- Modify: `components/DashboardShell.tsx`

- [ ] **Step 1: Add shield count to StreakBadge**

Replace the entire contents of `components/StreakBadge.tsx` with:

```tsx
import React from 'react'

type Props = {
    streak: number
    freezeCount?: number
    shieldCount?: number
}

export function StreakBadge({ streak, freezeCount, shieldCount }: Props) {
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
            {shieldCount !== undefined && shieldCount > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full" title={`${shieldCount} streak ${shieldCount === 1 ? 'shield' : 'shields'} available`}>
                    <span className="text-sm">🛡️</span>
                    <span className="text-xs font-bold text-amber-300">{shieldCount}</span>
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 2: Update DashboardShell to pass shieldCount**

In `components/DashboardShell.tsx`, update the Props type:

```typescript
type Props = {
    sidebar: React.ReactNode
    children: React.ReactNode
    streak: number
    freezeCount?: number
    shieldCount?: number
}
```

Update the destructuring:

```typescript
export function DashboardShell({ sidebar, children, streak, freezeCount, shieldCount }: Props) {
```

Find where `StreakBadge` is rendered in the mobile header and update it:

```tsx
                        <StreakBadge streak={streak} freezeCount={freezeCount} shieldCount={shieldCount} />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/StreakBadge.tsx components/DashboardShell.tsx
git commit -m "feat: show shield count indicator in streak badge"
```

---

### Task 9: Add Shield Row to Inventory Page

**Files:**
- Create: `components/StreakShieldItem.tsx`
- Modify: `app/inventory/page.tsx`

- [ ] **Step 1: Create StreakShieldItem component**

Create `components/StreakShieldItem.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { STREAK_SHIELD } from '@/lib/inventory'

type Props = {
    shieldCount: number
    maxQuantity: number
    earningCounter: number
    earningInterval: number
    usageHistory: string[]
}

export function StreakShieldItem({ shieldCount, maxQuantity, earningCounter, earningInterval, usageHistory }: Props) {
    const [showInfo, setShowInfo] = useState(false)
    const progressPercent = Math.round((earningCounter / earningInterval) * 100)

    const lastUsed = usageHistory.length > 0
        ? new Date(usageHistory[0] + 'T12:00:00Z').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
        : null

    return (
        <div className="glass-card rounded-xl border border-white/10 relative">
            {/* Main row */}
            <div className="flex items-center gap-3 p-4">
                <span className="text-2xl">🛡️</span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3">
                        <span className="font-bold text-white">Streak Shields</span>
                        {lastUsed && (
                            <span className="text-xs text-gray-500">Last used: {lastUsed}</span>
                        )}
                    </div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">{earningCounter}/{earningInterval}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-baseline gap-0.5">
                        <span className="text-2xl font-bold text-amber-400">{shieldCount}</span>
                        <span className="text-xs text-gray-500">/{maxQuantity}</span>
                    </div>

                    {/* Info button */}
                    <button
                        onClick={() => setShowInfo(!showInfo)}
                        className="text-gray-500 hover:text-white transition-colors p-1"
                        aria-label="How streak shields work"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 16v-4" />
                            <path d="M12 8h.01" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Info popover */}
            {showInfo && (
                <div className="border-t border-white/5 px-4 py-3 text-xs text-gray-400 space-y-1.5">
                    <p>Journal <strong className="text-white">{STREAK_SHIELD.earningInterval} consecutive days</strong> to earn a shield.</p>
                    <p>Hold up to <strong className="text-white">{STREAK_SHIELD.maxQuantity}</strong> at a time. Shields cover missed days with no time limit.</p>
                    <p>When freezes can&apos;t reach, shields pick up the slack.</p>
                </div>
            )}
        </div>
    )
}
```

- [ ] **Step 2: Add shield row to inventory page**

In `app/inventory/page.tsx`, add the import at the top:

```typescript
import { StreakShieldItem } from '@/components/StreakShieldItem'
```

Then add the shield item after the `StreakFreezeItem` in the JSX:

```tsx
                    <div className="mt-3">
                        <StreakShieldItem
                            shieldCount={inventory.shieldCount}
                            maxQuantity={inventory.shieldMaxQuantity}
                            earningCounter={inventory.shieldEarningCounter}
                            earningInterval={inventory.shieldEarningInterval}
                            usageHistory={[]}
                        />
                    </div>
```

Note: Shield usage history shares the same `StreakFreezeUsage` table — we don't track which item type paid for a frozen day. So we pass an empty array for now. The "Last used" field will show only if we later add a source column to `StreakFreezeUsage`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/StreakShieldItem.tsx app/inventory/page.tsx
git commit -m "feat: add streak shield row to inventory page"
```

---

### Task 10: Update Stats Page for Shield Progress

**Files:**
- Modify: `app/stats/page.tsx`

- [ ] **Step 1: Add shield earning progress alongside freeze progress**

In `app/stats/page.tsx`, find the freeze progress indicator in the Achievements section. It's a `{isViewingSelf && inventoryData && (...)}` block after `<BadgeGrid>`.

After the closing `</div>` of the freeze progress card (but still inside the `{isViewingSelf && inventoryData && (...)}` block), add:

```tsx
                            <div className="mt-2 glass-card p-4 rounded-xl border border-white/10 flex items-center gap-3">
                                <span className="text-2xl">🛡️</span>
                                <div className="flex-1">
                                    {inventoryData.shieldCount < inventoryData.shieldMaxQuantity ? (
                                        <>
                                            <span className="text-sm text-white font-medium">
                                                {inventoryData.shieldEarningInterval - inventoryData.shieldEarningCounter} days from +1 Streak Shield
                                            </span>
                                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-1">
                                                <div
                                                    className="h-full bg-amber-500 rounded-full"
                                                    style={{ width: `${Math.round((inventoryData.shieldEarningCounter / inventoryData.shieldEarningInterval) * 100)}%` }}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-sm text-amber-400">
                                            Streak Shields at max ({inventoryData.shieldMaxQuantity}/{inventoryData.shieldMaxQuantity})
                                        </span>
                                    )}
                                </div>
                                <Link href="/inventory" className="text-xs text-amber-400 hover:text-white transition-colors">
                                    View
                                </Link>
                            </div>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/stats/page.tsx
git commit -m "feat: show shield earning progress on stats page"
```

---

### Task 11: Update API Endpoints for Shields

**Files:**
- Modify: `app/api/v1/inventory/route.ts`
- Modify: `app/api/v1/inventory/streak-freeze/use/route.ts`
- Modify: `app/api/v1/streak-freeze/status/route.ts`
- Modify: `app/api/v1/stats/route.ts`

- [ ] **Step 1: Update GET /api/v1/inventory to include shields**

Replace the entire contents of `app/api/v1/inventory/route.ts` with:

```typescript
import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { getInventory, getFrozenDates } from '@/app/lib/inventoryData'

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
      streakShields: {
        count: inventory.shieldCount,
        max: inventory.shieldMaxQuantity,
        earningProgress: {
          current: inventory.shieldEarningCounter,
          target: inventory.shieldEarningInterval,
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

- [ ] **Step 2: Update POST /api/v1/inventory/streak-freeze/use for mixed recovery**

Replace the entire contents of `app/api/v1/inventory/streak-freeze/use/route.ts` with:

```typescript
import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { STREAK_FREEZE, STREAK_SHIELD } from '@/lib/inventory'

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload
    const body = await request.json()
    const missedDays: string[] = body.missedDays
    const freezesCost: number = body.freezesCost ?? missedDays?.length ?? 0
    const shieldsCost: number = body.shieldsCost ?? 0

    if (!Array.isArray(missedDays) || missedDays.length === 0) {
      return apiError('BAD_REQUEST', 'missedDays must be a non-empty array of date strings', 400)
    }

    if (freezesCost + shieldsCost !== missedDays.length) {
      return apiError('BAD_REQUEST', 'freezesCost + shieldsCost must equal missedDays.length', 400)
    }

    for (const day of missedDays) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return apiError('BAD_REQUEST', `Invalid date format: ${day}. Expected YYYY-MM-DD`, 400)
      }
    }

    const operations = []

    if (freezesCost > 0) {
      const inv = await prisma.userInventory.findUnique({
        where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
      })
      if (!inv || inv.quantity < freezesCost) {
        return apiError('BAD_REQUEST', 'Not enough streak freezes', 400)
      }
      operations.push(
        prisma.userInventory.update({
          where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
          data: { quantity: { decrement: freezesCost }, metadata: JSON.stringify({ earningCounter: 0 }) },
        })
      )
    }

    if (shieldsCost > 0) {
      const inv = await prisma.userInventory.findUnique({
        where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
      })
      if (!inv || inv.quantity < shieldsCost) {
        return apiError('BAD_REQUEST', 'Not enough streak shields', 400)
      }
      operations.push(
        prisma.userInventory.update({
          where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
          data: { quantity: { decrement: shieldsCost }, metadata: JSON.stringify({ earningCounter: 0 }) },
        })
      )
    }

    operations.push(
      ...missedDays.map((frozenDate) =>
        prisma.streakFreezeUsage.create({ data: { userId, frozenDate } })
      )
    )

    await prisma.$transaction(operations)

    return apiSuccess({ success: true, freezesUsed: freezesCost, shieldsUsed: shieldsCost })
  } catch (error) {
    console.error('Use streak recovery error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to apply streak recovery', 500)
  }
}
```

- [ ] **Step 3: Update GET /api/v1/streak-freeze/status for shields**

In `app/api/v1/streak-freeze/status/route.ts`, update the `detectRecoverableStreak` call. The current call passes 4 args. Add the shield count as the 4th arg (before frozenDates).

First add `getInventory` to handle shields. The file already imports `getInventory`. Find the call to `detectRecoverableStreak` and replace it:

From:
```typescript
    const status = detectRecoverableStreak(
      sortedDays,
      todayStr,
      inventory.freezeCount,
      new Set(frozenDates)
    )
```

To:
```typescript
    const status = detectRecoverableStreak(
      sortedDays,
      todayStr,
      inventory.freezeCount,
      inventory.shieldCount,
      new Set(frozenDates)
    )
```

- [ ] **Step 4: Update GET /api/v1/stats to include shield data**

In `app/api/v1/stats/route.ts`, find the `freezes` object in the `apiSuccess` response and replace it with:

```typescript
      freezes: {
        count: inventory.freezeCount,
        earningProgress: inventory.earningCounter,
        earningTarget: inventory.earningInterval,
      },
      shields: {
        count: inventory.shieldCount,
        earningProgress: inventory.shieldEarningCounter,
        earningTarget: inventory.shieldEarningInterval,
      },
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/inventory/ app/api/v1/streak-freeze/ app/api/v1/stats/route.ts
git commit -m "feat: update API endpoints to support shields alongside freezes"
```

---

### Task 12: Update Test Seed Script for Shields

**Files:**
- Modify: `scripts/seedTestStreakUser.ts`

- [ ] **Step 1: Add shield inventory to test user**

In `scripts/seedTestStreakUser.ts`, after the freeze inventory creation (`await prisma.userInventory.create(...)` for STREAK_FREEZE), add:

```typescript
    await prisma.userInventory.create({
        data: {
            userId: user.id,
            itemType: 'STREAK_SHIELD',
            quantity: 1,
            metadata: JSON.stringify({ earningCounter: 15 }),
        },
    })
    console.log('Created inventory: 1 streak shield, earning counter at 15/30')
```

Also update the cleanup section to delete shield inventory (already handled by `await prisma.userInventory.deleteMany({ where: { userId: user.id } })` since it deletes all items for the user).

Update the summary at the bottom:

```typescript
    console.log(`Expected: Streak badge shows ~20 with freeze count of 2 and shield count of 1`)
```

- [ ] **Step 2: Run the seed script**

Run:
```bash
npx tsx scripts/seedTestStreakUser.ts
```

Expected: Output showing shield inventory created alongside freeze inventory.

- [ ] **Step 3: Commit**

```bash
git add scripts/seedTestStreakUser.ts
git commit -m "feat: add shield data to test seed script"
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

Expected: Dev server starts on localhost:3000.

- [ ] **Step 3: Verify test scenario**

Log in as `freezetest@example.com` / `testfreeze123`.

Expected:
- Streak badge shows 🔥 ~20, 🧊 2, 🛡️ 1
- Recovery banner shows (freeze-only since within grace window)
- Inventory page shows both freeze and shield rows
- Stats page shows both earning progress indicators
- Using a freeze works, banner updates
