# Heatmap Date Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/stats` contribution heatmap interactive — clicking an activity day opens a centered modal showing that day's journal entries (type-aware), habits completed, and a summary, org-scoped and timezone-correct.

**Architecture:** Extract the existing `EntryCard` renderer into a shared file so the modal matches the dashboard's day view. Add a pure `buildDayDetails` transform (unit-tested in-memory per the codebase's `ruleCalendarData.test.ts` convention) plus a thin `getDailyJournalDetails` server action (auth + timezone + Prisma) that calls it. A new `DayDetailModal` renders the result; `ContributionHeatmap` fetches on click. Includes reconciling N3.10 (legend).

**Tech Stack:** Next.js 16 (RSC + server actions), Prisma/SQLite, TypeScript, Tailwind v4, Vitest + React Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-09-heatmapDateExplorer-design.md`

---

## File Structure

- **New** `components/journal/EntryCard.tsx` — `EntryCard` + `formatAnswer` + `EntryWithPrompt` type, moved verbatim from `PastJournalView.tsx`. One responsibility: render one entry's prompt+answer, type-aware.
- **Modify** `components/PastJournalView.tsx` — import `EntryCard`/`EntryWithPrompt` from the new file; delete the local copies and the now-unused `PROMPT_TYPES` import.
- **New** `lib/dayDetails.ts` — pure `buildDayDetails(entries, ruleTitles, dateStr)` + `DayDetails`/`DayEntry` types. No Prisma, no React. Unit-testable.
- **New** `tests/lib/dayDetails.test.ts` — unit tests for `buildDayDetails`.
- **Modify** `app/actions/journal.ts` — add `getDailyJournalDetails` server action.
- **New** `components/stats/DayDetailModal.tsx` — centered modal rendering a `DayDetails`.
- **New** `tests/components/dayDetailModal.test.tsx` — component test (loading/loaded/empty + close handlers).
- **Modify** `components/ContributionHeatmap.tsx` — `userId` prop, clickable activity cells, fetch + render modal.
- **Modify** `app/stats/page.tsx` — pass `userId={targetUserId}`; reconcile N3.10.
- **Modify** `docs/newissues.md` — annotate N3.10 outcome.

---

## Task 1: Extract `EntryCard` into a shared file

**Files:**
- Create: `components/journal/EntryCard.tsx`
- Modify: `components/PastJournalView.tsx`
- Safety-net test (existing): `tests/components/pastJournalView.test.tsx`

- [ ] **Step 1: Run the existing PastJournalView test to confirm a green baseline**

Run: `npx vitest run tests/components/pastJournalView.test.tsx`
Expected: PASS (this test renders `PastJournalView` and exercises entry rendering — it is our refactor safety net).

- [ ] **Step 2: Create `components/journal/EntryCard.tsx`**

```tsx
import { PROMPT_TYPES } from '@/lib/promptConstants'

export type EntryWithPrompt = {
    id: string;
    answer: string;
    isLiked: boolean;
    prompt: {
        content: string;
        type: string;
    }
}

export function EntryCard({ entry }: { entry: EntryWithPrompt }) {
    return (
        <div className="glass-card p-6 rounded-xl border border-white/10 relative group">
            <div className="flex justify-between items-start mb-3">
                <h3 className="text-sm font-medium text-primary uppercase tracking-wide opacity-80">{entry.prompt.content}</h3>
            </div>

            <div className="text-lg text-gray-200 leading-relaxed whitespace-pre-wrap">
                {formatAnswer(entry.answer, entry.prompt.type)}
            </div>
        </div>
    )
}

