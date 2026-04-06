# User Inventory & Streak Freeze — Design Spec

**Date:** 2026-04-06
**Status:** Draft

---

## Problem

Travel, illness, or life events can cause a user to miss a journaling day and lose their streak. While minor in the grand scheme, losing a streak feels like a personal failure — the user feels they've let themselves down and lost something they worked hard to build.

## Solution

Introduce a **User Inventory** system with **Streak Freezes** as the first item type. Users earn streak freezes through consistent journaling and can apply them to recover a broken streak within a grace window.

---

## Data Model

### UserInventory

A generic inventory store — one row per user per item type. Streak freezes are the first item, but the model supports future collectible/reward item types without schema changes.

| Field | Type | Notes |
|-------|------|-------|
| id | String (uuid) | PK |
| userId | String | FK → User |
| itemType | String | e.g. `"STREAK_FREEZE"` |
| quantity | Int | Current count (0–3 for freezes) |
| metadata | String? | JSON blob for item-specific state |
| createdAt | DateTime | |
| updatedAt | DateTime | |

- `@@unique([userId, itemType])`
- `@@index([userId])`

**Metadata for `STREAK_FREEZE`:**
```json
{ "earningCounter": 12 }
```
The `earningCounter` tracks consecutive journaling days since the counter last reset. Resets to 0 when a freeze is earned or used.

### StreakFreezeUsage

Records each frozen day for calendar rendering and streak calculation.

| Field | Type | Notes |
|-------|------|-------|
| id | String (uuid) | PK |
| userId | String | FK → User |
| frozenDate | String | `"2026-04-05"` — the missed day |
| appliedAt | DateTime | When the user clicked "Use freeze" |
| createdAt | DateTime | |

- `@@unique([userId, frozenDate])` — can't freeze the same day twice
- `@@index([userId])` — for calendar queries

---

## Earning Logic

**Trigger:** Each time a user submits a journal entry for a new unique day (not per entry — per unique day).

**Rules:**
1. On each new journaling day, increment `earningCounter` in the user's `STREAK_FREEZE` inventory row.
2. When `earningCounter` reaches 14, award one freeze (`quantity += 1`, capped at 3) and reset counter to 0.
3. If `quantity` is already at cap (3), the counter still resets — no stockpiling beyond cap.
4. When a freeze is used, reset `earningCounter` to 0. The user starts earning again from the day they returned.

**Where this runs:** Inside the existing `submitEntry` server action. After saving the entry, check if this is the user's first entry for today. If so, increment the earning counter. This keeps it transactional with the journal write.

