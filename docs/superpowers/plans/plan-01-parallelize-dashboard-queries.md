# Task 1: Parallelize Dashboard Queries

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use `Promise.all()` to run independent database queries concurrently in the dashboard page, reducing total load time.

**Architecture:** The dashboard page currently runs ~8 sequential Prisma queries. Many are independent and can be grouped into `Promise.all()` calls. We restructure the function to identify dependency groups and parallelize within each group.

**Tech Stack:** Next.js 16 App Router, Prisma 6, TypeScript

---

### Files

- Modify: `app/dashboard/page.tsx`

### Context

The current flow in `app/dashboard/page.tsx` (lines 26-151) is:

1. `auth()` — must be first (determines session)
2. `prisma.user.findUnique()` — needs `session.user.email` (line 32)
3. `prisma.user.findUnique()` for target user email — needs `targetUserId` (line 48)
4. `getJournalHistory(targetUserId)` — needs `targetUserId`
5. `getUserStats(targetUserId)` — needs `targetUserId`
6. `prisma.user.findMany()` for admin user list — needs `isAdmin`
7. `getEffectiveProfileIds(targetUserId)` — needs `targetUserId`
8. `getUserTimezone()` — independent
9. `prisma.user.findUnique()` for branding org — needs `currentUserId`
10. `prisma.user.findUnique()` for target org — needs `targetUserId`
11. `getActivePrompts(...)` — needs results from 7 and 10
12. `prisma.user.findUnique()` for sidebar user data — needs `currentUserId`

**Dependency groups after session/user resolution (steps 1-3):**

- **Group A (independent, needs only `targetUserId`):** steps 4, 5, 7, 10
- **Group B (independent, needs only `currentUserId` or `isAdmin`):** steps 6, 8, 9, 12
- **Group C (depends on Group A results):** step 11

---

- [ ] **Step 1: Read the current file and understand the query flow**

Read `app/dashboard/page.tsx` fully. Identify every `await` call and map its dependencies.

- [ ] **Step 2: Create the first parallel group — after targetUserId is known**

After line 50 (where `targetUserId` and `currentUserId` are resolved), replace the sequential calls with:

```typescript
// Parallel Group 1: All queries that only need targetUserId, currentUserId, or isAdmin
const [
    historyDates,
    userStats,
    profileIds,
    allUsers,
    timezone,
    userWithOrg,
    targetUserOrg,
    currentUser
] = await Promise.all([
    getJournalHistory(targetUserId),
    getUserStats(targetUserId),
    getEffectiveProfileIds(targetUserId),
    isAdmin
        ? prisma.user.findMany({ select: { id: true, email: true, name: true }, orderBy: { email: 'asc' } })
        : Promise.resolve([]),
    getUserTimezone(),
    prisma.user.findUnique({
        where: { id: currentUserId },
        select: { organization: true }
    }),
    prisma.user.findUnique({
        where: { id: targetUserId },
        select: { organizationId: true }
    }),
    prisma.user.findUnique({
        where: { id: currentUserId },
        select: {
            name: true,
            email: true,
            groups: { select: { name: true } },
            avatars: { where: { isActive: true }, take: 1, select: { url: true } }
        }
    })
]);
```

- [ ] **Step 3: Keep the existing derived-value lines and the dependent call**

The following lines already exist and should remain UNCHANGED after the `Promise.all` (do not duplicate them):

```typescript
// These lines already exist around lines 65-76 — keep them as-is:
const brandingOrg = userWithOrg?.organization;
const today = getTodayForUser(timezone);
const dateParam = typeof params.date === 'string' ? params.date : null;
const isPast = dateParam && dateParam !== today;
const targetDate = isPast ? dateParam! : today;
```

The `getActivePrompts` call stays sequential since it depends on `profileIds` and `targetUserOrg`:

```typescript
// Replace the old activePrompts block (old lines ~80-91) with:
const activePrompts = await getActivePrompts(
    targetUserId,
    targetUserOrg?.organizationId || session?.user?.organizationId || '',
    profileIds, // was "targetProfileIds" — now uses the Promise.all result
    targetDate
);
```

- [ ] **Step 4: Remove all the old individual await calls that are now in Promise.all**

Specifically delete these old sequential calls (now covered by the `Promise.all`):
- Line 52: `const historyDates = await getJournalHistory(targetUserId);`
- Line 53: `const userStats = await getUserStats(targetUserId);`
- Lines 55-58: `let allUsers = ... if (isAdmin) { allUsers = await prisma.user.findMany(...) }`
- Line 61: `const profileIds = await getEffectiveProfileIds(targetUserId);`
- Line 64: `const timezone = await getUserTimezone()`
- Lines 68-72: `const userWithOrg = await prisma.user.findUnique(...)` and `const brandingOrg = ...`
- Line 81: `const targetUserOrg = await prisma.user.findUnique(...)`
- Line 82: `const targetProfileIds = await getEffectiveProfileIds(targetUserId);` (duplicate — remove entirely)
- Lines 143-151: `const currentUser = await prisma.user.findUnique(...)`

After deletion, derive `brandingOrg` from the `Promise.all` result: `const brandingOrg = userWithOrg?.organization;`

- [ ] **Step 5: Note interaction with Plan 3**

Plan 3 modifies the `ContentComponent = <DailyJournalForm />` line in the `else` branch. If Plan 1 runs first, Plan 3's changes will apply cleanly to Plan 1's result. **Run Plan 1 before Plan 3.**

- [ ] **Step 6: Verify the build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds with no type errors.

- [ ] **Step 7: Verify the dev server loads the dashboard**

Run: `npm run dev &` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard`
Expected: 302 (redirect to login, confirming the page compiles and routes correctly).

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "perf: parallelize independent dashboard queries with Promise.all()

Reduces dashboard load time by running 8 independent Prisma queries
concurrently instead of sequentially. Also removes duplicate call
to getEffectiveProfileIds().

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