function formatAnswer(answer: string, type: string) {
    if (type === PROMPT_TYPES.CHECKBOX || type === PROMPT_TYPES.RADIO) {
        try {
            if (answer.startsWith('[') || answer.startsWith('{')) {
                const parsed = JSON.parse(answer);
                if (Array.isArray(parsed)) return parsed.join(', ');
                return parsed;
            }
        } catch {
            // ignore
        }
    }
    return answer;
}
```

- [ ] **Step 3: Rewire `PastJournalView.tsx` to use the shared `EntryCard`**

In `components/PastJournalView.tsx`:
1. Delete the local `type EntryWithPrompt = { ... }` block (lines ~8-15).
2. Delete the local `function EntryCard(...) { ... }` (lines ~56-69).
3. Delete the local `function formatAnswer(...) { ... }` (lines ~132-145).
4. Remove the import `import { PROMPT_TYPES } from '@/lib/promptConstants'` (now unused here).
5. Add at the top with the other imports:
```tsx
import { EntryCard, type EntryWithPrompt } from '@/components/journal/EntryCard'
```
Leave `Props` (which uses `EntryWithPrompt[]`), `PastJournalView`, `AdminDayLike`, `ReadOnlyDayLike`, and `HeartIcon` otherwise unchanged.

- [ ] **Step 4: Run the safety-net test + lint to confirm no regression**

Run: `npx vitest run tests/components/pastJournalView.test.tsx`
Expected: PASS (unchanged behavior).
Run: `npx eslint components/PastJournalView.tsx components/journal/EntryCard.tsx`
Expected: no errors (in particular, no "unused PROMPT_TYPES" — confirms step 3.4).

- [ ] **Step 5: Commit**

```bash
git add components/journal/EntryCard.tsx components/PastJournalView.tsx
git commit -m "refactor(journal): extract EntryCard into shared component"
```

---

## Task 2: Pure `buildDayDetails` transform + unit tests

**Files:**
- Create: `lib/dayDetails.ts`
- Test: `tests/lib/dayDetails.test.ts`

Rationale for a separate pure module: `app/actions/journal.ts` is a `'use server'` file, so it may only export async server actions — the pure helper must live elsewhere. This mirrors the codebase convention (see `tests/lib/ruleCalendarData.test.ts`): extract the pure transform and unit-test it in-memory rather than mocking Prisma.

- [ ] **Step 1: Write the failing test `tests/lib/dayDetails.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildDayDetails, type DayEntry } from '@/lib/dayDetails'

function entry(over: Partial<DayEntry> = {}): DayEntry {
  return { id: 'e1', answer: 'hello world', isLiked: false, prompt: { content: 'Q', type: 'TEXT' }, ...over }
}

