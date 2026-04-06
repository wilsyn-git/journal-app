# Streak Shields — Design Spec

**Date:** 2026-04-06
**Status:** Draft
**Depends on:** User Inventory & Streak Freeze (feature/user-inventory-streak-freeze)

---

## Problem

Streak freezes have a 2-day grace window. If a user is away for longer — vacation, illness, a rough week — freezes can't help and the streak is lost. Users who've invested months of consistency lose everything with no recourse.

## Solution

**Streak Shields** — a premium inventory item that covers missed days with no grace window constraint. Shields are harder to earn (every 30 consecutive days) and rarer to hold (max 5), making them a high-value safety net for extended absences.

---

## How Shields Differ from Freezes

| | Freeze | Shield |
|---|---|---|
| Covers missed days | 1:1 | 1:1 |
| Grace window | 2 days | None |
| Application | Manual (banner) | Manual (banner) |
| Earn rate | Every 14 days | Every 30 days |
| Max held | 3 | 5 |
| Earning counter reset | On earn or freeze use | On earn or shield use |

Shields and freezes are independent items in the same `UserInventory` table. Each has its own earning counter tracked in its `metadata` JSON field.

---

## Data Model

No schema changes needed. Shields use the existing `UserInventory` model with `itemType: "STREAK_SHIELD"`. Frozen days covered by shields use the existing `StreakFreezeUsage` table (a frozen day is a frozen day regardless of which item paid for it).

**New constant in `lib/inventory.ts`:**
```
STREAK_SHIELD = {
  itemType: 'STREAK_SHIELD',
  maxQuantity: 5,
  earningInterval: 30,
}
```

---

## Earning Logic

Identical pattern to freezes. On each new journaling day:

1. Increment the shield's `earningCounter` in `UserInventory` metadata.
2. When counter reaches 30, award one shield (up to cap of 5), reset counter to 0.
3. If at cap, counter still resets.
4. When a shield is used, reset `earningCounter` to 0.

Both the freeze and shield earning counters increment on the same journal submission — they're independent tracks. A single journal day advances both counters.

**Streak broken without recovery:** If the user's streak breaks and they don't use freezes or shields, both earning counters reset to 1 on their next journal day.

---

## Recovery Banner Logic

When the user returns after missing days, the system determines the cheapest viable recovery option:

**Tier 1 — Freezes only (within grace window, enough freezes):**
> "You missed yesterday. Use **1 streak freeze** to keep your **47-day streak**?"

**Tier 2 — Freezes + shields (within grace window, not enough freezes alone):**
> "You missed the last 2 days. Use **3 freezes + 1 shield** to keep your **47-day streak**?"

Freezes are consumed first, shields cover the remainder.

**Tier 3 — Shields only (beyond grace window, or no freezes):**
> "You missed the last 5 days. Use **5 shields** to keep your **47-day streak**?"

**Tier 4 — Can't cover the gap:**
No banner. Streak is lost.

**Selection algorithm:**
1. Count missed days between last active day and today.
2. If within grace window (2 days): `freezeCost = min(missedDays, availableFreezes)`, `shieldCost = missedDays - freezeCost`.
3. If beyond grace window: `freezeCost = 0`, `shieldCost = missedDays`.
4. If `shieldCost > availableShields`: no recovery possible.
5. Otherwise: show banner with the computed costs.

The user never chooses which item to spend — the system always prefers freezes (cheaper to earn) and uses shields only for what freezes can't cover.

---

## Banner UX Changes

The existing `StreakFreezeBanner` component needs to support showing mixed costs. The banner text adapts based on what's being spent:

- Freezes only: "Use **N freeze(s)**"
- Shields only: "Use **N shield(s)**"
- Mixed: "Use **N freeze(s) + M shield(s)**"

The action button calls a single server action that deducts both item types and records all frozen days.

The dismiss behavior is unchanged — session-only via component state.

---

## Calendar Display

Days covered by shields render the same as freeze-covered days — the 🧊 ice block icon. From the user's perspective, a covered day is a covered day. No need to distinguish which item paid for it.

---

## Streak Badge

The existing freeze count indicator (🧊 x2 next to the streak) should also show shields. Display format:

`🔥 47  🧊 2  🛡️ 3`

If either count is 0, hide that indicator.

---

## Inventory Page

Add a second `StreakFreezeItem`-style row for shields:

`🛡️ Streak Shields    Last used: Mar 10, 2026    [progress bar 12/30]    3/5    (i)`

The info popover explains: "Journal for 30 consecutive days to earn a shield. Shields cover missed days with no time limit — use them when freezes can't reach."

---

## Stats Page

Add shield earning progress alongside the existing freeze progress in the Achievements section. Same compact format: progress bar + "N days from +1 Streak Shield".

---

## API Layer

**Changes to existing endpoints:**

- `GET /api/v1/inventory` — Already returns inventory data. Will naturally include shield data since `getInventory` queries by `itemType`. Need a second query for shields or generalize to return all inventory items.
- `GET /api/v1/streak-freeze/status` — Update `detectRecoverableStreak` to factor in shields and return the tiered cost breakdown.
- `GET /api/v1/stats` — Include shield count and earning progress.

**Changes to existing server action:**

- `useStreakFreeze` → rename/generalize to `useStreakRecovery` accepting `{ freezeCount: number, shieldCount: number, missedDays: string[] }`. Deducts both item types in one transaction.

---

## Summary of Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Grace window | None for shields | That's the whole point — covers extended absences |
| Earn rate | Every 30 consecutive days | Premium item, hard to earn |
| Max held | 5 | ~5 months to fill, covers a full work week |
| Spending priority | Freezes first, shields fill remainder | Freezes are cheaper to earn |
| User choice | None — system auto-picks cheapest | No decision fatigue |
| Calendar icon | Same 🧊 as freezes | A covered day is a covered day |
| Badge icon | 🛡️ | Visually distinct from freeze 🧊 |
| Earning counter | Independent from freeze counter | Both advance on same journal day |
