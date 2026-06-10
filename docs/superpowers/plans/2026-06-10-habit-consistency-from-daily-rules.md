# Habit Consistency from Daily Rules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repower the stats page "Habit Consistency" section from the user's active **daily rules** (with a 30-day consistency strip per habit), replacing the dead checkbox/radio prompt path.

**Architecture:** Add a pure transform `computeDailyHabitStats` + thin DB wrapper `getDailyHabitStats` to `lib/rules.ts` (mirroring the existing `computeRuleCalendarStatus` / `getRuleCalendarData` split). Add a pure `computeStripCells` helper in `lib/habitStrip.ts` that maps completed-day keys to 30 cell states. A new server component `DailyHabitConsistency` renders per-habit cards with the strip. The stats page and the public `/api/v1/stats` route both source habit data from `getDailyHabitStats`; the orphaned `taskStats` code is deleted from `app/lib/analytics.ts`.

**Tech Stack:** Next.js (App Router, server components), Prisma/SQLite, TypeScript, Tailwind CSS, Vitest.

---

## Background / Source of Truth

The approved spec is `docs/superpowers/specs/2026-06-09-habit-consistency-from-daily-rules-design.md`. Read it first if anything here is ambiguous. Key confirmed decisions:

- **Daily only** (`ruleType.resetMode === 'DAILY'`), **assigned & active** rules only.
- **Reuse `calculateRuleStreak` as-is** — the current open day (today) is excluded from the streak.
- **Replace**, don't keep, the checkbox/radio path in `analytics.ts`.
- 30-day strip. Cells: grey = not completed, dark green `#166534` = completed but outside the current streak, bright green `#4ade80` = completed and part of the current streak. Today is rightmost.

**Scope note discovered during planning (not in spec):** `taskStats` has a **second** consumer beyond the stats page — the public API route `app/api/v1/stats/route.ts:32`. The spec told us to grep and confirm; the grep found it. Because `getDailyHabitStats`'s shape is a **superset** of the old `taskStats` (it adds `completedDays`), Task 6 repowers that route from the same function and keeps the `taskStats` JSON key, so the public API contract stays backward-compatible.

## File Structure

- **Modify** `lib/rules.ts` — add `DailyHabitStat` type, pure `computeDailyHabitStats`, DB wrapper `getDailyHabitStats`. (Task 1)
- **Create** `tests/lib/dailyHabitStats.test.ts` — unit tests for `computeDailyHabitStats`. (Task 1)
- **Create** `lib/habitStrip.ts` — `StripCellState` type + pure `computeStripCells`. (Task 2)
- **Create** `tests/lib/habitStrip.test.ts` — unit tests for `computeStripCells`. (Task 2)
- **Create** `components/stats/DailyHabitConsistency.tsx` — server component rendering cards + strips + empty state. (Task 3)
- **Modify** `app/stats/page.tsx` — fetch `getDailyHabitStats` in the existing parallel block, compute `todayStr`, render `<DailyHabitConsistency>`, drop the old card markup. (Task 4)
- **Modify** `app/lib/analytics.ts` — delete the dead `taskMap` / `taskStats` path. (Task 5)
- **Modify** `app/api/v1/stats/route.ts` — repower `taskStats` from `getDailyHabitStats`. (Task 6)

---

## Task 1: `computeDailyHabitStats` + `getDailyHabitStats` in `lib/rules.ts`

**Files:**
- Modify: `lib/rules.ts` (append after `computeRuleCalendarStatus`, ~end of file)
- Test: `tests/lib/dailyHabitStats.test.ts` (create)

`lib/rules.ts` already imports `RESET_MODES` from `@/lib/ruleConstants` and the `prisma` singleton, and already defines `RuleTypeForPeriod`, `generatePeriodKeys`, and `calculateRuleStreak`. We reuse all of them.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/dailyHabitStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeDailyHabitStats } from '@/lib/rules'

