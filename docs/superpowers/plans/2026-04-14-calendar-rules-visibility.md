# Calendar & Rules Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make calendar rule-completion indicators visible and show historical rule status when viewing past days.

**Architecture:** Two independent changes: (1) swap tiny `✓` text for colored dots in CalendarSidebar, (2) thread `targetDate` into `getUserRulesWithStatus` so rules reflect the viewed day, and use `AdminRulesCard` (read-only) for all non-today scenarios.

**Tech Stack:** Next.js App Router, Tailwind CSS, Prisma, TypeScript

---

### Task 1: Replace calendar checkmark characters with colored dots

**Files:**
- Modify: `components/CalendarSidebar.tsx:147-155`

- [ ] **Step 1: Replace daily rule indicator**

In `components/CalendarSidebar.tsx`, replace the daily rule `✓` span (lines 147-150):

```tsx
// OLD
{dailyRule && (
    <span className={`absolute -bottom-1 -right-1 text-[8px] leading-none ${
        dailyRule === 'all' ? 'text-green-400' : 'text-blue-400'
    }`}>✓</span>
)}
```

With a colored dot:

```tsx
{dailyRule && (
    <span className={`absolute -bottom-1 -right-1 w-2 h-2 rounded-full border border-black/50 ${
        dailyRule === 'all' ? 'bg-green-400' : 'bg-blue-400'
    }`} />
)}
```

- [ ] **Step 2: Replace weekly rule indicator**

In the same file, replace the weekly rule `✓` span (lines 152-155):

```tsx
// OLD
{weeklyRule && (
    <span className={`absolute -top-1 -right-1 text-[8px] leading-none ${
        weeklyRule === 'all' ? 'text-yellow-400' : 'text-blue-400'
    }`}>✓</span>
)}
```

With a colored dot:

