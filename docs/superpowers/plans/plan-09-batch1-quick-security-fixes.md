# Batch 1: Quick Security & Correctness Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 low-effort, high-impact issues from the code review (#9, #12, #13, #17, #28).

**Architecture:** All backend/config changes. No UI or user-facing behavior changes.

**Tech Stack:** Next.js 16, TypeScript, Prisma, Zod

---

### Task 1: Verify .env is in .gitignore (Issue #9)

**Files:**
- Check: `.gitignore`

- [ ] **Step 1: Check .gitignore**

```bash
grep "\.env" .gitignore
```

Expected: `.env` is listed.

- [ ] **Step 2: Check git history**

```bash
git log --all --full-history -- .env
```

Expected: No commits found (file was never tracked). If commits ARE found, STOP and report — secrets need rotation.

- [ ] **Step 3: Close issue if clean**

If both checks pass, close #9 with a comment confirming the result. No code change needed.

---

### Task 2: Add answer length validation (Issue #12)

**Files:**
- Modify: `app/actions/journal.ts`
- Modify: `app/api/v1/entries/route.ts`
- Modify: `app/api/v1/entries/batch/route.ts`

- [ ] **Step 1: Add length check to saveJournalResponse**

In `app/actions/journal.ts`, in `saveJournalResponse`, add validation after the function params are destructured (before the timezone lookup):

```typescript
if (answer.length > 10000) {
    return { error: "Answer exceeds maximum length" }
}
```

- [ ] **Step 2: Add .max() to API entry schema**

In `app/api/v1/entries/route.ts`, update the Zod schema:

```typescript
const entrySchema = z.object({
  promptId: z.string().uuid(),
  answer: z.string().max(10000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
```

- [ ] **Step 3: Add .max() to batch API schema**

In `app/api/v1/entries/batch/route.ts`, update the Zod schema:

```typescript
const batchSchema = z.object({
  entries: z.array(
    z.object({
      promptId: z.string().uuid(),
      answer: z.string().max(10000),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
  ).max(50),
})
```

Note: Also adding `.max(50)` on the entries array (Issue #19 from Batch 2 — free win).

- [ ] **Step 4: Add length check to submitEntry**

In `app/actions/journal.ts`, in `submitEntry`, add validation inside the loop before creating:

```typescript
for (const entry of entries) {
    if (entry.answer.length > 10000) continue // skip oversized entries
    ...
}
```

- [ ] **Step 5: Commit**

```bash
git add app/actions/journal.ts app/api/v1/entries/route.ts app/api/v1/entries/batch/route.ts
git commit -m "fix: add answer length validation and batch size limits (closes #12, #19)"
```

---

### Task 3: Expand auth middleware to protect all app routes (Issue #13)

**Files:**
- Modify: `auth.config.ts`

- [ ] **Step 1: Read current auth config**

Read `auth.config.ts` to understand the current `authorized` callback structure.

- [ ] **Step 2: Expand the authorized callback**

The callback should protect all routes except:
- `/login`
- `/forgot-password`
- `/reset-password` (and sub-paths)
- `/api/v1/*` (uses JWT auth, not session)
- Static assets and public files (`/icon.png`, `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml`)

Replace the existing authorized logic so unauthenticated requests to any other path are redirected to `/login`.

- [ ] **Step 3: Verify login page still works**

Run dev server and confirm:
1. `/login` is accessible without auth
2. `/forgot-password` is accessible without auth
3. `/dashboard` redirects to `/login` when not authenticated
4. `/settings` redirects to `/login` when not authenticated
5. `/admin` redirects to `/login` when not authenticated

- [ ] **Step 4: Commit**

```bash
git add auth.config.ts
git commit -m "fix: expand auth middleware to protect all app routes (closes #13)"
```

---

### Task 4: Fix seedDate UTC fallback (Issue #28)

**Files:**
- Modify: `app/lib/data.ts`

- [ ] **Step 1: Read current code around line 134**

Find the line:
```typescript
const seedDate = dateStr || new Date().toISOString().split('T')[0];
```

- [ ] **Step 2: Fix the fallback**

The `todayStr` variable is computed inside the recency suppression `else` block (line 96) and is scoped to that block. We need to either:
- Hoist the timezone/todayStr computation above the recency block, or
- Recompute it for the seed using the same timezone logic

Preferred approach — hoist the timezone lookup so both the recency block and seedDate can use it:

```typescript
// Move these BEFORE the recency suppression block:
const timezone = await getUserTimezoneById(userId)
const todayStr = dateStr || getTodayForUser(timezone)

// Then in the recency block, use todayStr instead of recomputing
// And for seedDate:
const seedDate = todayStr
```

This ensures the seed and suppression always reference the same date.

- [ ] **Step 3: Verify no double-lookup of timezone**

Make sure `getUserTimezoneById` is only called once per invocation of `getActivePrompts`, not once for recency and once for seed.

- [ ] **Step 4: Commit**

```bash
git add app/lib/data.ts
git commit -m "fix: use timezone-aware date for PRNG seed fallback (closes #28)"
```

---

### Task 5: Fix endOfDayInTimezone for DST transitions (Issue #17)

**Files:**
- Modify: `lib/timezone.ts`

- [ ] **Step 1: Replace endOfDayInTimezone**

Replace the current implementation:

```typescript
export function endOfDayInTimezone(dateStr: string, timezone: string): Date {
    const start = startOfDayInTimezone(dateStr, timezone)
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
}
```

With:

```typescript
export function endOfDayInTimezone(dateStr: string, timezone: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number)
    const nextDate = new Date(Date.UTC(year, month - 1, day + 1))
    const nextDateStr = nextDate.toISOString().split('T')[0]
    const nextDayStart = startOfDayInTimezone(nextDateStr, timezone)
    return new Date(nextDayStart.getTime() - 1)
}
```

- [ ] **Step 2: Verify with DST test cases**

Run a test script:
```typescript
// US 2026 spring forward: March 8 (clocks skip 2am → 3am, day is 23 hours)
// US 2026 fall back: November 1 (clocks repeat 1am → 2am, day is 25 hours)

endOfDayInTimezone("2026-03-08", "America/New_York")
// Should be 1ms before midnight March 9 Eastern = 2026-03-09T04:59:59.999Z (EDT)

endOfDayInTimezone("2026-11-01", "America/New_York")
// Should be 1ms before midnight November 2 Eastern = 2026-11-02T04:59:59.999Z (EST)

// Normal day for comparison
endOfDayInTimezone("2026-06-15", "America/New_York")
// Should be 2026-06-16T03:59:59.999Z (EDT)
```

- [ ] **Step 3: Commit**

```bash
git add lib/timezone.ts
git commit -m "fix: handle DST transitions in endOfDayInTimezone (closes #17)"
```

---

### Task 6: Build check and local verification

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No new errors.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Start dev server for manual testing**

```bash
npm run dev
```

User will test at localhost:3000 before approving push to GitHub and prod deployment.
