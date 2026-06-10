# Habit Consistency from Daily Rules — Design

**Date:** 2026-06-09
**Status:** Approved (pending spec review)

## Background

The stats page (`app/stats/page.tsx`) has a **Habit Consistency** section that
renders per-habit streak cards from `stats.taskStats`. `taskStats` is computed in
`app/lib/analytics.ts` exclusively from journal entries whose prompt `type` is
`CHECKBOX` or `RADIO` (analytics.ts:101–106, 166–177).

The daily-journal flow was reworked at some point so that habit-style tracking
moved to the **Rules** system (`RuleType` / `Rule` / `RuleAssignment` /
`RuleCompletion`). As a result, **no `CHECKBOX`/`RADIO` prompts exist in
production** (verified: 168 `TEXT` + 3 `RANGE`, zero checkbox/radio org-wide), so
the Habit Consistency section shows its empty state for every user. The feature is
orphaned.

Meanwhile, users have rich daily-habit data in the Rules system. Example
(`lmg@penghin.com`): 8 active **DAILY** rules with real completion history —
"Take your meds" (54), "Drink sufficient water" (49), "Eat a good dinner" (50),
etc.

## Goal

Repower the Habit Consistency section from the user's **daily rules** instead of
the dead checkbox/radio prompt path.

## Decisions (confirmed with user)

| Decision | Choice |
|---|---|
| Relationship to old prompt logic | **Replace** — delete the orphaned checkbox/radio code path |
| Reset-mode scope | **Daily only** (`RuleType.resetMode === 'DAILY'`) |
| Inclusion criteria | **Assigned & active only** (current 0-streak rules still show, prompting resumption) |
| Current-streak semantics | **Reuse `calculateRuleStreak` as-is** — current (open) period excluded, consistent with the live journal |

## Architecture

`lib/rules.ts` already owns rules, completions, and streak math
(`calculateRuleStreak`, `generatePeriodKeys`, `getPeriodKey`). The new logic lives
there — keeping `analytics.ts` focused on journal-entry analytics.

### New function: `getDailyHabitStats`

```ts
// lib/rules.ts
export async function getDailyHabitStats(
  userId: string,
  timezone: string
): Promise<{ id: string; content: string; currentStreak: number; maxStreak: number; count: number }[]>
```

Behavior:

1. Fetch active, assigned rule assignments for the user (same query shape as
   `getRuleCalendarData`):
   ```ts
   prisma.ruleAssignment.findMany({
     where: { userId, rule: { isActive: true } },
     include: { rule: { include: { ruleType: true } }, completions: { select: { periodKey: true } } },
   })
   ```
2. Filter to `assignment.rule.ruleType.resetMode === 'DAILY'`.
3. For each assignment:
   - `allPeriodKeys = generatePeriodKeys(ruleType, timezone, assignment.createdAt)`
   - `completedKeys = assignment.completions.map(c => c.periodKey)`
   - `{ current, max } = calculateRuleStreak(completedKeys, allPeriodKeys)`
   - `count = completedKeys.length`
4. Map to `{ id: ruleId, content: rule.title, currentStreak: current, maxStreak: max, count }`.
5. Sort by rule `sortOrder` ascending (matches journal ordering).

The returned shape is **identical** to today's `taskStats`, so the stats-page
card markup is essentially unchanged.

### Pure-core split for testing

Follow the existing `computeRuleCalendarStatus` pattern: a thin DB wrapper
(`getDailyHabitStats`) plus a pure transform that takes already-fetched
assignments and produces the stat array, so it can be unit-tested without the DB.
`calculateRuleStreak` is already unit-tested; the new tests cover assembly
(daily-only filtering, sort order, count, empty case).

## Data flow

`app/stats/page.tsx` already calls `getRuleCalendarData(targetUserId, timezone)`
in a parallel `Promise.all` block. Add `getDailyHabitStats(targetUserId, timezone)`
to that same block and render its result where `stats.taskStats` is read today
(page.tsx:232+).

## Removing the dead path

In `app/lib/analytics.ts`:
- Remove the `taskMap` population (lines ~101–106).
- Remove the `taskStats` build loop (lines ~166–177).
- Remove `taskStats` from the returned object (line ~205).

RANGE / `trendStats` / Trends logic is **untouched**.

Before removing, grep to confirm `taskStats` has no consumer other than
`app/stats/page.tsx`.

## Copy changes

- Card subtitle: `Answered {count} times total` → **`Completed {count} times`**
- Empty state (now shows only when the user has zero active daily rules):
  **"No daily habits yet. Daily rules assigned to you will show up here as you build streaks."**

## Testing

- Unit-test the pure transform: daily-only filtering, sort order, completion
  count, and the empty (no active daily rules) case.
- Reuse existing `calculateRuleStreak` coverage for streak correctness.

## Out of scope (YAGNI)

- Weekly / interval rules in this section.
- Historical (unassigned/deactivated) rules.
- A stats-specific streak variant that counts the current open day.
- Reintroducing checkbox/radio prompts.
