# Prompt Duplication Bug Analysis

## Problem

Users are seeing nearly identical journal prompts on consecutive days (4 out of 5 prompts repeated). The recency suppression mechanism (added 2026-03-21) should prevent this but is not working correctly.

## Root Cause: UTC Date Boundary Mismatch

**File:** `app/lib/data.ts`, lines 94–108

The recency suppression query constructs its date window using **UTC midnight**, but journal entries store `createdAt` as UTC timestamps. For users in western timezones who journal in the evening, their entries' UTC timestamps cross the UTC midnight boundary and fall **outside** the recency window.

### How It Works (Broken)

```typescript
// Parses "2026-03-23" as 2026-03-23T00:00:00.000Z (UTC midnight)
const today = new Date(dateStr || new Date().toISOString().split('T')[0])
const suppressionStart = new Date(today)
suppressionStart.setDate(suppressionStart.getDate() - RECENCY_SUPPRESSION_DAYS)

const recentEntries = await prisma.journalEntry.findMany({
    where: {
        userId,
        createdAt: {
            gte: suppressionStart,  // 4 days ago at UTC midnight
            lt: today               // today at UTC midnight  <-- THE BUG
        }
    },
    select: { promptId: true },
    distinct: ['promptId']
})
```

### Example Scenario

1. Wife journals at **9:40 PM Eastern** on March 22
2. Entry `createdAt` = `2026-03-23T01:40:00Z` (9:40 PM ET = 1:40 AM UTC next day)
3. Next day (March 23), the recency query checks: `createdAt < 2026-03-23T00:00:00Z`
4. Yesterday's entry (`01:40 AM UTC March 23`) is **NOT** less than UTC midnight March 23
5. **Result:** Yesterday's prompts are not in the recency set → not suppressed → appear again

### Who Is Affected

Anyone journaling after these local times (when UTC rolls over to the next day):

| Timezone | Affected After |
|----------|---------------|
| Eastern (ET) | 8:00 PM |
| Central (CT) | 7:00 PM |
| Mountain (MT) | 6:00 PM |
| Pacific (PT) | 5:00 PM |

## Recommended Fix

Extend the upper bound of the recency query by 1 day to capture entries that cross the UTC midnight boundary:

```typescript
const today = new Date(dateStr || new Date().toISOString().split('T')[0])

// Fix: extend upper bound to capture entries after UTC midnight
const upperBound = new Date(today)
upperBound.setDate(upperBound.getDate() + 1)

const suppressionStart = new Date(today)
suppressionStart.setDate(suppressionStart.getDate() - RECENCY_SUPPRESSION_DAYS)

const recentEntries = await prisma.journalEntry.findMany({
    where: {
        userId,
        createdAt: {
            gte: suppressionStart,
            lt: upperBound  // was: lt: today
        }
    },
    select: { promptId: true },
    distinct: ['promptId']
})
```

### Why This Is Safe

Including "today's" already-answered prompts in the recency set is actually beneficial — it prevents re-showing prompts the user has already answered today if they reload the page after answering some prompts.

## Verification

1. Run the simulation script: `./scripts/simulatePrompts.sh <email> 21`
2. Manually verify that entries with `createdAt` timestamps after UTC midnight are now included in the recency set
3. Test with a user in a western timezone journaling in the evening
