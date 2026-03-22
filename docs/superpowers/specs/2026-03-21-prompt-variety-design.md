# Prompt Variety Improvement — Design Spec

**Date:** 2026-03-21
**Status:** Shipped (2026-03-21)
**Problem:** Users see the same non-global prompts repeated across consecutive days despite a large pool (103 General prompts). The PRNG produces similar early outputs for similar seeds (consecutive dates), and there is no mechanism to suppress recently-shown prompts.

---

## Solution Overview

Two changes to `getActivePrompts()` in `app/lib/data.ts`, plus a CLI simulation tool:

1. **Recency suppression** — Exclude prompts shown in the last 4 days from the candidate pool
2. **Better PRNG** — Replace `cyrb128`/`mulberry32` with SHA-256-based random generation
3. **Simulation script** — CLI tool to validate prompt distribution across N days

---

## 1. Recency Suppression

### Behavior
- Before processing profile rules, query `JournalEntry` for the user's entries from the **previous 4 calendar days** (not including today)
- Collect distinct `promptId` values into a `recentPromptIds: Set<string>`
- When filtering each rule's candidate pool, exclude prompts in `recentPromptIds` (in addition to the existing deduplication filter)
- A prompt shown today will not appear again for at least 5 days (today + 4 suppressed)
- Suppression window is defined as a constant: `const RECENCY_SUPPRESSION_DAYS = 4`

### Scope
- **Non-global prompts only.** Global prompts (`isGlobal: true`) are always shown regardless of recency — they are mandatory by design
- **`includeAll` rules are exempt.** If an admin configures a rule as `includeAll`, they expect all prompts in that category every day. Recency suppression does not apply to these rules.
- **Per-user.** Each user's suppression is based on their own journal history

### Date Calculation
- Uses the same timezone-aware `targetDate` already passed to `getActivePrompts()`
- Computes a date range: 4 days before `targetDate` through end of day before `targetDate`
- Queries using `createdAt` with range comparison (not equality on `date` field):
  ```
  WHERE userId = ? AND createdAt >= fourDaysAgoStart AND createdAt < todayStart
  ```
- Uses the `@@index([userId, createdAt])` index added in Phase 3

### Edge Cases
- **New user / no history:** `recentPromptIds` is empty, no suppression — full pool available
- **Pool exhaustion:** If suppression removes all candidates for a rule, fall back to the full unsuppressed pool for that rule. This ensures users always receive prompts rather than seeing an empty journal. This can happen with small categories (fewer prompts than `4 * maxCount`).
- **Skipped days:** Suppression is based on actual entries, not calendar days. If a user skips 3 days, only the 1 day they journaled within the window is suppressed

### Performance
- One additional query per dashboard load
- Query uses `@@index([userId, createdAt])` and returns only `promptId` via `select` (lightweight)

### Change Location
- `app/lib/data.ts`: `getActivePrompts()` function, insert between global prompt fetch and rule processing

---

## 2. Better PRNG

### Current Problem
`mulberry32` is a 32-bit Linear Congruential Generator seeded via `cyrb128` string hash. Small changes in input (consecutive dates) produce correlated early outputs, causing the Fisher-Yates shuffle to select similar items.

### Solution
Replace with SHA-256-based generation using Node's built-in `crypto` module:
- Hash the seed string (`userId-dateStr`) with `crypto.createHash('sha256')`
- Extract random values by reading 4-byte chunks from the 32-byte digest at different offsets
- Each call to `random()` returns a `[0, 1)` float from the next 4-byte chunk
- With 32 bytes, each hash provides 8 random values
- When exhausted, re-hash with an incrementing counter: `sha256(seed + "-" + chunkIndex)` where `chunkIndex` starts at 1 and increments each time a new 32-byte block is needed
- The counter is global across the entire `getActivePrompts()` call (one RNG instance per request)
- This preserves determinism: same seed always produces the same sequence of random values regardless of how many are consumed

### Interface
New function `createSeededRandom(seed: string)` returns a `random()` closure:
- `random()` returns `number` in `[0, 1)`, same as before
- The Fisher-Yates shuffle and count calculation code are unchanged
- Old `cyrb128()` and `mulberry32()` functions are removed

### Change Location
- `app/lib/data.ts`: Replace `cyrb128()` and `mulberry32()` helper functions with `createSeededRandom()`

---

## 3. Simulation Script

### Purpose
Validate prompt distribution across multiple days without waiting. Run once to verify the recency suppression and PRNG changes produce good variety.

### Implementation
- **Script:** `scripts/simulatePrompts.ts`
- **Wrapper:** `scripts/simulatePrompts.sh`

### CLI Interface
```bash
./scripts/simulatePrompts.sh <email> [days]
# email: required, user's email address
# days: optional, number of days to simulate (default 14)

# Examples:
./scripts/simulatePrompts.sh marie@example.com
./scripts/simulatePrompts.sh marie@example.com 21
```

### Output
Prints a table for each simulated day showing:
- Date (YYYY-MM-DD)
- Number of prompts selected
- Prompt titles (truncated if long)
- Repeat indicator: marks any prompt that appeared within the prior 4 days

Prints summary stats: total unique prompts seen, repeat count, pool utilization %.

Exits with code 1 if any repeats are found within the suppression window (usable as a regression check).

### How It Works
- Looks up the user by email to get userId, organizationId, and effective profile IDs
- For each day in the range (today through today + N days):
  - Builds an **in-memory recency set** from the simulation's own prior outputs (not from DB queries). This lets the simulation test recency suppression without writing temporary entries to the database.
  - Calls the prompt selection logic with that date and the in-memory recency set
  - Tracks which prompts were shown on which days
  - Flags repeats within the 4-day window
- The simulation requires `getActivePrompts()` to accept an optional `recentPromptIds` parameter so it can inject the simulated recency set instead of querying the DB

### Wrapper Script (`scripts/simulatePrompts.sh`)
```bash
#!/bin/bash
eval "$(fnm env)" && fnm use
npx tsx scripts/simulatePrompts.ts --email "$1" --days "${2:-14}"
```

Note: `fnm use` (without version) reads from `.node-version` file automatically.

---

## API Change

`getActivePrompts()` gains one new optional parameter:

```typescript
export async function getActivePrompts(
    userId: string,
    organizationId: string,
    userProfileIds: string[] = [],
    dateStr?: string,
    recentPromptIdsOverride?: Set<string>  // NEW: for simulation script
)
```

When `recentPromptIdsOverride` is provided, skip the DB query and use it directly. When omitted (normal dashboard flow), query the DB as described in Section 1.

---

## Determinism Contract Change

The old contract was: **same user + same date = same prompts**

The new contract is: **same user + same date + same recent history = same prompts**

This is a deliberate change. A user who journals on Monday and Tuesday will see different Wednesday prompts than a user who only journaled on Tuesday, because their recency sets differ. Within a single day, the prompts are still stable (multiple page loads return the same set).

---

## What Does NOT Change

- Global prompt behavior (always shown, no recency suppression)
- Profile/rule configuration (admin UI unchanged)
- `includeAll` rules (exempt from recency suppression)
- Database schema (no migrations)
- The `getActivePrompts()` function signature (only additive optional param)

---

## Testing Strategy

1. **Simulation script** — Run for 14+ days against production-like data, verify zero repeats within 4-day windows
2. **Local manual test** — Log in as a test user, check dashboard prompts, verify they differ from yesterday's
3. **Edge case validation** — New user with no history, user with entries on only 1 of the last 4 days, category with fewer prompts than the suppression window, pool exhaustion fallback