```tsx
{weeklyRule && (
    <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-black/50 ${
        weeklyRule === 'all' ? 'bg-yellow-400' : 'bg-blue-400'
    }`} />
)}
```

- [ ] **Step 3: Commit**

```bash
git add components/CalendarSidebar.tsx
git commit -m "fix: replace tiny calendar checkmarks with visible colored dots"
```

---

### Task 2: Add date parameter to getUserRulesWithStatus

**Files:**
- Modify: `lib/rules.ts:223`

- [ ] **Step 1: Add optional date parameter**

In `lib/rules.ts`, change the `getUserRulesWithStatus` function signature from:

```ts
export async function getUserRulesWithStatus(userId: string, timezone: string) {
```

To:

```ts
export async function getUserRulesWithStatus(userId: string, timezone: string, dateStr?: string) {
```

- [ ] **Step 2: Use the date when computing period keys**

Inside the same function, on line 262, change:

```ts
const periodKey = getPeriodKey(ruleType, timezone)
```

To:

```ts
const periodKey = getPeriodKey(ruleType, timezone, dateStr ? new Date(dateStr + 'T12:00:00') : undefined)
```

The `T12:00:00` avoids timezone-boundary issues when constructing the Date from a YYYY-MM-DD string.

- [ ] **Step 3: Commit**

```bash
git add lib/rules.ts
git commit -m "feat: add optional date param to getUserRulesWithStatus"
```

---

### Task 3: Wire targetDate into dashboard and update display conditions

**Files:**
- Modify: `app/dashboard/page.tsx:134-137,151-153,358-378`

- [ ] **Step 1: Pass targetDate to getUserRulesWithStatus**

In `app/dashboard/page.tsx`, the `targetDate` variable is computed on line 163. The rules fetch on line 134 happens before `targetDate` is defined. Move the rules fetch after `targetDate` is computed, or restructure slightly.

Change lines 134-137 from:

```ts
const [ruleGroups, ruleCalendar] = await Promise.all([
    getUserRulesWithStatus(targetUserId, timezone),
    getRuleCalendarData(targetUserId, timezone),
])
```

To:

```ts
const today = getTodayForUser(timezone);
const dateParam = typeof params.date === 'string' ? params.date : null;
const isPast = dateParam && dateParam !== today;
const targetDate = isPast ? dateParam! : today;
```

Then remove the duplicate `today`, `dateParam`, `isPast`, `targetDate` declarations from lines 160-163 (they currently read):

```ts
const today = getTodayForUser(timezone);
const dateParam = typeof params.date === 'string' ? params.date : null;
const isPast = dateParam && dateParam !== today;
const targetDate = isPast ? dateParam! : today;
```

Move the rules fetch to after these declarations:

```ts
const [ruleGroups, ruleCalendar] = await Promise.all([
    getUserRulesWithStatus(targetUserId, timezone, targetDate),
    getRuleCalendarData(targetUserId, timezone),
])
```

- [ ] **Step 2: Update display conditions for rules cards**

Change the interactive DailyRulesCard condition (line 358) from:

```tsx
{isViewingSelf && dailyRules.length > 0 && (
```

To:

```tsx
{isViewingSelf && !isPast && dailyRules.length > 0 && (
```

Change the read-only AdminRulesCard condition (line 365) from:

```tsx
{!isViewingSelf && ruleGroups.length > 0 && (
```

To:

```tsx
{(isPast || !isViewingSelf) && ruleGroups.length > 0 && (
```

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat: show historical rule completions for past days and admin views"
```

---

### Task 4: Seed test data — rule completions for past days

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add rule completion seed data**

At the end of `prisma/seed.ts`, before the final `console.log`, add code that creates RuleCompletion records for the test user on past days. This requires knowing the test user and their rule assignments, so query them first.

Add this block before `console.log("Seeding completed successfully.");`:

```ts
// Seed rule completions for past days (test data for calendar/rules visibility)
const testAssignments = await prisma.ruleAssignment.findMany({
    where: { user: { email: 'admin@example.com' } },
    include: { rule: true },
})

if (testAssignments.length > 0) {
    const today = new Date()
    // Create completions for the past 7 days with varying patterns
    for (let daysAgo = 1; daysAgo <= 7; daysAgo++) {
        const date = new Date(today)
        date.setDate(date.getDate() - daysAgo)
        const dateStr = date.toISOString().split('T')[0]

        // Complete some rules (not all) to show partial vs full completion
        const rulesToComplete = daysAgo % 2 === 0
            ? testAssignments // even days: all complete
            : testAssignments.slice(0, Math.ceil(testAssignments.length / 2)) // odd days: partial

        for (const assignment of rulesToComplete) {
            await prisma.ruleCompletion.upsert({
                where: {
                    ruleAssignmentId_periodKey: {
                        ruleAssignmentId: assignment.id,
                        periodKey: dateStr,
                    },
                },
                update: {},
                create: {
                    ruleAssignmentId: assignment.id,
                    userId: assignment.userId,
                    ruleId: assignment.ruleId,
                    periodKey: dateStr,
                    completedAt: date,
                },
            })
        }
    }
    console.log(`Seeded rule completions for ${testAssignments.length} assignments over 7 days.`)
}
```

- [ ] **Step 2: Run the seed**

```bash
npx prisma db seed
```

Expected: "Seeding completed successfully." with the rule completions line.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore: seed rule completion test data for past days"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify calendar dots**

Log in as admin. Look at the calendar sidebar — days with rule completions should show colored dots (green for all-complete, blue for partial) instead of the old tiny checkmarks.

- [ ] **Step 3: Verify historical rules on past days**

Click a past day on the calendar. The Rules card should show as read-only (`AdminRulesCard`) with completions reflecting that specific day's data. Even days should show all rules complete, odd days should show partial.

- [ ] **Step 4: Verify today still has interactive toggles**

Click "Write Today" or navigate to the current day. The `DailyRulesCard` should still appear with interactive toggle buttons.

- [ ] **Step 5: Verify admin viewing another user**

Use the admin user selector to view a different user. The rules card should be read-only regardless of whether it's today or a past day.
