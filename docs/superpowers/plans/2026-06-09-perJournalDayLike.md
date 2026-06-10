# Per-journal-day Like — Implementation Plan (N3.7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-prompt-answer "like" with a single per-journal-day like rendered once at the bottom of the past-day view — admin toggles, non-admin sees a read-only indicator only when liked — with no schema change.

**Architecture:** Keep `JournalEntry.isLiked`. A day is "liked" when any of its entries is liked (already how the calendar reads it). A DI'd `lib/dayLike.ts` helper does one org-scoped `updateMany` over the day's entry IDs; a `'use server'` action wraps it with an admin check; `PastJournalView` derives `dayLiked`/`entryIds` and renders one control at the bottom.

**Tech Stack:** Next.js 16 (RSC + `'use server'` actions), Prisma + SQLite, React `useOptimistic`/`useTransition`, project `useToast` (`@/components/providers/ToastProvider`), Vitest (real temp DB for lib; jsdom + RTL for components).

**Branch:** `fix/journalDayLike` (already created and checked out).

**Spec:** `docs/superpowers/specs/2026-06-09-perJournalDayLike-design.md`

---

## Conventions for every task
- **Lint:** `npx eslint <files>` — NOT `npm run lint` (broken repo-wide).
- **Tests:** `npx vitest run <path>` for one file; `npx vitest run` for all.
- **Build gate:** `npm run build` MUST pass before merge. `app/actions/feedback.ts` is a `'use server'` file — it may only export async functions and must NOT re-export non-async values; the `setDayLike` logic therefore lives in `lib/dayLike.ts`, imported by the action.
- Commit after each task. Camel-case any new file names.

## File Structure
| File | Change | Task |
|------|--------|------|
| `lib/dayLike.ts` | **Create** — `setDayLike(prisma, entryIds, organizationId, liked)` | 1 |
| `tests/lib/dayLike.test.ts` | **Create** | 1 |
| `app/actions/feedback.ts` | Modify — replace `toggleEntryLike` with `setJournalDayLike` | 2 |
| `components/PastJournalView.tsx` | Modify — remove per-entry heart, add bottom day-like control | 2 |
| `tests/components/pastJournalView.test.tsx` | **Create** | 2 |
| `docs/newissues.md` | Modify — mark N3.7 resolved | 3 |

---

## Task 1: `lib/dayLike.ts` — DI'd org-scoped day-like writer

**Files:**
- Create: `lib/dayLike.ts`
- Create: `tests/lib/dayLike.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/dayLike.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { setDayLike } from '@/lib/dayLike'

async function makeEntry(db: TestDb, userId: string, promptId: string, isLiked = false) {
  return db.prisma.journalEntry.create({
    data: { userId, promptId, answer: 'a', isLiked },
  })
}

describe('setDayLike', () => {
  let db: TestDb
  beforeAll(() => { db = createTestDb() })
  afterAll(async () => { await db.cleanup() })

  it('sets every supplied entry to liked, then unliked', async () => {
    const { org, user, prompt, secondPrompt } = await createUserFixture(db.prisma)
    const e1 = await makeEntry(db, user.id, prompt.id)
    const e2 = await makeEntry(db, user.id, secondPrompt.id)

    const onResult = await setDayLike(db.prisma, [e1.id, e2.id], org.id, true)
    expect(onResult.count).toBe(2)
    expect((await db.prisma.journalEntry.findUnique({ where: { id: e1.id } }))!.isLiked).toBe(true)
    expect((await db.prisma.journalEntry.findUnique({ where: { id: e2.id } }))!.isLiked).toBe(true)

    const offResult = await setDayLike(db.prisma, [e1.id, e2.id], org.id, false)
    expect(offResult.count).toBe(2)
    expect((await db.prisma.journalEntry.findUnique({ where: { id: e1.id } }))!.isLiked).toBe(false)
  })

  it('normalizes a mixed-state day to all-liked', async () => {
    const { org, user, prompt, secondPrompt } = await createUserFixture(db.prisma)
    const e1 = await makeEntry(db, user.id, prompt.id, true)
    const e2 = await makeEntry(db, user.id, secondPrompt.id, false)

    await setDayLike(db.prisma, [e1.id, e2.id], org.id, true)
    expect((await db.prisma.journalEntry.findUnique({ where: { id: e2.id } }))!.isLiked).toBe(true)
  })

  it('does not touch entries belonging to another organization', async () => {
    const a = await createUserFixture(db.prisma)
    const b = await createUserFixture(db.prisma) // different org
    const bEntry = await makeEntry(db, b.user.id, b.prompt.id, false)

    // Caller is org A, but passes org B's entry id — must be a no-op.
    const result = await setDayLike(db.prisma, [bEntry.id], a.org.id, true)
    expect(result.count).toBe(0)
    expect((await db.prisma.journalEntry.findUnique({ where: { id: bEntry.id } }))!.isLiked).toBe(false)
  })

  it('is a no-op for an empty entryIds list', async () => {
    const { org } = await createUserFixture(db.prisma)
    const result = await setDayLike(db.prisma, [], org.id, true)
    expect(result.count).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/dayLike.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dayLike'`.

