# Calendar & Rules Visibility Improvements

**Date:** 2026-04-14
**Status:** Approved

## Problem

1. **Calendar checkmarks are near-invisible.** Rule completion indicators on calendar days use a `✓` text character at `text-[8px]`, which is too small to read on the dark background, especially against colored (purple/red) journal-completion cells.

2. **Rules don't reflect historical state.** `getUserRulesWithStatus()` always computes completion for today's period. When viewing a past day or when an admin inspects another user, the rules card still shows today's status rather than the selected day's completions.

## Design

### 1. Calendar Dot Indicators

Replace the `✓` text character in `CalendarSidebar.tsx` with a solid colored dot.

**Dot specs:**
- Size: `w-2 h-2` (8px diameter)
- Shape: `rounded-full`
- Border: `border border-black/50` (ensures visibility on any cell background)
- Position: unchanged — `absolute -bottom-1 -right-1` for daily, `absolute -top-1 -right-1` for weekly

**Colors:**
- All rules complete: `bg-green-400`
- Partial completion: `bg-blue-400`

No other calendar changes — flames, frost, streak connectors, and active ring remain as-is.

### 2. Historical Rules Display

#### Data Layer

Add an optional `date` parameter to `getUserRulesWithStatus(userId, timezone, date?)` in `lib/rules.ts`.

When provided, construct a `Date` from the string and pass it to `getPeriodKey(ruleType, timezone, date)`. The function already fetches all completions and filters by period key, so this is the only change needed.

#### Dashboard Wiring

In `app/dashboard/page.tsx`, pass `targetDate` (already computed on line 163) to the rules fetch:

```
getUserRulesWithStatus(targetUserId, timezone, targetDate)
```

#### Display Logic

| Scenario | Component | Behavior |
|----------|-----------|----------|
| Current user, today | `DailyRulesCard` | Interactive toggles (unchanged) |
| Current user, past day | `AdminRulesCard` | Read-only, shows that day's completions |
| Admin viewing other user (any day) | `AdminRulesCard` | Read-only, shows that day's completions |

Dashboard conditions change from:
- `isViewingSelf && dailyRules.length > 0` → interactive card
- `!isViewingSelf && ruleGroups.length > 0` → read-only card

To:
- `isViewingSelf && !isPast && dailyRules.length > 0` → interactive card
- `(isPast || !isViewingSelf) && ruleGroups.length > 0` → read-only card

`AdminRulesCard` already renders grouped rules with emoji completion indicators in read-only mode — no changes needed to that component.

## Files Changed

- `lib/rules.ts` — add optional `date` param to `getUserRulesWithStatus`
- `app/dashboard/page.tsx` — pass `targetDate` to rules fetch, update display conditions
- `components/CalendarSidebar.tsx` — replace `✓` text with colored dots
