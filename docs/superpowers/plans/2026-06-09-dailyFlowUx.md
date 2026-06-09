# Daily-Flow UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optimistic rule-toggle feedback, a midnight "new day" refresh prompt, and a confirm/retry flow for spending streak freezes — three client-side UX fixes (N3.4, N3.3, N3.5).

**Architecture:** Pure client-side React. A shared `useRuleToggle` hook wraps `useOptimistic` + `useTransition` + the existing `toggleRuleCompletion` action; two checkbox components consume it. A mount-only `MidnightRefreshNotice` component watches the timezone clock and fires a persistent toast. `StreakFreezeBanner` gains a two-step confirm and an error-toast retry path. No server-action signatures, schema, or migrations change.

**Tech Stack:** Next.js (App Router) client components, React `useOptimistic`/`useTransition`, the existing `useToast()` provider (`components/providers/ToastProvider.tsx`), Vitest + Testing Library (jsdom).

---

## Conventions for every task

- Test files set the environment with a top comment: `// @vitest-environment jsdom`.
- This project runs Vitest with `globals: false`, so each test file imports `describe, it, expect, vi, beforeEach, afterEach` from `vitest` and calls `cleanup()` in `afterEach` manually.
- Run a single test file with: `npx vitest run tests/components/<file>.test.tsx`.
- The `useToast()` hook throws outside a provider, so tests mock the provider module to capture `addToast` calls (shown in each task).

---

## Task 1: `useRuleToggle` hook + wire `RuleCheckbox`

**Files:**
- Create: `components/hooks/useRuleToggle.ts`
- Modify: `components/RuleCheckbox.tsx`
- Test: `tests/components/ruleCheckbox.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/ruleCheckbox.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const toggleMock = vi.fn()
vi.mock('@/app/actions/rules', () => ({
  toggleRuleCompletion: (...args: unknown[]) => toggleMock(...args),
}))

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { RuleCheckbox } from '@/components/RuleCheckbox'

afterEach(() => {
  cleanup()
  toggleMock.mockReset()
  addToastMock.mockReset()
})

function renderBox(isCompleted = false) {
  return render(
    <RuleCheckbox
      assignmentId="a1"
      title="Meditate"
      description={null}
      isCompleted={isCompleted}
      streakCurrent={0}
    />,
  )
}

describe('RuleCheckbox optimistic toggle', () => {
  it('flips to completed immediately, before the server resolves', async () => {
    let resolve!: (v: unknown) => void
    toggleMock.mockReturnValue(new Promise((r) => { resolve = r }))

    renderBox(false)
    expect(screen.getByText('⬜')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button'))

    // Optimistic: the check appears while the action promise is still pending.
    await screen.findByText('✅')
    expect(toggleMock).toHaveBeenCalledWith('a1')

    resolve({ success: true })
  })

  it('reverts and shows an error toast when the action fails', async () => {
    toggleMock.mockResolvedValue({ error: 'nope' })

    renderBox(false)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() =>
      expect(addToastMock).toHaveBeenCalledWith('error', expect.any(String)),
    )
    // Reverted back to the unchecked base state.
    expect(screen.getByText('⬜')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/ruleCheckbox.test.tsx`
Expected: FAIL — `RuleCheckbox` still renders `⏳` while pending (no immediate `✅`) and never calls `addToast`.

- [ ] **Step 3: Create the hook**

Create `components/hooks/useRuleToggle.ts`:

```ts
'use client'

import { useOptimistic, useTransition } from 'react'
import { toggleRuleCompletion } from '@/app/actions/rules'
import { useToast } from '@/components/providers/ToastProvider'

export function useRuleToggle(assignmentId: string, isCompleted: boolean) {
  const [completed, setOptimistic] = useOptimistic(isCompleted, (state) => !state)
  const [isPending, startTransition] = useTransition()
  const { addToast } = useToast()

  const toggle = () => {
    startTransition(async () => {
      setOptimistic(null)
      const result = await toggleRuleCompletion(assignmentId)
      if (result && 'error' in result && result.error) {
        addToast('error', "Couldn't update rule — try again")
      }
    })
  }

  return { completed, isPending, toggle }
}
```