- [ ] **Step 3: Implement the helper**

Create `lib/dayLike.ts`:

```ts
import type { PrismaClient } from '@prisma/client'

/**
 * Sets `isLiked` on every supplied JournalEntry that belongs to the given
 * organization — the "like" grain is one journal-day (all of that day's
 * entries share one like). Org-scoped in the WHERE clause: ids outside the
 * organization are silently skipped (no cross-org writes). Returns the number
 * of rows actually updated. Empty `entryIds` is a no-op (`{ count: 0 }`).
 */
export async function setDayLike(
  prisma: PrismaClient,
  entryIds: string[],
  organizationId: string,
  liked: boolean
): Promise<{ count: number }> {
  if (entryIds.length === 0) return { count: 0 }
  return prisma.journalEntry.updateMany({
    where: { id: { in: entryIds }, user: { organizationId } },
    data: { isLiked: liked },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/dayLike.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Lint and commit**

Run: `npx eslint lib/dayLike.ts tests/lib/dayLike.test.ts`
Expected: clean.

```bash
git add lib/dayLike.ts tests/lib/dayLike.test.ts
git commit -m "feat(like): add org-scoped setDayLike helper (N3.7)"
```

---

## Task 2: Replace the action + move the control to the bottom of the page

**Files:**
- Modify: `app/actions/feedback.ts` (replace `toggleEntryLike` → `setJournalDayLike`)
- Modify: `components/PastJournalView.tsx` (remove per-entry heart, add bottom day-like control)
- Create: `tests/components/pastJournalView.test.tsx`

Context: `toggleEntryLike` has exactly one caller (`PastJournalView`) and the iOS API only *reads* `isLiked`, so the action can be replaced outright (no shim). The action and the component change together to keep the build green.

- [ ] **Step 1: Replace the server action**

Replace the entire contents of `app/actions/feedback.ts` with:

```ts
'use server'

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { ensureAdmin } from './helpers'
import { setDayLike } from '@/lib/dayLike'

/**
 * Admin-only. Likes/unlikes a whole journal-day by setting isLiked on all of
 * that day's entries (the entry ids the client is currently displaying). The
 * desired `liked` value comes from the client's optimistic state — stateless,
 * no read-modify-write.
 */
export async function setJournalDayLike(entryIds: string[], liked: boolean) {
    try {
        const session = await ensureAdmin()
        await setDayLike(prisma, entryIds, session.user.organizationId, liked)
        // Revalidates /dashboard regardless of the ?viewUserId= query param,
        // so the admin's user-view refreshes too.
        revalidatePath('/dashboard')
        return { success: true as const }
    } catch (e) {
        console.error("Failed to set journal day like:", e)
        return { error: "Failed to update" }
    }
}
```

- [ ] **Step 2: Write the failing component test**

Create `tests/components/pastJournalView.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const setLikeMock = vi.fn()
vi.mock('@/app/actions/feedback', () => ({
  setJournalDayLike: (...args: unknown[]) => setLikeMock(...args),
}))

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { PastJournalView } from '@/components/PastJournalView'