**Streak broken without freeze:** If the user's streak breaks and they don't (or can't) use a freeze, the `earningCounter` resets to 1 on their next journal day — they're starting fresh.

**First-time users:** The `UserInventory` row for `STREAK_FREEZE` is created lazily on first journal entry via upsert. New users start with `quantity: 0`, `earningCounter: 0`.

---

## Freeze Application Flow

### Detection

On dashboard load, after calculating the user's streak:

1. Calculate the gap between today and the user's last journal day.
2. If gap is 1–2 days AND user has freezes available → show the recovery banner.
3. If gap is 3+ days → streak is permanently lost, no banner (grace window expired).
4. If gap is 0 → they journaled today, no banner needed.

### Grace Window

**2 days.** Miss Monday, must return by Wednesday. Each missed day costs one freeze.

Examples:
- Miss 1 day, return next day → 1 freeze spent
- Miss 2 days, return on day 3 → 2 freezes spent
- Miss 3+ days → streak lost, no recovery possible

### Banner UX

An inline banner at the top of the dashboard, same position and pattern as the existing `TaskBanner`:

> "You missed [yesterday / the last 2 days]. Use [1/2] streak freeze(s) to keep your **47-day streak**?"
> `[Use Freeze]` `[X]`

- **"Use Freeze"** → Server action that deducts freezes from inventory, writes `StreakFreezeUsage` rows for each missed date, resets earning counter.
- **"X"** → Dismisses the banner for the current session only (component state). On next visit/refresh, if the problem is still solvable, the banner reappears. No persistence needed — the banner is derived purely from state.

The banner disappears permanently when one of three things happens:
1. The user applies freezes (problem solved)
2. The grace window expires (problem unsolvable)
3. The user runs out of freezes (no way to recover)

### Two-Counter System

- **Display streak** — What the user sees. Preserved by freezes. "47-day streak" stays at 47 after using a freeze.
- **Earning counter** — Resets to 0 when a freeze is used. Drives the next freeze reward. Prevents gaming — the user must earn their next freeze from scratch after recovery.

---

## Streak Calculation Changes

`calculateStreaks()` in `lib/streaks.ts` currently breaks on any gap in consecutive days. It needs to treat dates present in `StreakFreezeUsage` as "covered" — frozen dates bridge gaps in the journal day sequence without counting as journal activity.

**Input change:** The function receives an additional set of frozen dates. When checking day adjacency, a frozen date fills the gap just like a journal day would.

**What frozen days affect:**
- Streak continuity — yes (that's the whole point)
- Entry totals, word counts, stats — no (they're not journal activity)

---

## Calendar & Streak Display

### Calendar / Heatmap

- Frozen dates render with a **small blue ice block icon** in place of the fire icon that already exists for streak days.
- The underlying day still shows as "no entry" — no fake activity.
- `StreakFreezeUsage` rows provide the frozen dates, queried alongside journal entries when building calendar data.

### Streak Badge

No change needed. `StreakBadge` already just displays a number — the freeze-aware streak calculation feeds it the correct count.

### Dashboard Quick-Glance

A subtle **"❄️ x2"** indicator next to the existing streak badge on the dashboard. At-a-glance inventory without taking up space.

### Inventory Page

New sidebar nav item: **"Inventory"** below "My Stats" in the left-hand menu. Displays:

- Current streak freeze count with ice block icon
- Earning progress ("11/14 days toward next freeze")
- Cap indicator ("2/3 freezes held")
- Usage history (dates frozen and when applied)

### Stats Page

An achievement-style indicator: **"3 days from +1 Streak Freeze"** in the achievements/badges area.

---

## API Layer (iOS)

### New Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/v1/inventory` | User's inventory (freeze count, earning progress) |
| POST | `/api/v1/inventory/streak-freeze/use` | Apply freeze(s) to missed days |
| GET | `/api/v1/streak-freeze/status` | Recoverable broken streak check (for banner) |

### Status Response Shape

```json
{
  "needsRecovery": true,
  "missedDays": ["2026-04-05"],
  "freezesAvailable": 2,
  "freezesCost": 1,
  "streakAtRisk": 47
}
```

Gives the client everything needed to render the freeze banner in a single request.

### Changes to Existing Endpoints

- **`GET /api/v1/stats`** — Incorporate frozen dates into streak calculation. Include freeze count in response.
- **Journal entry submission** — Earning counter logic applies identically whether the entry comes from web or API.

---

## Summary of Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Application method | Manual prompt (banner) | Keeps user in control, moment of intentionality |
| Visual treatment | Gap preserved + ice icon | Honest — doesn't fake activity |
| Earning rate | Every 14 consecutive journal days | Rewards consistency |
| Inventory cap | 3 freezes max | Preserves streak meaning |
| Earning counter reset | On freeze earn AND use | Prevents gaming after recovery |
| Grace window | 2 days | Covers "life happened" without being too generous |
| Cost per missed day | 1 freeze per day | Keeps the economy honest |
| Banner dismissal | Session only (component state) | "Not now" is valid; banner re-derives from state |
| Banner persistence | Derived from data, not stored | No dismissal tracking needed |
| Data model | Generic UserInventory table | Extensible to future item types |
| Inventory page | Own sidebar nav item | Signals it's a system, not a one-off |
