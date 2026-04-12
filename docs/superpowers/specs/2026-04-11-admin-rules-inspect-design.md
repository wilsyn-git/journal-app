# Admin Rules Status in Inspect View

**Date:** 2026-04-11

## Problem

When an admin inspects a user via `/dashboard?viewUserId=...`, they see journal entries and tasks but no rule status. The data is already fetched (`getUserRulesWithStatus` runs for the target user) but the `DailyRulesCard` is gated behind `isViewingSelf`.

## Solution

Show a read-only rules card in the admin inspect view displaying all assigned rules grouped by type, with current-period completion status.

## Component: `AdminRulesCard`

New component at `components/AdminRulesCard.tsx`. Server component — no client interactivity needed.

### Props

```typescript
type RuleGroup = {
  ruleType: {
    id: string
    name: string
    resetMode: string
    resetDay: number | null
    resetIntervalDays: number | null
  }
  rules: {
    assignmentId: string
    title: string
    isCompleted: boolean
  }[]
}

type Props = {
  ruleGroups: RuleGroup[]
}
```

### Layout

- Card container styled consistently with `DailyRulesCard` (same border, padding, rounded corners)
- Header: "Rules" label + overall progress count (e.g. "3/5") + green checkmark if all complete
- Overall progress bar (purple when in progress, green when all complete)
- Grouped sections, each with:
  - Small uppercase label: type name + schedule description from `formatResetSchedule`
  - List of rules with static indicator: `✅` if completed, `⬜` if not
  - Completed rules get `line-through` + muted green text
- No toggle buttons, no links, no streak info
- Returns `null` if `ruleGroups` is empty or has no rules

## Dashboard Integration

In `app/dashboard/page.tsx`, replace the current rules rendering block:

**Before:**
```tsx
{isViewingSelf && dailyRules.length > 0 && (
    <DailyRulesCard rules={...} />
)}
```

**After:**
```tsx
{isViewingSelf && dailyRules.length > 0 && (
    <DailyRulesCard rules={...} />
)}
{!isViewingSelf && ruleGroups.length > 0 && (
    <AdminRulesCard ruleGroups={ruleGroups} />
)}
```

The `ruleGroups` variable is already computed from `getUserRulesWithStatus` on line 133. Pass it through with minimal reshaping — the component only needs `ruleType` metadata and per-rule `title` + `isCompleted`.

## What's NOT changing

- No new data fetching — `getUserRulesWithStatus` already runs for the target user
- No new routes or pages
- `DailyRulesCard` is untouched — self-view behavior stays the same
- No streak display — admin uses calendar sidebar for visual streak info
- No interactivity — admin cannot toggle another user's rules