type E = { id: string; answer: string; isLiked: boolean; prompt: { content: string; type: string } }
function entries(over: Partial<E>[] = []): E[] {
  const base: E[] = [
    { id: 'e1', answer: 'one', isLiked: false, prompt: { content: 'Q1', type: 'TEXT' } },
    { id: 'e2', answer: 'two', isLiked: false, prompt: { content: 'Q2', type: 'TEXT' } },
  ]
  return base.map((b, i) => ({ ...b, ...(over[i] ?? {}) }))
}

afterEach(() => { cleanup(); setLikeMock.mockReset(); addToastMock.mockReset() })

describe('PastJournalView day-like', () => {
  it('renders no per-entry heart and exactly one day-like control for an admin', () => {
    render(<PastJournalView entries={entries()} date="2026-06-09" isAdmin />)
    // One control total (the day-like button), not one per entry.
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('admin: clicking flips optimistically and calls setJournalDayLike with the day ids + true', async () => {
    let resolve!: (v: unknown) => void
    setLikeMock.mockReturnValue(new Promise((r) => { resolve = r }))

    render(<PastJournalView entries={entries()} date="2026-06-09" isAdmin />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(setLikeMock).toHaveBeenCalledWith(['e1', 'e2'], true))
    resolve({ success: true })
  })

  it('admin: shows an error toast when the action fails', async () => {
    setLikeMock.mockResolvedValue({ error: 'nope' })
    render(<PastJournalView entries={entries()} date="2026-06-09" isAdmin />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith('error', expect.any(String)))
  })

  it('non-admin + liked day: shows a read-only indicator, not a button', () => {
    render(<PastJournalView entries={entries([{ isLiked: true }])} date="2026-06-09" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/liked by your admin/i)).toBeInTheDocument()
  })

  it('non-admin + unliked day: shows no like control at all', () => {
    render(<PastJournalView entries={entries()} date="2026-06-09" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/liked by your admin/i)).toBeNull()
  })
})
```

- [ ] **Step 3: Run the component test to verify it fails**

Run: `npx vitest run tests/components/pastJournalView.test.tsx`
Expected: FAIL — the current `PastJournalView` imports `toggleEntryLike` (now removed) and renders per-entry hearts, so the mocks/assertions don't match (import error or wrong button count).

- [ ] **Step 4: Rewrite PastJournalView**

Replace the entire contents of `components/PastJournalView.tsx` with:

```tsx
'use client'

import React, { useOptimistic, useTransition } from 'react'
import { setJournalDayLike } from '@/app/actions/feedback'
import { useToast } from '@/components/providers/ToastProvider'
import { PROMPT_TYPES } from '@/lib/promptConstants'

type EntryWithPrompt = {
    id: string;
    answer: string;
    isLiked: boolean;
    prompt: {
        content: string;
        type: string;
    }
}

type Props = {
    entries: EntryWithPrompt[];
    date: string;
    isAdmin?: boolean;
}

export function PastJournalView({ entries, date, isAdmin = false }: Props) {
    const displayDate = new Date(`${date}T00:00:00`).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const dayLiked = entries.some(e => e.isLiked);
    const entryIds = entries.map(e => e.id);

    return (
        <div className="animate-[fade-in_0.5s_ease-out]">
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 mb-8 border-b border-white/10 pb-4">
                {displayDate}
            </h2>

            <div className="space-y-6">
                {entries.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <p>No entries found for this day.</p>
                        <p className="text-sm mt-2">Try navigating to today to fill out your journal, or browse other dates using the calendar.</p>
                    </div>
                ) : (
                    entries.map(entry => (
                        <EntryCard key={entry.id} entry={entry} />
                    ))
                )}
            </div>

            {entries.length > 0 && (
                isAdmin
                    ? <AdminDayLike dayLiked={dayLiked} entryIds={entryIds} />
                    : (dayLiked ? <ReadOnlyDayLike /> : null)
            )}
        </div>
    )
}

