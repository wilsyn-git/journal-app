# Achievement Engine — Design Spec

**Date:** 2026-04-06
**Status:** Draft

---

## Problem

The current badge system is five hardcoded boolean expressions in `app/lib/analytics.ts`, recomputed on every page load with no persistence, no tiers, no rewards, and no notifications. Two badges are being removed (Early Bird, Wordsmith). The remaining three (plus one new one) need a proper engine.

## Solution

A registry-driven achievement system with tiered progression, DB persistence, inventory rewards, and toast notifications. Adding a new achievement means adding an entry to a config file. The engine handles evaluation, persistence, rewards, and notifications uniformly.

---

## Data Model

### UserAchievement

| Field | Type | Notes |
|-------|------|-------|
| id | String (uuid) | PK |
| userId | String | FK → User |
| achievementId | String | Matches registry id (e.g. `"streak"`) |
| tierLevel | Int | Which tier was earned (1, 2, 3...) |
| earnedAt | DateTime | When it was earned |
| notifiedAt | DateTime? | When the user was shown the toast (null = pending) |
| rewardGranted | String? | JSON snapshot of the reward given at earn-time |
| createdAt | DateTime | |

- `@@unique([userId, achievementId, tierLevel])`
- `@@index([userId])`

Relation added to User model: `achievements UserAchievement[]`

The `rewardGranted` field snapshots what was awarded. If rewards are later changed in the registry, existing records reflect what the user actually received.

---

## Achievement Registry

A code-defined registry in `lib/achievements.ts`. Type-safe, no database, no admin UI.

### Types

```typescript
type AchievementReward = {
  itemType: string
  quantity: number
}

type AchievementTier = {
  level: number
  threshold: number
  label: string
  reward: AchievementReward | null
}

type AchievementDefinition = {
  id: string
  name: string
  icon: string
  metric: string
  tiers: AchievementTier[]
}
```

### Initial Registry

Four achievements, each tracking a distinct metric:

**On a Roll** (`metric: 'maxStreak'`)
- Tier 1: 7-day streak → 1 freeze
- Tier 2: 30-day streak → 1 shield
- Tier 3: 100-day streak → 1 shield

**Persistent** (`metric: 'totalDaysJournaled'`)
- Tier 1: 30 days → 1 freeze
- Tier 2: 100 days → 1 freeze
- Tier 3: 365 days → 1 shield

**Dedicated** (`metric: 'totalEntries'`)
- Tier 1: 100 answers → 1 freeze
- Tier 2: 500 answers → 1 freeze
- Tier 3: 1,000 answers → 1 shield

**Night Owl** (`metric: 'lateNightEntries'`)
- Tier 1: 5 late entries → 1 freeze
- Tier 2: 25 late entries → 1 freeze

Thresholds and rewards are easily tunable in the registry file. These are starting values.

### Adding a New Achievement

1. Define the metric key (or reuse existing one)
2. If new metric: add computation to the evaluator's metrics map (one function, one place)
3. Add the entry to the registry array
4. Deploy

No schema changes, no admin UI, no migration.

---

## Evaluation Engine

### Metrics Map

One function computes all metrics from user data:

```typescript
{
  maxStreak: 47,
  totalDaysJournaled: 83,
  totalEntries: 412,
  lateNightEntries: 12,
}
```

These are derived from the same data `getUserStats` already queries — entry dates, timestamps, streak calculation results.

### Evaluation Flow

Runs on **dashboard page load** (server component), not on journal autosave:

1. Compute the metrics map (most data already available from `getUserStats`)
2. Query existing `UserAchievement` rows for the user
3. For each achievement in the registry, for each tier:
   - Is `metrics[achievement.metric] >= tier.threshold`?
   - Does the user already have a `UserAchievement` for this `achievementId + tierLevel`?
   - If qualifies and not yet earned → newly earned
4. For each newly earned tier:
   - Write `UserAchievement` row with `rewardGranted` snapshot and `notifiedAt: null`
   - Grant inventory reward (increment `UserInventory.quantity` via upsert)
5. Return list of unnotified achievements for toast display

### Threshold Changes

Retroactive. The evaluator always checks current stats against current thresholds. If a user qualifies after a threshold change, they earn it on next dashboard load.

### Reward Changes

Not retroactive. `rewardGranted` snapshots the reward at earn-time. Changing rewards in the registry only affects future earners.

---

## Notification Flow

1. **Server (dashboard load):** Evaluator writes new achievements with `notifiedAt: null`. Passes unnotified achievements to the page as data.
2. **Client:** A component receives the unnotified list, fires `addToast('success', ...)` for each via the existing `ToastProvider`.
3. **Client:** Calls a server action to set `notifiedAt` on each, preventing duplicate toasts on refresh.

Toast format: `"🏆 Achievement unlocked: On a Roll — 30-day streak!"`

---

## UI Changes

### Stats Page — Replace BadgeGrid

Remove the current `BadgeGrid` component and its hardcoded badge data. Replace with achievement cards that show:

- Achievement name + icon
- Current tier earned (if any) with its label
- Progress toward the next tier (progress bar + metric value)
- Tier visibility: locked achievements show tier 1 only (grayed out). Earned tier reveals the next tier. Highest tier shows as complete.

### Dashboard

No layout changes. Toast notifications use the existing bottom-right toast system. The streak badge, freeze/shield indicators, task banner, and recovery banner are unchanged.

### Inventory Page

No changes. Rewards granted by achievements are inventory items — they appear in freeze/shield counts automatically.

### API

Update `GET /api/v1/stats` to return achievement data from the registry + DB instead of the hardcoded badges array. Shape:

```json
{
  "achievements": [
    {
      "id": "streak",
      "name": "On a Roll",
      "icon": "🔥",
      "currentTier": 2,
      "currentLabel": "30-day streak",
      "nextTier": { "level": 3, "threshold": 100, "label": "100-day streak" },
      "metricValue": 47
    }
  ]
}
```

---

## Migration / Transition

### What Gets Removed

- Hardcoded `badges` array in `app/lib/analytics.ts` (lines 128-163)
- Duplicate `badges` array in `app/api/v1/stats/route.ts` (lines 75-112)
- `components/stats/BadgeGrid.tsx`
- Early Bird and Wordsmith badges — gone entirely

### What Happens to Existing Users

No data migration needed — the old system had no persistence. On first dashboard load after deploy, the evaluator runs, discovers the user qualifies for various tiers, grants them all at once (with rewards), and shows toasts. Existing users get a nice "here's what you've accomplished" moment.

---

## Summary of Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Definition source | Code registry | Type-safe, rarely changes, no admin UI overhead |
| Tracking | DB persistence | Earned is earned, can't un-unlock |
| Evaluation trigger | Dashboard page load | Metrics already computed there, avoids autosave hot path |
| Tier visibility | Current + next only | One carrot ahead, surprise for later tiers |
| Rewards | Per-tier inventory grants | Completes the journal → achieve → reward → protect loop |
| Reward changes | Not retroactive | You got what was offered when you earned it |
| Threshold changes | Retroactive | If you qualify now, you qualify |
| Notification | Toast via existing ToastProvider | Immediate feedback, no new infrastructure |
| Migration | No data migration | Old system had no persistence, fresh evaluation on deploy |
