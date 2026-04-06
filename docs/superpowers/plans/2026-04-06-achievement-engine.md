# Achievement Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded badge system with a registry-driven achievement engine featuring tiered progression, DB persistence, inventory rewards, and toast notifications.

**Architecture:** Achievement definitions live in a code registry (`lib/achievements.ts`). A `UserAchievement` Prisma model tracks what's been earned. An evaluator function runs on dashboard load, computes metrics from existing `getUserStats` data, checks the registry, grants new tiers with rewards, and flags toast notifications. The old `BadgeGrid` and hardcoded badges arrays are removed entirely.

**Tech Stack:** Prisma 6 + SQLite, Next.js 16 App Router, React 19, TailwindCSS 4, TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-06-achievement-engine-design.md`

---

### Task 1: Database Schema — Add UserAchievement Model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add UserAchievement model**

Add after the `StreakFreezeUsage` model at the end of `prisma/schema.prisma`:

```prisma
model UserAchievement {
  id            String    @id @default(uuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  achievementId String
  tierLevel     Int
  earnedAt      DateTime  @default(now())
  notifiedAt    DateTime?
  rewardGranted String?
  createdAt     DateTime  @default(now())

  @@unique([userId, achievementId, tierLevel])
  @@index([userId])
}
```

- [ ] **Step 2: Add relation to User model**

In the `User` model, add after `streakFreezeUsage`:

```prisma
  achievements      UserAchievement[]
```

- [ ] **Step 3: Create and apply migration**

Run:
```bash
npx prisma migrate dev --name add-user-achievement
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add UserAchievement schema model"
```

---

### Task 2: Achievement Registry and Types

**Files:**
- Create: `lib/achievements.ts`

- [ ] **Step 1: Create the achievement registry**

Create `lib/achievements.ts`:

```typescript
export type AchievementReward = {
  itemType: string
  quantity: number
}

export type AchievementTier = {
  level: number
  threshold: number
  label: string
  reward: AchievementReward | null
}

export type AchievementDefinition = {
  id: string
  name: string
  icon: string
  metric: string
  tiers: AchievementTier[]
}

export const ACHIEVEMENT_REGISTRY: AchievementDefinition[] = [
  {
    id: 'streak',
    name: 'On a Roll',
    icon: '🔥',
    metric: 'maxStreak',
    tiers: [
      { level: 1, threshold: 7, label: '7-day streak', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 2, threshold: 30, label: '30-day streak', reward: { itemType: 'STREAK_SHIELD', quantity: 1 } },
      { level: 3, threshold: 100, label: '100-day streak', reward: { itemType: 'STREAK_SHIELD', quantity: 1 } },
    ],
  },
  {
    id: 'persistent',
    name: 'Persistent',
    icon: '📅',
    metric: 'totalDaysJournaled',
    tiers: [
      { level: 1, threshold: 30, label: '30 days journaled', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 2, threshold: 100, label: '100 days journaled', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 3, threshold: 365, label: '365 days journaled', reward: { itemType: 'STREAK_SHIELD', quantity: 1 } },
    ],
  },
  {
    id: 'dedicated',
    name: 'Dedicated',
    icon: '✍️',
    metric: 'totalEntries',
    tiers: [
      { level: 1, threshold: 100, label: '100 answers', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 2, threshold: 500, label: '500 answers', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 3, threshold: 1000, label: '1,000 answers', reward: { itemType: 'STREAK_SHIELD', quantity: 1 } },
    ],
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    icon: '🦉',
    metric: 'lateNightEntries',
    tiers: [
      { level: 1, threshold: 5, label: '5 late entries', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 2, threshold: 25, label: '25 late entries', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
    ],
  },
]
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add lib/achievements.ts
git commit -m "feat: add achievement registry with types and initial definitions"
```

---

### Task 3: Achievement Evaluator

**Files:**
- Create: `lib/achievementEvaluator.ts`

- [ ] **Step 1: Create the evaluator**

Create `lib/achievementEvaluator.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { ACHIEVEMENT_REGISTRY, AchievementReward } from '@/lib/achievements'

export type AchievementMetrics = {
  maxStreak: number
  totalDaysJournaled: number
  totalEntries: number
  lateNightEntries: number
}

export type NewlyEarnedAchievement = {
  achievementId: string
  name: string
  icon: string
  tierLevel: number
  label: string
  reward: AchievementReward | null
}

/**
 * Evaluates all achievements for a user. Grants new tiers and rewards.
 * Returns list of newly earned achievements (for toast notifications).
 */
export async function evaluateAchievements(
  userId: string,
  metrics: AchievementMetrics
): Promise<NewlyEarnedAchievement[]> {
  // Load existing achievements for this user
  const existing = await prisma.userAchievement.findMany({
    where: { userId },
    select: { achievementId: true, tierLevel: true },
  })

  const earnedSet = new Set(
    existing.map((a) => `${a.achievementId}:${a.tierLevel}`)
  )

  const newlyEarned: NewlyEarnedAchievement[] = []

  for (const achievement of ACHIEVEMENT_REGISTRY) {
    const metricValue = metrics[achievement.metric as keyof AchievementMetrics]
    if (metricValue === undefined) continue

    for (const tier of achievement.tiers) {
      const key = `${achievement.id}:${tier.level}`
      if (earnedSet.has(key)) continue
      if (metricValue < tier.threshold) break // Tiers are ordered — if this one fails, higher ones will too

      // Earn this tier
      const rewardSnapshot = tier.reward ? JSON.stringify(tier.reward) : null

      await prisma.userAchievement.create({
        data: {
          userId,
          achievementId: achievement.id,
          tierLevel: tier.level,
          rewardGranted: rewardSnapshot,
        },
      })

      // Grant inventory reward
      if (tier.reward) {
        await prisma.userInventory.upsert({
          where: {
            userId_itemType: { userId, itemType: tier.reward.itemType },
          },
          create: {
            userId,
            itemType: tier.reward.itemType,
            quantity: tier.reward.quantity,
            metadata: JSON.stringify({ earningCounter: 0 }),
          },
          update: {
            quantity: { increment: tier.reward.quantity },
          },
        })
      }

      newlyEarned.push({
        achievementId: achievement.id,
        name: achievement.name,
        icon: achievement.icon,
        tierLevel: tier.level,
        label: tier.label,
        reward: tier.reward,
      })
    }
  }

  return newlyEarned
}

/**
 * Returns the user's achievement state for display: current tier, next tier, metric value.
 */
export async function getAchievementState(userId: string, metrics: AchievementMetrics) {
  const existing = await prisma.userAchievement.findMany({
    where: { userId },
    select: { achievementId: true, tierLevel: true },
  })

  const earnedMap = new Map<string, number>() // achievementId -> highest tier earned
  for (const a of existing) {
    const current = earnedMap.get(a.achievementId) ?? 0
    if (a.tierLevel > current) earnedMap.set(a.achievementId, a.tierLevel)
  }

  return ACHIEVEMENT_REGISTRY.map((achievement) => {
    const metricValue = metrics[achievement.metric as keyof AchievementMetrics] ?? 0
    const highestTier = earnedMap.get(achievement.id) ?? 0
    const currentTier = achievement.tiers.find((t) => t.level === highestTier) ?? null
    const nextTier = achievement.tiers.find((t) => t.level === highestTier + 1) ?? null
    const maxTier = achievement.tiers[achievement.tiers.length - 1]
    const isMaxed = highestTier >= maxTier.level

    return {
      id: achievement.id,
      name: achievement.name,
      icon: achievement.icon,
      currentTier: highestTier,
      currentLabel: currentTier?.label ?? null,
      nextTier: nextTier
        ? { level: nextTier.level, threshold: nextTier.threshold, label: nextTier.label }
        : null,
      metricValue,
      isMaxed,
    }
  })
}

/**
 * Returns unnotified achievements and marks them as notified.
 */
export async function getAndMarkUnnotifiedAchievements(userId: string) {
  const unnotified = await prisma.userAchievement.findMany({
    where: { userId, notifiedAt: null },
    select: { id: true, achievementId: true, tierLevel: true },
  })

  if (unnotified.length > 0) {
    await prisma.userAchievement.updateMany({
      where: { id: { in: unnotified.map((a) => a.id) } },
      data: { notifiedAt: new Date() },
    })
  }

  // Enrich with registry data for display
  return unnotified.map((a) => {
    const def = ACHIEVEMENT_REGISTRY.find((d) => d.id === a.achievementId)
    const tier = def?.tiers.find((t) => t.level === a.tierLevel)
    return {
      achievementId: a.achievementId,
      name: def?.name ?? a.achievementId,
      icon: def?.icon ?? '🏆',
      tierLevel: a.tierLevel,
      label: tier?.label ?? `Tier ${a.tierLevel}`,
    }
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add lib/achievementEvaluator.ts
git commit -m "feat: add achievement evaluator with metrics, grants, and notification helpers"
```

---

### Task 4: Compute Metrics from getUserStats

**Files:**
- Modify: `app/lib/analytics.ts`

- [ ] **Step 1: Remove hardcoded badges, add metrics to return value**

In `app/lib/analytics.ts`:

**Add import** at the top:

```typescript
import { AchievementMetrics } from '@/lib/achievementEvaluator'
```

**Remove the entire badges array** (lines 127-163, from `// Badges Logic` through the closing `];`). Replace it with the achievement metrics computation:

```typescript
    // Achievement metrics
    const lateNightEntries = hourCounts[22] + hourCounts[23]

    const achievementMetrics: AchievementMetrics = {
        maxStreak: max,
        totalDaysJournaled: uniqueDays.size,
        totalEntries: entries.length,
        lateNightEntries,
    }
```

**Update the return object.** Remove `badges` and add `achievementMetrics`:

Replace:
```typescript
    return {
        streak: current, // Legacy
        currentStreak: current,
        maxStreak: max,
        totalEntries: entries.length,
        daysCompleted: uniqueDays.size,
        avgWords,
        taskStats,
        trendStats, // New Range Data
        // New Data
        heatmap,     // { "2024-01-01": 5 }
        hourCounts,  // [0, 0, 5, ...] 24 items
        wordCloud: filteredWords, // [{text: "foo", value: 10}]
        badges
    }
```

With:
```typescript
    return {
        streak: current, // Legacy
        currentStreak: current,
        maxStreak: max,
        totalEntries: entries.length,
        daysCompleted: uniqueDays.size,
        avgWords,
        taskStats,
        trendStats,
        heatmap,
        hourCounts,
        wordCloud: filteredWords,
        achievementMetrics,
    }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: Errors in `stats/page.tsx` (references `stats.badges`) and `api/v1/stats/route.ts` (references `badges`). These are fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add app/lib/analytics.ts
git commit -m "feat: replace hardcoded badges with achievement metrics in getUserStats"
```

---

### Task 5: Wire Evaluator into Dashboard

**Files:**
- Modify: `app/dashboard/page.tsx`
- Create: `components/AchievementToasts.tsx`

- [ ] **Step 1: Add achievement evaluation to dashboard data loading**

In `app/dashboard/page.tsx`, add imports at the top:

```typescript
import { evaluateAchievements, getAndMarkUnnotifiedAchievements } from '@/lib/achievementEvaluator'
import { AchievementToasts } from '@/components/AchievementToasts'
```

After the `Promise.all` block and the `recoveryStatus` computation, add:

```typescript
    // Achievement evaluation — runs on dashboard load
    let unnotifiedAchievements: { name: string; icon: string; label: string }[] = []
    if (isViewingSelf) {
        await evaluateAchievements(targetUserId, userStats.achievementMetrics)
        const unnotified = await getAndMarkUnnotifiedAchievements(targetUserId)
        unnotifiedAchievements = unnotified.map((a) => ({
            name: a.name,
            icon: a.icon,
            label: a.label,
        }))
    }
```

In the JSX, add the toast component inside the `<DashboardShell>`, right before the desktop header div:

```tsx
            <AchievementToasts achievements={unnotifiedAchievements} />
```

- [ ] **Step 2: Create AchievementToasts client component**

Create `components/AchievementToasts.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useToast } from '@/components/providers/ToastProvider'

type Props = {
    achievements: { name: string; icon: string; label: string }[]
}

export function AchievementToasts({ achievements }: Props) {
    const { addToast } = useToast()
    const shown = useRef(false)

    useEffect(() => {
        if (shown.current || achievements.length === 0) return
        shown.current = true

        achievements.forEach((a, i) => {
            setTimeout(() => {
                addToast('success', `${a.icon} Achievement unlocked: ${a.name} — ${a.label}!`)
            }, i * 800) // Stagger toasts
        })
    }, [achievements, addToast])

    return null
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: May still have errors from stats page / API route referencing `badges`. Those are fixed in later tasks.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx components/AchievementToasts.tsx
git commit -m "feat: wire achievement evaluator into dashboard with toast notifications"
```

---

### Task 6: Replace BadgeGrid on Stats Page

**Files:**
- Create: `components/stats/AchievementGrid.tsx`
- Modify: `app/stats/page.tsx`

- [ ] **Step 1: Create AchievementGrid component**

Create `components/stats/AchievementGrid.tsx`:

```tsx
'use client'

type AchievementState = {
    id: string
    name: string
    icon: string
    currentTier: number
    currentLabel: string | null
    nextTier: { level: number; threshold: number; label: string } | null
    metricValue: number
    isMaxed: boolean
}

export function AchievementGrid({ achievements }: { achievements: AchievementState[] }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {achievements.map((a) => {
                const earned = a.currentTier > 0
                const progressTarget = a.nextTier?.threshold ?? 0
                const progressPercent = a.nextTier
                    ? Math.min(100, Math.round((a.metricValue / a.nextTier.threshold) * 100))
                    : 100

                return (
                    <div
                        key={a.id}
                        className={`
                            p-4 rounded-xl border transition-all
                            ${earned
                                ? 'bg-purple-900/20 border-purple-500/30 text-white'
                                : 'bg-white/5 border-white/5 text-gray-500'
                            }
                        `}
                    >
                        <div className="flex items-start gap-3">
                            <span className={`text-3xl ${earned ? '' : 'grayscale opacity-50'}`}>{a.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm">{a.name}</div>
                                {a.isMaxed ? (
                                    <div className="text-xs text-purple-300 mt-1">
                                        {a.currentLabel} — Complete!
                                    </div>
                                ) : a.nextTier ? (
                                    <>
                                        <div className="text-xs text-gray-400 mt-1">
                                            {earned ? `${a.currentLabel} · ` : ''}
                                            Next: {a.nextTier.label}
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] text-gray-500 whitespace-nowrap">
                                                {a.metricValue}/{a.nextTier.threshold}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-xs text-gray-400 mt-1">
                                        {a.currentLabel ?? 'Locked'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
```

- [ ] **Step 2: Update stats page to use AchievementGrid**

In `app/stats/page.tsx`:

**Remove** the `BadgeGrid` import:
```typescript
import { BadgeGrid } from "@/components/stats/BadgeGrid"
```

**Add** new imports:
```typescript
import { AchievementGrid } from "@/components/stats/AchievementGrid"
import { getAchievementState } from '@/lib/achievementEvaluator'
```

**Add achievement state to the Promise.all** — update the destructuring and the array. The current block has 5 items: `stats, org, targetUserInfo, allUsers, inventoryData`. Add a 6th:

```typescript
    const [stats, org, targetUserInfo, allUsers, inventoryData, achievementState] = await Promise.all([
        getUserStats(targetUserId || ""),
        getActiveOrganization(),
        !isViewingSelf
            ? prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true, name: true } })
            : Promise.resolve(null),
        isAdmin
            ? prisma.user.findMany({ select: { id: true, email: true, name: true }, orderBy: { email: 'asc' } })
            : Promise.resolve([] as any[]),
        isViewingSelf ? getInventory(targetUserId) : Promise.resolve(null),
        getAchievementState(targetUserId, null as any), // metrics filled after stats resolve
    ]);
```

Actually, `getAchievementState` needs `metrics` which comes from `stats`. Since they're in the same `Promise.all`, we need to call it after. **Instead**, keep the `Promise.all` as-is with 5 items, and add a separate call after:

```typescript
    const achievementState = await getAchievementState(targetUserId, stats.achievementMetrics)
```

**Replace** the Achievements section in the JSX. Find the `{/* Badges */}` section (lines 161-219) which contains the `BadgeGrid` and the freeze/shield progress cards. Replace the entire block with:

```tsx
                    {/* Achievements */}
                    <div className="mb-12">
                        <h2 className="text-xl font-bold text-white mb-4">Achievements</h2>
                        <AchievementGrid achievements={achievementState} />
                        {isViewingSelf && inventoryData && (
                            <>
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
                            </>
                        )}
                    </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add components/stats/AchievementGrid.tsx app/stats/page.tsx
git commit -m "feat: replace BadgeGrid with AchievementGrid on stats page"
```

---

### Task 7: Update API Stats Route

**Files:**
- Modify: `app/api/v1/stats/route.ts`

- [ ] **Step 1: Replace badges with achievement data**

In `app/api/v1/stats/route.ts`:

**Add import** at the top:

```typescript
import { getAchievementState, AchievementMetrics } from '@/lib/achievementEvaluator'
```

**Remove the entire badges array** (lines 81-119, from `// Badges` through the closing `]`).

**Add metrics computation** after the `avgWords` calculation:

```typescript
    // Achievement metrics
    const lateNightEntries = hourCounts[22] + hourCounts[23]
    const achievementMetrics: AchievementMetrics = {
      maxStreak: current,
      totalDaysJournaled: new Set(Object.keys(heatmap)).size,
      totalEntries: entries.length,
      lateNightEntries,
    }

    const achievements = await getAchievementState(userId, achievementMetrics)
```

**Update the response.** In the `apiSuccess(...)` call, replace `badges,` with `achievements,`:

```typescript
    return apiSuccess({
      currentStreak: current,
      maxStreak: max,
      totalEntries: entries.length,
      daysCompleted: new Set(Object.keys(heatmap)).size,
      avgWords,
      heatmap,
      achievements,
      taskStats,
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
    })
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/stats/route.ts
git commit -m "feat: replace badges with achievements in stats API endpoint"
```

---

### Task 8: Delete Old BadgeGrid Component

**Files:**
- Delete: `components/stats/BadgeGrid.tsx`

- [ ] **Step 1: Delete the file**

Run:
```bash
rm components/stats/BadgeGrid.tsx
```

- [ ] **Step 2: Verify no remaining imports**

Run:
```bash
grep -r "BadgeGrid" app/ components/ lib/ --include="*.ts" --include="*.tsx"
```

Expected: No results (the imports were already removed in Tasks 6 and 7).

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add -u components/stats/BadgeGrid.tsx
git commit -m "chore: remove old BadgeGrid component"
```

---

### Task 9: Update Test Seed Script

**Files:**
- Modify: `scripts/seedTestStreakUser.ts`

- [ ] **Step 1: Add pre-earned achievement for testing**

In `scripts/seedTestStreakUser.ts`, after the shield inventory creation, add:

```typescript
    // Create a pre-earned achievement so the stats page has something to show
    await prisma.userAchievement.deleteMany({ where: { userId: user.id } })
    await prisma.userAchievement.create({
        data: {
            userId: user.id,
            achievementId: 'streak',
            tierLevel: 1,
            rewardGranted: JSON.stringify({ itemType: 'STREAK_FREEZE', quantity: 1 }),
            notifiedAt: new Date(), // Already notified so it doesn't toast on login
        },
    })
    console.log('Created achievement: On a Roll tier 1 (7-day streak)')
```

Update the summary:

```typescript
    console.log(`Expected: Stats page shows On a Roll tier 1 earned, tier 2 progress`)
```

- [ ] **Step 2: Run the seed script**

Run:
```bash
npx tsx scripts/seedTestStreakUser.ts
```

- [ ] **Step 3: Commit**

```bash
git add scripts/seedTestStreakUser.ts
git commit -m "feat: add achievement data to test seed script"
```

---

### Task 10: TypeScript Verification and Dev Server

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

- [ ] **Step 3: Verify test scenario**

Log in as `freezetest@example.com` / `testfreeze123`.

Expected:
- Dashboard loads without errors
- Achievement toasts appear for any newly earned achievements (the evaluator runs on load)
- Stats page shows the new AchievementGrid with 4 achievements
- "On a Roll" tier 1 is earned, shows progress toward tier 2
- "Persistent", "Dedicated", "Night Owl" show progress toward tier 1
- Freeze/shield progress cards still show below achievements
- API endpoint `GET /api/v1/stats` returns `achievements` array instead of `badges`
