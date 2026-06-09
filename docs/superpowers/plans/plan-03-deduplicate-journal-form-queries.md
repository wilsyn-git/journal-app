# Task 3: Eliminate Duplicate Queries in DailyJournalForm

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `DailyJournalForm` from re-fetching data the parent dashboard page already has, by passing it as props.

**Architecture:** Currently `DailyJournalForm` is a server component that internally calls `auth()`, `getEffectiveProfileIds()`, `getActivePrompts()`, and `getEntriesByDate()`. The parent `app/dashboard/page.tsx` already fetches most of this. We'll convert `DailyJournalForm` to accept props for the data it needs, and move the remaining fetch (`getEntriesByDate` for today) into the parent.

**Tech Stack:** Next.js 16 Server Components, TypeScript, Prisma

---

### Files

- Modify: `components/DailyJournalForm.tsx`
- Modify: `app/dashboard/page.tsx`

### Context

**`DailyJournalForm` currently does (lines 7-21):**
1. `auth()` — already called in parent
2. Resolves `organizationId` from session or Prisma — parent already has this
3. `getEffectiveProfileIds(currentUserId)` — parent already has this
4. `getActivePrompts(...)` — parent already has this as `activePrompts`
5. `getEntriesByDate(currentUserId, todayStr)` — parent does NOT have this for the "today" case

**Solution:** Pass `prompts` and `initialAnswers` directly from the parent. The parent already has `activePrompts`. For today's entries, we add a `getEntriesByDate` call in the parent (only for the today case).

**Intentional behavioral change:** The old `DailyJournalForm` computed "today" using server-local time (`new Date()` with `getFullYear()/getMonth()/getDate()`). The parent dashboard computes "today" using the user's configured timezone via `getUserTimezone()` + `getTodayForUser()`. After this change, both prompt selection and entry fetching will use the timezone-aware date. This is an **improvement** — it fixes a subtle bug where the form could show prompts for the wrong date near timezone boundaries.

---

- [ ] **Step 1: Refactor `DailyJournalForm` to accept props instead of fetching**

Replace the entire file `components/DailyJournalForm.tsx`:

```typescript
import { JournalEditor } from "./JournalEditor"
import { Prompt } from "@prisma/client"

type Props = {
    prompts: Prompt[]
    initialAnswers: Record<string, string>
}

export function DailyJournalForm({ prompts, initialAnswers }: Props) {
    return (
        <JournalEditor prompts={prompts} initialAnswers={initialAnswers} />
    )
}
```

Note: This is no longer an `async` function — it's now a pure pass-through component. It could be inlined entirely, but keeping it preserves the component boundary and import structure.

- [ ] **Step 2: Update the parent dashboard page to pass data as props**

In `app/dashboard/page.tsx`, find the line where `DailyJournalForm` is rendered (approximately line 139):

```typescript
// OLD:
ContentComponent = <DailyJournalForm />

// NEW — fetch today's entries and pass everything:
```

Before the `ContentComponent` assignment block (around line 93), add the today-entries fetch for the "today" case. This should be inside the `else` branch (the case where we show today's form):

```typescript
} else {
    // Fetch today's existing answers to pre-fill the form
    const todayEntries = await getEntriesByDate(targetUserId, today);
    const initialAnswers = todayEntries.reduce((acc, entry) => {
        acc[entry.promptId] = entry.answer;
        return acc;
    }, {} as Record<string, string>);

    ContentComponent = <DailyJournalForm prompts={activePrompts} initialAnswers={initialAnswers} />
}
```

- [ ] **Step 3: Make sure the `getEntriesByDate` import exists in dashboard page**

Verify that `getEntriesByDate` is already imported in `app/dashboard/page.tsx` (it is, on line 6). No change needed.

- [ ] **Step 4: Verify the build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add components/DailyJournalForm.tsx app/dashboard/page.tsx
git commit -m "perf: eliminate duplicate queries in DailyJournalForm

DailyJournalForm no longer fetches auth, profiles, or prompts
internally. The parent dashboard page already has this data and
now passes it as props. Removes 4 redundant database queries
on every dashboard load.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
