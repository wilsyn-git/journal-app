# Task 7: Fix N+1 Query in getActivePrompts

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the N+1 database query pattern in `getActivePrompts()` where each profile rule triggers a separate `prisma.prompt.findMany()` call.

**Architecture:** Currently, lines 115-163 of `app/lib/data.ts` loop over profile rules and issue one `prisma.prompt.findMany()` per rule. We'll batch this into a single query that fetches all candidate prompts for all categories at once, then distribute them to rules in memory.

**Tech Stack:** Prisma 6, TypeScript

---

### Files

- Modify: `app/lib/data.ts` (function `getActivePrompts`, lines 75-178)

---

- [ ] **Step 1: Read the current implementation**

Read `app/lib/data.ts` and understand the `getActivePrompts` function. Key observations:

- Lines 96-106: Fetches profiles with their rules
- Lines 115-163: Loops over each profile's rules, and for each rule:
  - Builds a category filter (line 131-132)
  - Queries `prisma.prompt.findMany()` with that filter (line 138-147)
  - Shuffles and picks from the pool (lines 155-162)
- The `notIn: Array.from(selectedPromptsMap.keys())` exclusion grows with each iteration

- [ ] **Step 2: Collect all category conditions upfront**

Replace the loop with a two-phase approach. First, collect all category IDs and strings from all rules:

```typescript
// After fetching profiles (line 106), collect all category targets
const allCategoryStrings: string[] = [];
const allCategoryIds: string[] = [];

for (const profile of profiles) {
    for (const rule of profile.rules) {
        if (rule.categoryString) allCategoryStrings.push(rule.categoryString);
        if (rule.categoryId) allCategoryIds.push(rule.categoryId);
    }
}
```

- [ ] **Step 3: Fetch all candidate prompts in one query**

Replace the per-rule queries with a single batch query:

```typescript
// Single query for ALL candidate non-global prompts matching ANY rule's category
const allCandidatePrompts = allCategoryStrings.length > 0 || allCategoryIds.length > 0
    ? await prisma.prompt.findMany({
        where: {
            organizationId,
            isActive: true,
            isGlobal: false,
            OR: [
                ...(allCategoryStrings.length > 0
                    ? [{ categoryString: { in: allCategoryStrings } }]
                    : []),
                ...(allCategoryIds.length > 0
                    ? [{ categoryId: { in: allCategoryIds } }]
                    : []),
            ],
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    })
    : [];

// Index by category for fast lookup
const promptsByCategoryString = new Map<string, typeof allCandidatePrompts>();
const promptsByCategoryId = new Map<string, typeof allCandidatePrompts>();

allCandidatePrompts.forEach(p => {
    if (p.categoryString) {
        const list = promptsByCategoryString.get(p.categoryString) || [];
        list.push(p);
        promptsByCategoryString.set(p.categoryString, list);
    }
    if (p.categoryId) {
        const list = promptsByCategoryId.get(p.categoryId) || [];
        list.push(p);
        promptsByCategoryId.set(p.categoryId, list);
    }
});
```

- [ ] **Step 4: Rewrite the rule loop to use in-memory pools**

Replace the existing loop body (lines 115-163) with one that draws from the pre-fetched pools instead of querying:

```typescript
for (const profile of profiles) {
    for (const rule of profile.rules) {
        let count = 0;
        if (!rule.includeAll) {
            const range = rule.maxCount - rule.minCount + 1;
            count = Math.floor(random() * range) + rule.minCount;
            if (count <= 0) continue;
        }

        // Build pool from pre-fetched data, excluding already-selected prompts
        let pool: typeof allCandidatePrompts = [];

        if (rule.categoryString) {
            pool = [...(promptsByCategoryString.get(rule.categoryString) || [])];
        } else if (rule.categoryId) {
            pool = [...(promptsByCategoryId.get(rule.categoryId) || [])];
        } else {
            continue; // No target defined
        }

        // Exclude already selected
        pool = pool.filter(p => !selectedPromptsMap.has(p.id));

        if (rule.includeAll) {
            pool.forEach(p => selectedPromptsMap.set(p.id, p));
        } else {
            // Fisher-Yates shuffle with deterministic random
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            const picked = pool.slice(0, count);
            picked.forEach(p => selectedPromptsMap.set(p.id, p));
        }
    }
}
```

- [ ] **Step 5: Verify the build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/data.ts
git commit -m "perf: fix N+1 query in getActivePrompts

Replaces per-rule database queries with a single batch query that
fetches all candidate prompts at once. Rules now draw from an
in-memory pool instead of hitting the database individually.
Reduces queries from N+1 to 2 (globals + candidates).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