// In-memory fixture builder — mirrors the Prisma include shape consumed by
// computeDailyHabitStats (assignment.createdAt, rule.{id,title,sortOrder,ruleType},
// completions[].periodKey).
function makeAssignment(opts: {
  id?: string
  title?: string
  sortOrder?: number
  resetMode?: 'DAILY' | 'WEEKLY' | 'INTERVAL'
  completions?: string[]
  createdAt?: Date
}) {
  return {
    createdAt: opts.createdAt ?? new Date('2026-06-01T00:00:00Z'),
    rule: {
      id: opts.id ?? 'r1',
      title: opts.title ?? 'Habit',
      sortOrder: opts.sortOrder ?? 0,
      ruleType: {
        resetMode: opts.resetMode ?? 'DAILY',
        resetDay: null,
        resetIntervalDays: null,
        resetIntervalStart: null,
      },
    },
    completions: (opts.completions ?? []).map(periodKey => ({ periodKey })),
  }
}

describe('computeDailyHabitStats', () => {
  it('includes only DAILY-reset rules', () => {
    const result = computeDailyHabitStats([
      makeAssignment({ id: 'd', resetMode: 'DAILY' }),
      makeAssignment({ id: 'w', resetMode: 'WEEKLY' }),
      makeAssignment({ id: 'i', resetMode: 'INTERVAL' }),
    ], 'UTC')
    expect(result.map(r => r.id)).toEqual(['d'])
  })

  it('sorts results by rule sortOrder ascending', () => {
    const result = computeDailyHabitStats([
      makeAssignment({ id: 'b', sortOrder: 2 }),
      makeAssignment({ id: 'a', sortOrder: 1 }),
      makeAssignment({ id: 'c', sortOrder: 3 }),
    ], 'UTC')
    expect(result.map(r => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('maps id from rule.id and content from rule.title', () => {
    const result = computeDailyHabitStats([
      makeAssignment({ id: 'rule-x', title: 'Drink water' }),
    ], 'UTC')
    expect(result[0].id).toBe('rule-x')
    expect(result[0].content).toBe('Drink water')
  })

  it('reports completion count and the completed-day keys', () => {
    const result = computeDailyHabitStats([
      makeAssignment({ completions: ['2026-06-01', '2026-06-02', '2026-06-03'] }),
    ], 'UTC')
    expect(result[0].count).toBe(3)
    expect(result[0].completedDays).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })

  it('computes max streak across the rule history', () => {
    // createdAt 2026-06-01; three consecutive completed days within range.
    // maxStreak walks all period keys (createdAt..now) counting consecutive hits.
    const result = computeDailyHabitStats([
      makeAssignment({ completions: ['2026-06-01', '2026-06-02', '2026-06-03'] }),
    ], 'UTC')
    expect(result[0].maxStreak).toBe(3)
  })

  it('returns an empty array when there are no daily rules', () => {
    expect(computeDailyHabitStats([], 'UTC')).toEqual([])
    expect(computeDailyHabitStats([makeAssignment({ resetMode: 'WEEKLY' })], 'UTC')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/dailyHabitStats.test.ts`
Expected: FAIL — `computeDailyHabitStats` is not exported from `@/lib/rules`.

- [ ] **Step 3: Write the implementation**

Append to the end of `lib/rules.ts`:

```ts
type AssignmentForHabitStats = {
  createdAt: Date
  rule: {
    id: string
    title: string
    sortOrder: number
    ruleType: RuleTypeForPeriod
  }
  completions: { periodKey: string }[]
}

export type DailyHabitStat = {
  id: string
  content: string
  currentStreak: number
  maxStreak: number
  count: number
  completedDays: string[]
}

/**
 * Pure transform: given active rule assignments (each with its rule, ruleType,
 * and completion period keys), produce per-habit stats for DAILY rules only.
 *
 * Mirrors the journal `taskStats` shape, plus `completedDays` (the raw period
 * keys) which drives the stats-page consistency strip.
 *
 * @internal exported for unit testing and reuse by getDailyHabitStats
 */
export function computeDailyHabitStats(
  assignments: AssignmentForHabitStats[],
  timezone: string
): DailyHabitStat[] {
  const daily = assignments
    .filter(a => a.rule.ruleType.resetMode === RESET_MODES.DAILY)
    .sort((a, b) => a.rule.sortOrder - b.rule.sortOrder)

  return daily.map(a => {
    const allPeriodKeys = generatePeriodKeys(a.rule.ruleType, timezone, a.createdAt)
    const completedKeys = a.completions.map(c => c.periodKey)
    const { current, max } = calculateRuleStreak(completedKeys, allPeriodKeys)
    return {
      id: a.rule.id,
      content: a.rule.title,
      currentStreak: current,
      maxStreak: max,
      count: completedKeys.length,
      completedDays: completedKeys,
    }
  })
}

/**
 * Fetch active, assigned daily-rule habit stats for a user.
 * Thin DB wrapper around computeDailyHabitStats (same query shape as
 * getRuleCalendarData).
 */
export async function getDailyHabitStats(
  userId: string,
  timezone: string
): Promise<DailyHabitStat[]> {
  const assignments = await prisma.ruleAssignment.findMany({
    where: { userId, rule: { isActive: true } },
    include: {
      rule: { include: { ruleType: true } },
      completions: { select: { periodKey: true } },
    },
  })
  return computeDailyHabitStats(assignments, timezone)
}
```

> Note: `.sort()` here operates on the array returned by `.filter()` (a fresh array), so it does not mutate the caller's input.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/dailyHabitStats.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/rules.ts tests/lib/dailyHabitStats.test.ts
git commit -m "feat(stats): add getDailyHabitStats from daily rules"
```

---

## Task 2: `computeStripCells` pure helper in `lib/habitStrip.ts`

**Files:**
- Create: `lib/habitStrip.ts`
- Test: `tests/lib/habitStrip.test.ts`

The strip needs per-day cell states for the last N days. Today's open period is excluded from the streak (consistent with `calculateRuleStreak`), so a completed **today** renders `done`, not `streak`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/habitStrip.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeStripCells } from '@/lib/habitStrip'

describe('computeStripCells', () => {
  it('returns windowSize cells (default 30)', () => {
    expect(computeStripCells([], 0, '2026-06-10')).toHaveLength(30)
    expect(computeStripCells([], 0, '2026-06-10', 7)).toHaveLength(7)
  })

  it('all cells empty when nothing is completed', () => {
    expect(computeStripCells([], 0, '2026-06-10', 5)).toEqual(
      ['empty', 'empty', 'empty', 'empty', 'empty']
    )
  })

  it('marks current-streak days "streak" and older completions "done"', () => {
    // today = 2026-06-10, window 5 → index0=06-06 ... index4=06-10 (today).
    // completed 06-06..06-09; currentStreak 3 → offsets 1..3 (06-09,06-08,06-07).
    const cells = computeStripCells(
      ['2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09'],
      3,
      '2026-06-10',
      5
    )
    expect(cells).toEqual(['done', 'streak', 'streak', 'streak', 'empty'])
  })

  it('treats a completed today as "done" (open period excluded from streak)', () => {
    // window 3 → index0=06-08, index1=06-09, index2=06-10 (today, completed).
    expect(computeStripCells(['2026-06-10'], 0, '2026-06-10', 3)).toEqual(
      ['empty', 'empty', 'done']
    )
  })

  it('ignores completions outside the window', () => {
    expect(computeStripCells(['2026-05-01'], 0, '2026-06-10', 5)).toEqual(
      ['empty', 'empty', 'empty', 'empty', 'empty']
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/habitStrip.test.ts`
Expected: FAIL — cannot find module `@/lib/habitStrip`.

- [ ] **Step 3: Write the implementation**

Create `lib/habitStrip.ts`:

```ts
export type StripCellState = 'empty' | 'done' | 'streak'

/**
 * Subtract `days` whole days from a YYYY-MM-DD string, returning YYYY-MM-DD.
 * Uses UTC arithmetic so whole-day offsets are DST-safe.
 */
function shiftDay(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * Build consistency-strip cell states for the last `windowSize` days.
 * Index 0 = oldest (today − (windowSize − 1)); last index = today.
 *
 * - 'empty'  : that day was not completed
 * - 'done'   : completed, but not part of the current live streak
 * - 'streak' : completed AND within the current streak — the consecutive run of
 *              completed days ending *yesterday* (offsets 1..currentStreak).
 *              Today (offset 0) is the still-open period and is never 'streak',
 *              matching calculateRuleStreak.
 */
export function computeStripCells(
  completedDays: string[],
  currentStreak: number,
  todayStr: string,
  windowSize = 30
): StripCellState[] {
  const completed = new Set(completedDays)
  const cells: StripCellState[] = []
  for (let i = 0; i < windowSize; i++) {
    const offsetFromToday = windowSize - 1 - i
    const dateStr = shiftDay(todayStr, offsetFromToday)
    if (!completed.has(dateStr)) {
      cells.push('empty')
    } else if (offsetFromToday >= 1 && offsetFromToday <= currentStreak) {
      cells.push('streak')
    } else {
      cells.push('done')
    }
  }
  return cells
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/habitStrip.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/habitStrip.ts tests/lib/habitStrip.test.ts
git commit -m "feat(stats): add computeStripCells helper for consistency strip"
```

---

## Task 3: `DailyHabitConsistency` server component

**Files:**
- Create: `components/stats/DailyHabitConsistency.tsx`

A server component (no client interactivity) that renders one `glass-card` per habit with the 30-day strip, or the empty state. Mirrors the existing card layout in `app/stats/page.tsx` (Streak/Best numbers, hover styling).

- [ ] **Step 1: Write the component**

Create `components/stats/DailyHabitConsistency.tsx`:

```tsx
import { computeStripCells, type StripCellState } from '@/lib/habitStrip'
import type { DailyHabitStat } from '@/lib/rules'

const CELL_CLASS: Record<StripCellState, string> = {
  empty: 'bg-white/[0.08]',
  done: 'bg-[#166534]',
  streak: 'bg-[#4ade80]',
}

export function DailyHabitConsistency({
  habits,
  todayStr,
}: {
  habits: DailyHabitStat[]
  todayStr: string
}) {
  if (habits.length === 0) {
    return (
      <div className="text-muted-foreground italic p-8 glass-card rounded-xl border border-white/10">
        No daily habits yet. Daily rules assigned to you will show up here as you build streaks.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {habits.map(habit => {
        const cells = computeStripCells(habit.completedDays, habit.currentStreak, todayStr)
        return (
          <div
            key={habit.id}
            className="glass-card p-4 rounded-xl border border-white/10 group hover:bg-white/5 transition-colors"
          >
            <div className="flex justify-between items-start mb-3 gap-4">
              <h3 className="text-white font-medium">{habit.content}</h3>
              <div className="flex gap-6 text-right shrink-0">
                <div>
                  <span className="block text-xl font-bold text-green-400">{habit.currentStreak}</span>
                  <span className="text-xs text-gray-400 uppercase">Streak</span>
                </div>
                <div>
                  <span className="block text-xl font-bold text-gray-300">{habit.maxStreak}</span>
                  <span className="text-xs text-gray-400 uppercase">Best</span>
                </div>
              </div>
            </div>
            <div className="flex gap-1" aria-hidden="true">
              {cells.map((state, i) => (
                <div key={i} className={`h-4 flex-1 rounded-sm ${CELL_CLASS[state]}`} />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">Completed {habit.count} times</p>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck the component**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors (this also confirms `DailyHabitStat` and `StripCellState` imports resolve).

- [ ] **Step 3: Commit**

```bash
git add components/stats/DailyHabitConsistency.tsx
git commit -m "feat(stats): add DailyHabitConsistency strip component"
```

---

## Task 4: Wire the component into `app/stats/page.tsx`

**Files:**
- Modify: `app/stats/page.tsx` (imports ~7-21; parallel fetch ~58-61; render block ~230-257)

`timezone` is resolved at line 57 and the second `Promise.all` (lines 58-61) already runs with it available. Add `getDailyHabitStats` there, compute `todayStr`, and replace the old Habit Consistency markup.

- [ ] **Step 1: Add the imports**

Add to the import group near the top of `app/stats/page.tsx`. Change the existing rules import (line 15) and add the component import:

```tsx
import { getRuleCalendarData, getDailyHabitStats } from "@/lib/rules"
```

Add alongside the other `@/components/stats/*` imports:

```tsx
import { DailyHabitConsistency } from "@/components/stats/DailyHabitConsistency"
```

- [ ] **Step 2: Fetch daily habits in the existing parallel block**

Replace the block at lines 58-61:

```tsx
    const [achievementState, ruleCalendar] = await Promise.all([
        getAchievementState(targetUserId, stats.achievementMetrics),
        getRuleCalendarData(targetUserId, timezone),
    ])
```

with:

```tsx
    const [achievementState, ruleCalendar, dailyHabits] = await Promise.all([
        getAchievementState(targetUserId, stats.achievementMetrics),
        getRuleCalendarData(targetUserId, timezone),
        getDailyHabitStats(targetUserId, timezone),
    ])
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
```

- [ ] **Step 3: Replace the Habit Consistency render block**

Replace lines 231-257 (the `{stats.taskStats.length > 0 ? (...) : (...)}` ternary, everything between the `<h2>Habit Consistency</h2>` heading and the closing `</div>` of `max-w-4xl`):

```tsx
                    {/* Habit Consistency (daily rules) */}
                    <h2 className="text-2xl font-bold text-white mb-6">Habit Consistency</h2>
                    <DailyHabitConsistency habits={dailyHabits} todayStr={todayStr} />
```

(The `<h2>` at line 231 stays; only the ternary that followed it is replaced by the single component line.)

- [ ] **Step 4: Typecheck and build the page**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npx vitest run`
Expected: PASS — full suite green (no regression from the page wiring).

- [ ] **Step 5: Commit**

```bash
git add app/stats/page.tsx
git commit -m "feat(stats): render Habit Consistency from daily rules"
```

---

## Task 5: Delete the dead `taskStats` path from `app/lib/analytics.ts`

**Files:**
- Modify: `app/lib/analytics.ts` (remove `taskMap` decl ~78; CHECKBOX/RADIO block ~101-106; `taskStats` loop ~165-177; `taskStats` in return ~205)

`PROMPT_TYPES.TEXT` and `PROMPT_TYPES.RANGE` remain in use, so the `PROMPT_TYPES` import stays. Only the CHECKBOX/RADIO/`taskStats` code is removed. **Do this task after Task 6 is staged**, or sequence Task 6 first — but they can be one commit if preferred. (Plan keeps them separate for reviewability; Task 6 must land in the same branch before the API is exercised.)

- [ ] **Step 1: Remove the `taskMap` declaration**

Delete line ~78:

```tsx
    const taskMap = new Map<string, { prompt: string, type: string, days: Set<string> }>();
```

- [ ] **Step 2: Remove the CHECKBOX/RADIO accumulation block**

Delete lines ~101-106:

```tsx
        if (([PROMPT_TYPES.CHECKBOX, PROMPT_TYPES.RADIO] as string[]).includes(e.prompt.type)) {
            if (!taskMap.has(e.prompt.id)) {
                taskMap.set(e.prompt.id, { prompt: e.prompt.content, type: e.prompt.type, days: new Set() });
            }
            taskMap.get(e.prompt.id)!.days.add(dayStr);
        }
```

- [ ] **Step 3: Remove the `taskStats` build loop**

Delete the block at lines ~165-177:

```tsx
    // Task Stats (Daily Habits)
    const taskStats = [];
    for (const [id, data] of taskMap.entries()) {
        const days = Array.from(data.days).sort().reverse();
        const streaks = calculateStreaks(days, todayStr);
        taskStats.push({
            id,
            content: data.prompt,
            currentStreak: streaks.current,
            maxStreak: streaks.max,
            count: days.length
        });
    }
```

- [ ] **Step 4: Remove `taskStats` from the returned object**

In the final `return { ... }`, delete the line:

```tsx
        taskStats,
```

- [ ] **Step 5: Verify nothing else references the removed symbols**

Run: `grep -rn "taskMap\|taskStats" app/lib/analytics.ts`
Expected: no output (both symbols fully removed from this file).

Run: `npx tsc --noEmit`
Expected: PASS — note this will FAIL until Task 6 lands if done out of order, because `app/api/v1/stats/route.ts` still reads `stats.taskStats`. Do Task 6 first (or in the same working tree) so the typecheck is clean.

- [ ] **Step 6: Commit**

```bash
git add app/lib/analytics.ts
git commit -m "refactor(stats): remove dead checkbox/radio taskStats path"
```

---

## Task 6: Repower the public API route from daily rules

**Files:**
- Modify: `app/api/v1/stats/route.ts` (import ~7; `Promise.all` ~17-20; return ~32)

The route already resolves `timezone` (line 15). Source `taskStats` from `getDailyHabitStats` and keep the JSON key name for backward compatibility. **Land this before/with Task 5** so the build never breaks.

- [ ] **Step 1: Add the import**

Add after the existing `getUserStats` import (line 7):

```tsx
import { getDailyHabitStats } from '@/lib/rules'
```

- [ ] **Step 2: Fetch habit stats in the parallel block**

Replace lines 17-20:

```tsx
    const [stats, inventory] = await Promise.all([
      getUserStats(userId, timezone),
      getInventory(userId),
    ])
```

with:

```tsx
    const [stats, inventory, taskStats] = await Promise.all([
      getUserStats(userId, timezone),
      getInventory(userId),
      getDailyHabitStats(userId, timezone),
    ])
```

- [ ] **Step 3: Return the new `taskStats`**

Change line 32 from:

```tsx
      taskStats: stats.taskStats,
```

to:

```tsx
      taskStats,
```

- [ ] **Step 4: Typecheck and run the suite**

Run: `npx tsc --noEmit`
Expected: PASS (with Task 5 applied, `stats.taskStats` no longer exists and nothing references it).

Run: `npx vitest run`
Expected: PASS — full suite green.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/stats/route.ts
git commit -m "feat(api): source v1 stats taskStats from daily rules"
```

---

## Final Verification

- [ ] **Full test suite:** `npx vitest run` → all green.
- [ ] **Typecheck:** `npx tsc --noEmit` → no errors.
- [ ] **Production build:** `npm run build` → succeeds.
- [ ] **Manual smoke (dev server):** start the dev server, open `/stats` as a user with active daily rules, confirm each daily habit renders a card with a 30-day strip (grey/dark-green/bright-green), correct Streak/Best numbers, and `Completed N times`. As a user with **no** active daily rules, confirm the empty state copy: "No daily habits yet. Daily rules assigned to you will show up here as you build streaks." **Do not touch production data.**

---

## Self-Review (performed against the spec)

**Spec coverage:**
- `getDailyHabitStats` signature + behavior (fetch active assignments → daily filter → per-assignment streak via `generatePeriodKeys`/`calculateRuleStreak` → map → sort by sortOrder) → **Task 1**. ✔
- Pure-core split mirroring `computeRuleCalendarStatus` → `computeDailyHabitStats` pure + `getDailyHabitStats` wrapper, tested without DB → **Task 1**. ✔
- Returned shape `{ id, content, currentStreak, maxStreak, count, completedDays }` → **Task 1** (`DailyHabitStat`). ✔
- 30-day strip cell states (grey / `#166534` / `#4ade80`), today rightmost, derived from current-streak boundary → **Task 2** + **Task 3**. ✔
- Data flow: add to existing parallel `Promise.all`, render where `taskStats` was read → **Task 4**. ✔
- Remove dead checkbox/radio path; leave RANGE/`trendStats` untouched → **Task 5** (only `taskMap`/`taskStats`/CHECKBOX/RADIO removed). ✔
- Grep for other `taskStats` consumers before removal → done during planning; found `app/api/v1/stats/route.ts` → handled in **Task 6** (not in original spec; preserves the public API). ✔
- Copy: subtitle `Completed {count} times` → **Task 3**; empty state "No daily habits yet…" → **Task 3**. ✔
- Tests: daily-only filter, sort order, count, empty case → **Task 1**; strip states → **Task 2**. ✔
- Out of scope (weekly/interval, historical rules, open-day streak variant, checkbox/radio reintroduction) — none added. ✔

**Type consistency:** `DailyHabitStat` (Task 1) is imported by the component (Task 3) and produced by `getDailyHabitStats` consumed in Tasks 4 & 6. `StripCellState` + `computeStripCells` (Task 2) consumed by Task 3 with matching signature `(completedDays, currentStreak, todayStr, windowSize?)`. Cell-state keys `'empty' | 'done' | 'streak'` match between helper and `CELL_CLASS`. ✔

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to" — every code step contains complete content. ✔