- [ ] **Step 4: Rewire `RuleCheckbox` to the hook**

Replace the entire body of `components/RuleCheckbox.tsx` with:

```tsx
'use client'

import { useRuleToggle } from '@/components/hooks/useRuleToggle'

type RuleCheckboxProps = {
  assignmentId: string
  title: string
  description: string | null
  isCompleted: boolean
  streakCurrent: number
}

export function RuleCheckbox({ assignmentId, title, description, isCompleted, streakCurrent }: RuleCheckboxProps) {
  const { completed, isPending, toggle } = useRuleToggle(assignmentId, isCompleted)

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
        completed
          ? 'bg-green-500/10 border border-green-500/20'
          : 'bg-white/5 border border-white/10 hover:bg-white/10'
      } ${isPending ? 'opacity-50' : ''}`}
    >
      <span className="text-lg flex-shrink-0">
        {completed ? '✅' : '⬜'}
      </span>
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${completed ? 'text-green-300 line-through' : 'text-white'}`}>
          {title}
        </span>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      {streakCurrent > 0 && (
        <span className="text-xs text-orange-400 flex-shrink-0" title={`${streakCurrent} period streak`}>
          🔥 {streakCurrent}
        </span>
      )}
    </button>
  )
}
```

Note: the icon now reflects the optimistic `completed` state (`✅`/`⬜`) instead of the old `⏳` spinner — that is the point of the change. `disabled={isPending}` + `opacity-50` stay as a brief in-flight cue and to prevent a double-flip race.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/ruleCheckbox.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add components/hooks/useRuleToggle.ts components/RuleCheckbox.tsx tests/components/ruleCheckbox.test.tsx
git commit -m "feat(rules): optimistic toggle for RuleCheckbox via shared useRuleToggle hook (N3.4)"
```

---

## Task 2: Wire `DailyRulesCard.RuleRow` to the hook

**Files:**
- Modify: `components/DailyRulesCard.tsx:55-84` (the `RuleRow` function)
- Test: `tests/components/dailyRulesCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/dailyRulesCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const toggleMock = vi.fn()
vi.mock('@/app/actions/rules', () => ({
  toggleRuleCompletion: (...args: unknown[]) => toggleMock(...args),
}))

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { DailyRulesCard } from '@/components/DailyRulesCard'

afterEach(() => {
  cleanup()
  toggleMock.mockReset()
  addToastMock.mockReset()
})