function EntryCard({ entry }: { entry: EntryWithPrompt }) {
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

function AdminDayLike({ dayLiked, entryIds }: { dayLiked: boolean; entryIds: string[] }) {
    const [optimisticLiked, toggleOptimistic] = useOptimistic(dayLiked, (state) => !state);
    const [isPending, startTransition] = useTransition();
    const { addToast } = useToast();

    const handleToggle = () => {
        const next = !optimisticLiked;
        startTransition(async () => {
            toggleOptimistic(null);
            const result = await setJournalDayLike(entryIds, next);
            if (result && 'error' in result && result.error) {
                addToast('error', "Couldn't update like — try again");
            }
        });
    };

    return (
        <div className="mt-10 flex justify-center">
            <button
                onClick={handleToggle}
                disabled={isPending}
                aria-pressed={optimisticLiked}
                title={optimisticLiked ? 'Unlike this journal' : 'Like this journal'}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300
                    ${optimisticLiked
                        ? 'text-rose-400 border-rose-400/40 bg-rose-500/10'
                        : 'text-gray-400 border-white/10 hover:text-rose-400 hover:border-rose-400/30'}`}
            >
                <HeartIcon filled={optimisticLiked} />
                <span className="text-sm font-medium">{optimisticLiked ? 'Liked' : 'Like this journal'}</span>
            </button>
        </div>
    )
}

function ReadOnlyDayLike() {
    return (
        <div className="mt-10 flex items-center justify-center gap-2 text-rose-400">
            <HeartIcon filled />
            <span className="text-sm font-medium">Liked by your admin</span>
        </div>
    )
}

function HeartIcon({ filled }: { filled: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
        >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
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
        } catch (e) {
            // ignore
        }
    }
    return answer;
}
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `npx vitest run tests/components/pastJournalView.test.tsx`
Expected: PASS (5 cases).

- [ ] **Step 6: Build + full suite + lint**

Run: `npm run build` (REQUIRED — green; confirms the `'use server'` file is valid and no stale `toggleEntryLike` reference remains)
Run: `npx vitest run`
Run: `npx eslint app/actions/feedback.ts components/PastJournalView.tsx tests/components/pastJournalView.test.tsx`
Expected: build green, all tests pass, eslint clean.

- [ ] **Step 7: Commit**

```bash
git add app/actions/feedback.ts components/PastJournalView.tsx tests/components/pastJournalView.test.tsx
git commit -m "feat(like): move like to one per journal-day at page bottom (N3.7)"
```

---

## Task 3: Final gate + tracker update

**Files:**
- Modify: `docs/newissues.md` (mark N3.7 resolved)

- [ ] **Step 1: Full green gate**

Run: `npm run build`
Run: `npx vitest run`
Expected: green / all pass. Capture the vitest summary line.

- [ ] **Step 2: Mark N3.7 resolved**

In `docs/newissues.md`, append `— ✅ Fixed 2026-06-09 (fix/journalDayLike)` to the N3.7 heading and add a one-line **Resolution:** note matching the style of the resolved N3.x entries (e.g. N3.5): collapsed per-entry `isLiked` into one per-journal-day like rendered at the bottom of `PastJournalView`; admin toggles via org-scoped `setDayLike` (`lib/dayLike.ts`), non-admin sees a read-only "Liked by your admin" heart only when liked; no schema change; iOS API / calendar / backup-restore unchanged; legacy mixed-state days read as liked and normalize on first re-toggle.

- [ ] **Step 3: Commit**

```bash
git add docs/newissues.md
git commit -m "docs: mark N3.7 resolved (fix/journalDayLike)"
```

- [ ] **Step 4: Hand back for review + deploy decision**

Stop. Surface the test/build output and the commit list; the branch is ready for the user's review before merge to `main`. Note: **code-only change, no migration** — the EC2 deploy is pull → `npx prisma generate` → `npm run build` → `pm2 restart` (no `prisma migrate deploy` needed this time).

---

## Self-Review notes
- **Spec coverage:** storage approach (keep `isLiked`, toggle all) → Task 1 `setDayLike` + Task 2 action; bottom-of-page control + admin toggle / non-admin read-only → Task 2 `PastJournalView`; org-scoping hardening → Task 1 `updateMany` where-clause; tests → Tasks 1 & 2. All covered.
- **Type consistency:** `setDayLike(prisma, entryIds, organizationId, liked)` defined in Task 1, called by the action in Task 2; `setJournalDayLike(entryIds, liked)` defined in Task 2's action, called by `AdminDayLike` and mocked in the component test with matching arity.
- **Build-red window:** none — Task 2 changes the action and its sole caller together, ending green.
- **No leftover `toggleEntryLike`:** confirmed it had exactly one caller (PastJournalView); both the export and the import are removed in Task 2.