describe('buildDayDetails', () => {
  it('passes entries through and carries the date', () => {
    const e = entry()
    const result = buildDayDetails([e], [], '2026-04-14')
    expect(result.date).toBe('2026-04-14')
    expect(result.entries).toEqual([e])
  })

  it('maps rule titles into rules and counts habits', () => {
    const result = buildDayDetails([], ['Morning workout', 'No phone before noon'], '2026-04-14')
    expect(result.rules).toEqual(['Morning workout', 'No phone before noon'])
  })

  it('summary counts entries and total words across answers', () => {
    const result = buildDayDetails(
      [entry({ id: 'a', answer: 'one two three' }), entry({ id: 'b', answer: 'four' })],
      [],
      '2026-04-14',
    )
    expect(result.summary.entryCount).toBe(2)
    expect(result.summary.wordCount).toBe(4)
  })

  it('ignores empty/whitespace answers in the word count', () => {
    const result = buildDayDetails(
      [entry({ id: 'a', answer: '   ' }), entry({ id: 'b', answer: 'solo' })],
      [],
      '2026-04-14',
    )
    expect(result.summary.entryCount).toBe(2)
    expect(result.summary.wordCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/dayDetails.test.ts`
Expected: FAIL — cannot resolve `@/lib/dayDetails` / `buildDayDetails is not a function`.

- [ ] **Step 3: Implement `lib/dayDetails.ts`**

```ts
export type DayEntry = {
    id: string
    answer: string
    isLiked: boolean
    prompt: { content: string; type: string }
}

export type DayDetails = {
    date: string
    entries: DayEntry[]
    rules: string[]
    summary: { entryCount: number; wordCount: number }
}

/** Pure transform from raw day data into the shape the modal renders. */
export function buildDayDetails(entries: DayEntry[], ruleTitles: string[], dateStr: string): DayDetails {
    const wordCount = entries.reduce((sum, e) => {
        const trimmed = e.answer.trim()
        return sum + (trimmed ? trimmed.split(/\s+/).length : 0)
    }, 0)

    return {
        date: dateStr,
        entries,
        rules: ruleTitles,
        summary: { entryCount: entries.length, wordCount },
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/dayDetails.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/dayDetails.ts tests/lib/dayDetails.test.ts
git commit -m "feat(stats): add pure buildDayDetails transform with unit tests"
```

---

## Task 3: `getDailyJournalDetails` server action

**Files:**
- Modify: `app/actions/journal.ts`

Verification for this task is lint + build (the testable logic lives in `buildDayDetails`, already covered; auth uses the established `requireAdminForUser` guard; the tz window uses the same `createdAt` + `startOfDayInTimezone`/`endOfDayInTimezone` helpers that `app/lib/analytics.ts` buckets the heatmap with).

- [ ] **Step 1: Add the import for the org-scoped admin guard and the pure transform**

At the top of `app/actions/journal.ts`, alongside the existing imports (which already include `auth`, `prisma`, `resolveUserId`, `getUserTimezoneById`, `startOfDayInTimezone`, `endOfDayInTimezone`), add:

```ts
import { requireAdminForUser } from '@/lib/adminGuards'
import { buildDayDetails, type DayDetails } from '@/lib/dayDetails'
```

- [ ] **Step 2: Append the `getDailyJournalDetails` action to `app/actions/journal.ts`**

```ts
/**
 * Returns one day's journal entries, completed daily habits, and a summary for
 * the heatmap date explorer. Keyed by `createdAt` in the target user's timezone
 * so the result matches exactly the entries that colored the clicked cell
 * (see app/lib/analytics.ts bucketing). Org-scoped: inspecting another user
 * requires an admin in that user's org.
 */
export async function getDailyJournalDetails(targetUserId: string, dateStr: string): Promise<DayDetails> {
    const session = await auth()
    if (!session?.user) throw new Error("Unauthorized")

    const currentUserId = await resolveUserId(session)
    if (!currentUserId) throw new Error("User not found")

    let effectiveTargetId = currentUserId
    if (targetUserId && targetUserId !== currentUserId) {
        // Throws / redirects unless the session is an admin in the target user's org.
        await requireAdminForUser(targetUserId)
        effectiveTargetId = targetUserId
    }

    const timezone = await getUserTimezoneById(effectiveTargetId)
    const start = startOfDayInTimezone(dateStr, timezone)
    const end = endOfDayInTimezone(dateStr, timezone)

    const [entries, ruleCompletions] = await Promise.all([
        prisma.journalEntry.findMany({
            where: { userId: effectiveTargetId, createdAt: { gte: start, lte: end } },
            select: {
                id: true,
                answer: true,
                isLiked: true,
                prompt: { select: { content: true, type: true } },
            },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.ruleCompletion.findMany({
            where: { userId: effectiveTargetId, periodKey: dateStr },
            select: { rule: { select: { title: true } } },
        }),
    ])

    return buildDayDetails(entries, ruleCompletions.map(rc => rc.rule.title), dateStr)
}
```

- [ ] **Step 3: Lint + build**

Run: `npx eslint app/actions/journal.ts`
Expected: no errors.
Run: `npm run build`
Expected: green (the action's return type `DayDetails` and the entry `select` shape match `DayEntry`).

- [ ] **Step 4: Commit**

```bash
git add app/actions/journal.ts
git commit -m "feat(stats): add org-scoped, timezone-aware getDailyJournalDetails action"
```

---

## Task 4: `DayDetailModal` component + test

**Files:**
- Create: `components/stats/DayDetailModal.tsx`
- Test: `tests/components/dayDetailModal.test.tsx`

- [ ] **Step 1: Write the failing component test `tests/components/dayDetailModal.test.tsx`**

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { DayDetailModal } from '@/components/stats/DayDetailModal'
import type { DayDetails } from '@/lib/dayDetails'

const details: DayDetails = {
  date: '2026-04-14',
  entries: [{ id: 'e1', answer: 'slept well', isLiked: false, prompt: { content: 'How are you?', type: 'TEXT' } }],
  rules: ['Morning workout'],
  summary: { entryCount: 1, wordCount: 2 },
}

afterEach(() => cleanup())

describe('DayDetailModal', () => {
  it('shows a loading state', () => {
    render(<DayDetailModal date="2026-04-14" details={null} loading onClose={() => {}} />)
    expect(screen.getByTestId('day-modal-loading')).toBeInTheDocument()
  })

  it('renders entries, habits, and summary when loaded', () => {
    render(<DayDetailModal date="2026-04-14" details={details} loading={false} onClose={() => {}} />)
    expect(screen.getByText('How are you?')).toBeInTheDocument()
    expect(screen.getByText('slept well')).toBeInTheDocument()
    expect(screen.getByText('Morning workout')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<DayDetailModal date="2026-04-14" details={details} loading={false} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<DayDetailModal date="2026-04-14" details={details} loading={false} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/dayDetailModal.test.tsx`
Expected: FAIL — cannot resolve `@/components/stats/DayDetailModal`.

- [ ] **Step 3: Implement `components/stats/DayDetailModal.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { EntryCard } from '@/components/journal/EntryCard'
import type { DayDetails } from '@/lib/dayDetails'

type Props = {
    date: string
    details: DayDetails | null
    loading: boolean
    onClose: () => void
}

export function DayDetailModal({ date, details, loading, onClose }: Props) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const displayDate = new Date(`${date}T00:00:00`).toLocaleDateString('default', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={displayDate}
                className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-[rgba(16,16,20,0.98)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    aria-label="Close"
                    onClick={onClose}
                    className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
                >
                    ✕
                </button>

                <div className="px-5 py-4 border-b border-white/10">
                    <div className="text-base font-bold text-white">{displayDate}</div>
                    {details && (
                        <div className="flex gap-4 mt-2 text-xs text-gray-400">
                            <span><b className="text-white">{details.summary.entryCount}</b> entries</span>
                            <span><b className="text-white">{details.summary.wordCount}</b> words</span>
                            <span><b className="text-white">{details.rules.length}</b> habits</span>
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div data-testid="day-modal-loading" className="py-12 text-center text-gray-400 text-sm">
                            Loading…
                        </div>
                    ) : !details || details.entries.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">Nothing logged this day.</div>
                    ) : (
                        <>
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Journal</div>
                            <div className="space-y-4">
                                {details.entries.map(e => <EntryCard key={e.id} entry={e} />)}
                            </div>
                            {details.rules.length > 0 && (
                                <>
                                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-6 mb-2">Habits completed</div>
                                    <ul className="space-y-1.5">
                                        {details.rules.map((title, i) => (
                                            <li key={i} className="flex items-center gap-2 text-sm text-gray-200">
                                                <span className="text-green-400">✓</span> {title}
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/dayDetailModal.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/stats/DayDetailModal.tsx tests/components/dayDetailModal.test.tsx
git commit -m "feat(stats): add DayDetailModal for the heatmap date explorer"
```

---

## Task 5: Wire interactivity into `ContributionHeatmap`

**Files:**
- Modify: `components/ContributionHeatmap.tsx`

- [ ] **Step 1: Add imports, the `userId` prop, and modal state**

In `components/ContributionHeatmap.tsx`:

1. Update the React import (line 3) to include `useState`:
```tsx
import { useMemo, useRef, useEffect, useState } from 'react'
```
2. Add imports below the existing imports:
```tsx
import { getDailyJournalDetails } from '@/app/actions/journal'
import { DayDetailModal } from '@/components/stats/DayDetailModal'
import type { DayDetails } from '@/lib/dayDetails'
```
3. Add `userId` to the `Props` type:
```tsx
    userId?: string // When set, cells are clickable and open the day-detail modal for this user
```
4. Add `userId` to the destructured params in the function signature:
```tsx
export function ContributionHeatmap({ data, ruleData, weeksHistory = 52, showLegend = true, scrollable = true, stats, userId }: Props) {
```

- [ ] **Step 2: Add modal state and the click handler (inside the component, after the `scrollRef`/`useEffect` block, before `return (`)**

```tsx
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [details, setDetails] = useState<DayDetails | null>(null)
    const [loading, setLoading] = useState(false)

    const openDay = async (dateStr: string) => {
        setSelectedDate(dateStr)
        setDetails(null)
        setLoading(true)
        try {
            setDetails(await getDailyJournalDetails(userId ?? '', dateStr))
        } catch (err) {
            console.error('Failed to load day details:', err)
            setSelectedDate(null) // close on hard failure rather than hang on a spinner
        } finally {
            setLoading(false)
        }
    }

    const closeDay = () => { setSelectedDate(null); setDetails(null) }
```

- [ ] **Step 3: Make activity cells interactive**

A cell is interactive when `userId` is set AND it has activity (`day.value > 0` or it has rule data). Apply to BOTH cell branches (the split rule/journal cell and the plain journal cell). Add a small helper just above the `return (` of the inner cell map, then use it.

For the **split cell** branch (currently the `if (hasRuleData)` block), change its wrapper `<div>` to add interactivity. Replace the opening wrapper:
```tsx
                                                <div
                                                    key={dIdx}
                                                    className={`w-3.5 h-3.5 rounded-[2px] relative overflow-hidden${todayRing}`}
                                                    title={`${day.date}: ${day.value} avg words | Rules: ${ruleStatus}`}
                                                >
```
with:
```tsx
                                                <div
                                                    key={dIdx}
                                                    className={`w-3.5 h-3.5 rounded-[2px] relative overflow-hidden transition-all${todayRing}${userId ? ' cursor-pointer hover:ring-2 hover:ring-white/60' : ''}`}
                                                    title={`${day.date}: ${day.value} avg words | Rules: ${ruleStatus}`}
                                                    {...(userId ? { role: 'button', tabIndex: 0,
                                                        onClick: () => openDay(day.date),
                                                        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDay(day.date) } },
                                                    } : {})}
                                                >
```

For the **plain journal cell** branch (the final `return ( <div ... title=... /> )`), it is interactive only when `day.value > 0`. Replace:
```tsx
                                        return (
                                            <div
                                                key={dIdx}
                                                className={`w-3.5 h-3.5 rounded-[2px] transition-colors ${getColor(day.value)}${todayRing}`}
                                                title={`${day.date}: ${day.value} avg words`}
                                            />
                                        )
```
with:
```tsx
                                        const clickable = !!userId && day.value > 0
                                        return (
                                            <div
                                                key={dIdx}
                                                className={`w-3.5 h-3.5 rounded-[2px] transition-all ${getColor(day.value)}${todayRing}${clickable ? ' cursor-pointer hover:ring-2 hover:ring-white/60' : ''}`}
                                                title={`${day.date}: ${day.value} avg words`}
                                                {...(clickable ? { role: 'button', tabIndex: 0,
                                                    onClick: () => openDay(day.date),
                                                    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDay(day.date) } },
                                                } : {})}
                                            />
                                        )
```

- [ ] **Step 4: Render the modal**

Wrap the component's return so the modal renders alongside the existing markup. Change the outermost `return ( <div className="flex flex-col gap-3"> ... </div> )` to include the modal at the end, just before the outer closing `</div>`:
```tsx
            {selectedDate && (
                <DayDetailModal date={selectedDate} details={details} loading={loading} onClose={closeDay} />
            )}
```

- [ ] **Step 5: Lint + build**

Run: `npx eslint components/ContributionHeatmap.tsx`
Expected: no errors.
Run: `npm run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add components/ContributionHeatmap.tsx
git commit -m "feat(stats): clickable heatmap cells open the day-detail modal"
```

---

## Task 6: Pass `userId` from the stats page + reconcile N3.10

**Files:**
- Modify: `app/stats/page.tsx`
- Modify: `docs/newissues.md`

- [ ] **Step 1: Pass `targetUserId` into the heatmap**

In `app/stats/page.tsx`, the heatmap is rendered (~line 138) as:
```tsx
<ContributionHeatmap data={stats.heatmap} ruleData={ruleCalendar.dailyStatus} weeksHistory={46} />
```
`targetUserId` is already computed earlier in the file (~line 41). Add the prop:
```tsx
<ContributionHeatmap data={stats.heatmap} ruleData={ruleCalendar.dailyStatus} weeksHistory={46} userId={targetUserId} />
```

- [ ] **Step 2: Build, then verify the legend on `/stats` (N3.10)**

Run: `npm run build` (expected: green), then start the dev server and open `/stats`.

N3.10 was filed against older code; the current `ContributionHeatmap` (lines ~219-244) already renders a Journal/Rules legend when `showLegend` (default `true`) and already includes rule status in the cell `title`. Observe `/stats`:
- **If the legend is visible** (the common expected case): N3.10 is already resolved by existing code — proceed to Step 3 to annotate the tracker. No code change.
- **If the legend is missing/clipped:** the only plausible cause is the stats-page wrapper `<div className="... overflow-x-auto custom-scrollbar min-h-[160px] flex flex-col justify-center">` clipping the footer. Minimal fix: the heatmap's footer already lives outside the internal scroll area, so add `items-start` is not needed — instead confirm the footer is inside the outer `flex flex-col`. If clipped, change the stats-page wrapper to allow the footer to show by removing `justify-center` (which can vertically hide the footer when content exceeds `min-h`): replace `min-h-[160px] flex flex-col justify-center` with `min-h-[160px]`. Re-verify the legend shows. Do not alter legend content.

- [ ] **Step 3: Annotate N3.10 in `docs/newissues.md`**

Update the `### N3.10 [LOW] Heatmap legend prop exists but renders nothing` entry to reflect the outcome. Append one line under it:
- If already resolved: `**Resolved (2026-06-09, feat/heatmapDateExplorer):** legend + enriched cell title already render in current code; verified on /stats.`
- If a fix was applied: `**Resolved (2026-06-09, feat/heatmapDateExplorer):** unclipped the heatmap footer on /stats so the legend is visible.`

- [ ] **Step 4: Commit**

```bash
git add app/stats/page.tsx docs/newissues.md
git commit -m "feat(stats): enable heatmap date explorer on stats page; reconcile N3.10"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite + build**

Run: `npm test`
Expected: all green — the prior 63 tests plus the new `dayDetails` (4) and `dayDetailModal` (4) tests; `pastJournalView` still green.
Run: `npm run build`
Expected: green.

- [ ] **Step 2: Visual verification on the dev server (`npm run dev`, `/stats`)**

Confirm, logged in as an account with journal data:
- Hovering an activity cell shows a ring + pointer cursor; empty/future cells show neither.
- Clicking an activity cell opens the centered modal with the correct date, summary (entries/words/habits), entries rendered by type, and any habits completed.
- ✕, `Escape`, and backdrop click all close the modal.
- As an admin, selecting another user in the Inspect-User dropdown and clicking that user's heatmap cell shows that user's day (org-scoped).
- The legend is visible under the heatmap.

- [ ] **Step 3: Report results for user review**

Summarize the checks (pass/fail). Do not merge or deploy — await user approval per the spec's deploy notes.

---

## Notes

- **No migration:** no `prisma/` changes.
- **Do not** merge or deploy without user approval. Back up the prod DB before any deploy; verify `/login` → 200 after. Lint with `npx eslint`; `npm run build` before merge.
- `requireAdminForUser` is the existing org-scoped guard (`lib/adminGuards.ts`) used by other admin actions; it throws/redirects on a non-admin or cross-org target.