describe('DailyRulesCard optimistic toggle', () => {
  it('flips a row to completed immediately on tap', async () => {
    let resolve!: (v: unknown) => void
    toggleMock.mockReturnValue(new Promise((r) => { resolve = r }))

    render(<DailyRulesCard rules={[{ assignmentId: 'a1', title: 'Stretch', isCompleted: false }]} />)
    expect(screen.getByText('⬜')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Stretch/ }))

    await screen.findByText('✅')
    expect(toggleMock).toHaveBeenCalledWith('a1')
    resolve({ success: true })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/dailyRulesCard.test.tsx`
Expected: FAIL — the row renders `⏳` while pending, no immediate `✅`.

- [ ] **Step 3: Rewire `RuleRow`**

In `components/DailyRulesCard.tsx`, replace the imports at the top:

```tsx
'use client'

import Link from 'next/link'
import { useRuleToggle } from '@/components/hooks/useRuleToggle'
```

(removes the now-unused `useTransition` and `toggleRuleCompletion` imports).

Then replace the entire `RuleRow` function (lines 55-84) with:

```tsx
function RuleRow({ rule }: { rule: DailyRule }) {
  const { completed, isPending, toggle } = useRuleToggle(rule.assignmentId, rule.isCompleted)

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition-colors ${
        isPending ? 'opacity-50' : ''
      } ${
        completed
          ? 'text-green-300/70'
          : 'text-white hover:bg-white/5'
      }`}
    >
      <span className="text-sm flex-shrink-0">
        {completed ? '✅' : '⬜'}
      </span>
      <span className={completed ? 'line-through' : ''}>
        {rule.title}
      </span>
    </button>
  )
}
```

Note: the header summary (`completed/total`, progress bar) still derives from the `rules` prop and updates on the server refresh — leaving it on the prop is intentional (no per-row optimistic recount needed for this pass).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/dailyRulesCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/DailyRulesCard.tsx tests/components/dailyRulesCard.test.tsx
git commit -m "feat(rules): optimistic toggle for DailyRulesCard rows (N3.4)"
```

---

## Task 3: `MidnightRefreshNotice` component + dashboard mount

**Files:**
- Create: `components/MidnightRefreshNotice.tsx`
- Modify: `app/dashboard/page.tsx` (add import + render in the returned JSX)
- Test: `tests/components/midnightRefreshNotice.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/midnightRefreshNotice.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { MidnightRefreshNotice } from '@/components/MidnightRefreshNotice'

describe('MidnightRefreshNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    addToastMock.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows a persistent refresh toast after the TZ day rolls over', () => {
    vi.setSystemTime(new Date('2026-06-09T23:59:50Z'))
    render(<MidnightRefreshNotice timezone="UTC" renderedDay="2026-06-09" />)

    expect(addToastMock).not.toHaveBeenCalled()

    // Advance past midnight UTC (≈10s to midnight + 1s buffer).
    vi.advanceTimersByTime(12_000)

    expect(addToastMock).toHaveBeenCalledTimes(1)
    expect(addToastMock.mock.calls[0][0]).toBe('info')     // toast type
    expect(addToastMock.mock.calls[0][2]).toBe(0)          // persistent (duration 0)
  })

  it('does not toast while still on the rendered day', () => {
    vi.setSystemTime(new Date('2026-06-09T10:00:00Z'))
    render(<MidnightRefreshNotice timezone="UTC" renderedDay="2026-06-09" />)

    vi.advanceTimersByTime(60_000)

    expect(addToastMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/midnightRefreshNotice.test.tsx`
Expected: FAIL — module `@/components/MidnightRefreshNotice` does not exist.

- [ ] **Step 3: Create the component**

Create `components/MidnightRefreshNotice.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/providers/ToastProvider'

function dayInTimezone(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
}

function msUntilNextMidnight(timezone: string): number {
  const time = new Date().toLocaleTimeString('en-GB', { timeZone: timezone, hour12: false })
  const [h, m, s] = time.split(':').map(Number)
  const elapsed = h * 3600 + m * 60 + s
  return (86400 - elapsed) * 1000 + 1000 // +1s buffer to land just past midnight
}

type Props = {
  timezone: string
  /** The YYYY-MM-DD the server rendered as "today". */
  renderedDay: string
}

export function MidnightRefreshNotice({ timezone, renderedDay }: Props) {
  const router = useRouter()
  const { addToast } = useToast()
  const notifiedRef = useRef(false)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    const maybeNotify = () => {
      if (notifiedRef.current) return
      if (dayInTimezone(timezone) === renderedDay) return
      notifiedRef.current = true
      addToast(
        'info',
        <span className="flex items-center gap-3">
          ☀️ New day started — showing yesterday&apos;s view.
          <button
            onClick={() => router.refresh()}
            className="underline font-semibold whitespace-nowrap"
          >
            Refresh →
          </button>
        </span>,
        0, // persist until dismissed
      )
    }

    timeoutId = setTimeout(maybeNotify, msUntilNextMidnight(timezone))

    const onVisible = () => {
      if (document.visibilityState === 'visible') maybeNotify()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', maybeNotify)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', maybeNotify)
    }
  }, [timezone, renderedDay, addToast, router])

  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/midnightRefreshNotice.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Mount it in the dashboard**

In `app/dashboard/page.tsx`:

1. Add the import alongside the other component imports (near line 26):

```tsx
import { MidnightRefreshNotice } from '@/components/MidnightRefreshNotice'
```

2. `getTodayForUser` is already imported (line 17) and `timezone` is already destructured from the first `Promise.all`. In the returned JSX, render the notice once near the top of the dashboard content (e.g. immediately inside the outermost wrapper of the `return`, before the main content). Add:

```tsx
<MidnightRefreshNotice timezone={timezone} renderedDay={getTodayForUser(timezone)} />
```

It renders nothing, so exact placement inside the returned tree is not visually significant — place it as a direct child of the top-level returned element so it always mounts.

- [ ] **Step 6: Build to confirm the dashboard still compiles**

Run: `npm run build`
Expected: build succeeds (the dashboard is a server component rendering a client child — valid).

- [ ] **Step 7: Commit**

```bash
git add components/MidnightRefreshNotice.tsx app/dashboard/page.tsx tests/components/midnightRefreshNotice.test.tsx
git commit -m "feat(dashboard): midnight new-day refresh toast (N3.3)"
```

---

## Task 4: `StreakFreezeBanner` confirm + retry

**Files:**
- Modify: `components/StreakFreezeBanner.tsx`
- Test: `tests/components/streakFreezeBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/streakFreezeBanner.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const recoveryMock = vi.fn()
vi.mock('@/app/actions/inventory', () => ({
  useStreakRecovery: (...args: unknown[]) => recoveryMock(...args),
}))

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { StreakFreezeBanner } from '@/components/StreakFreezeBanner'

afterEach(() => {
  cleanup()
  recoveryMock.mockReset()
  addToastMock.mockReset()
  refreshMock.mockReset()
})

function renderBanner() {
  return render(
    <StreakFreezeBanner
      missedDays={['2026-06-08']}
      freezesCost={1}
      shieldsCost={0}
      streakAtRisk={12}
    />,
  )
}

describe('StreakFreezeBanner confirm + retry', () => {
  it('first tap asks for confirmation and does not spend', () => {
    renderBanner()
    fireEvent.click(screen.getByText('Recover'))

    expect(screen.getByText(/Confirm: 1 freeze/)).toBeInTheDocument()
    expect(recoveryMock).not.toHaveBeenCalled()
  })

  it('Cancel returns to the Recover button without spending', () => {
    renderBanner()
    fireEvent.click(screen.getByText('Recover'))
    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.getByText('Recover')).toBeInTheDocument()
    expect(recoveryMock).not.toHaveBeenCalled()
  })

  it('Confirm spends and refreshes on success', async () => {
    recoveryMock.mockResolvedValue({ success: true })
    renderBanner()

    fireEvent.click(screen.getByText('Recover'))
    fireEvent.click(screen.getByText(/Confirm: 1 freeze/))

    await waitFor(() => expect(recoveryMock).toHaveBeenCalledWith(['2026-06-08'], 1, 0))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('shows an error toast and restores Recover on failure', async () => {
    recoveryMock.mockResolvedValue({ error: 'Not enough freezes' })
    renderBanner()

    fireEvent.click(screen.getByText('Recover'))
    fireEvent.click(screen.getByText(/Confirm: 1 freeze/))

    await waitFor(() =>
      expect(addToastMock).toHaveBeenCalledWith('error', 'Not enough freezes'),
    )
    expect(refreshMock).not.toHaveBeenCalled()
    expect(screen.getByText('Recover')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/streakFreezeBanner.test.tsx`
Expected: FAIL — there is no "Confirm: ..." / "Cancel" UI and no `addToast` on failure.

- [ ] **Step 3: Add confirm state, toast, and the two-step buttons**

In `components/StreakFreezeBanner.tsx`:

1. Update the imports (add `useToast`):

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useStreakRecovery } from '@/app/actions/inventory'
import { useToast } from '@/components/providers/ToastProvider'
```

2. Add state inside the component, next to the existing `dismissed`/`isPending` hooks:

```tsx
  const [confirming, setConfirming] = useState(false)
  const { addToast } = useToast()
```

3. Replace `handleUseRecovery` with:

```tsx
  const handleUseRecovery = () => {
    startTransition(async () => {
      const result = await useStreakRecovery(missedDays, freezesCost, shieldsCost)
      if ('success' in result && result.success) {
        router.refresh()
      } else {
        const message = ('error' in result && result.error) ? result.error : 'Recovery failed — try again'
        addToast('error', message)
        setConfirming(false)
      }
    })
  }
```

4. Replace the action-button block (the `Recover` button, leaving the dismiss `✕` button untouched) with the two-step version:

```tsx
        {confirming ? (
          <>
            <button
              onClick={handleUseRecovery}
              disabled={isPending}
              className={`text-[12px] ${buttonClass} transition-colors whitespace-nowrap disabled:opacity-50`}
            >
              {isPending ? 'Applying...' : `Confirm: ${costLabel}`}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="text-[12px] text-gray-400 hover:text-white transition-colors whitespace-nowrap disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className={`text-[12px] ${buttonClass} transition-colors whitespace-nowrap`}
          >
            Recover
          </button>
        )}
```

The existing dismiss `✕` button stays as the last child of the same flex container.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/streakFreezeBanner.test.tsx`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add components/StreakFreezeBanner.tsx tests/components/streakFreezeBanner.test.tsx
git commit -m "feat(streak): confirm cost + error retry for freeze recovery (N3.5)"
```

---

## Task 5: Full verification + tracker update

**Files:**
- Modify: `docs/newissues.md` (mark N3.3, N3.4, N3.5 resolved)

- [ ] **Step 1: Lint the changed files**

Run: `npx eslint components/hooks/useRuleToggle.ts components/RuleCheckbox.tsx components/DailyRulesCard.tsx components/MidnightRefreshNotice.tsx components/StreakFreezeBanner.tsx app/dashboard/page.tsx`
Expected: no errors. (Do NOT use `npm run lint` — Next 16 removed `next lint` and it is broken repo-wide.)

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the four new files.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds. (Required before merge — catches `'use server'` / client-boundary issues that tsc and vitest miss.)

- [ ] **Step 4: Mark the findings resolved in the tracker**

In `docs/newissues.md`, append a resolution line to each of N3.3, N3.4, N3.5 in the same `✅ Fixed 2026-06-09 (fix/daily-flow-ux)` style used by the already-resolved findings (e.g. N3.1/N3.2). For each, note:
- **N3.4:** Shared `components/hooks/useRuleToggle.ts` (`useOptimistic` + `useTransition` + error toast); `RuleCheckbox` and `DailyRulesCard.RuleRow` now flip instantly and revert with a toast on failure. Covered by `tests/components/ruleCheckbox.test.tsx` + `dailyRulesCard.test.tsx`.
- **N3.3:** `components/MidnightRefreshNotice.tsx` (mount-only) fires a persistent "new day" info toast with a Refresh button at the next TZ midnight (plus `visibilitychange`/`focus` re-check); no silent auto-refresh, so in-progress entries are safe. Covered by `tests/components/midnightRefreshNotice.test.tsx`.
- **N3.5:** `StreakFreezeBanner` now requires an explicit "Confirm: {cost}" second tap and surfaces failures via an error toast with the Recover button as the retry path. Covered by `tests/components/streakFreezeBanner.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add docs/newissues.md
git commit -m "docs: mark N3.3, N3.4, N3.5 resolved (fix/daily-flow-ux)"
```

---

## Notes on `useOptimistic` revert semantics (why Task 1/2 work)

`useOptimistic(base, reducer)` shows the optimistic value only while a transition is pending, then falls back to `base`. On **success**, `toggleRuleCompletion` calls `revalidatePath('/dashboard')`/`('/rules')`, the server re-renders with the new `isCompleted` prop, and the flip persists. On **failure**, no revalidation runs, the prop is unchanged, and when the transition ends React reverts to that base value automatically — so the only extra work the hook does on failure is show the toast. This mirrors the existing pattern in `components/PastJournalView.tsx`.
```
