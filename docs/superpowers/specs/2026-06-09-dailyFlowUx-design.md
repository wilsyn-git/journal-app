# Daily-Flow UX Polish — Design (2026-06-09)

Branch: `fix/daily-flow-ux`

Covers three MED findings from `docs/newissues.md`, the highest value-per-risk
items left after the HIGH-severity hardening shipped:

- **N3.4** — Rule checkboxes have no optimistic update (highest-frequency interaction).
- **N3.3** — Dashboard goes stale across midnight.
- **N3.5** — Using a streak freeze has no confirmation, and failures offer no retry.

None of this touches `'use server'` action signatures, the schema, or production
historical data. It is client-side UX work. The rule-toggle action already returns
`{ success: true } | { error }`, so no server changes are required.

## Shared infrastructure (already present)

- `components/providers/ToastProvider.tsx` exposes `useToast()` →
  `addToast(type: 'success' | 'error' | 'info', message: ReactNode, duration = 5000)`.
  `duration: 0` makes a toast persist until manually dismissed. Mounted globally in `app/layout.tsx`.
- `@radix-ui/react-dialog` is available (not needed for the chosen designs, but on hand).
- `useOptimistic` reference pattern lives in `components/PastJournalView.tsx`.

---

## Part A — N3.4: Shared optimistic rule toggle

**Problem:** `RuleCheckbox` and `DailyRulesCard.RuleRow` each call `toggleRuleCompletion`
inside a `useTransition` and show a `⏳` spinner (disabling the control) until the server
round-trip completes. The check does not appear immediately; on a slow connection the tap
feels like it did not register. This is the highest-frequency interaction in the app, and
the toggle logic is duplicated across the two components.

**New hook:** `components/hooks/useRuleToggle.ts` (client).

```
useRuleToggle(assignmentId: string, isCompleted: boolean)
  → { completed: boolean, isPending: boolean, toggle: () => void }
```

Internals:
- `const [completed, setOptimistic] = useOptimistic(isCompleted, (s) => !s)`
- `const [isPending, startTransition] = useTransition()`
- `const { addToast } = useToast()`
- `toggle()` wraps in `startTransition(async () => { setOptimistic(null); const res = await toggleRuleCompletion(assignmentId); if (res?.error) addToast('error', "Couldn't update rule — try again") })`

Revert/persist behavior (relies on documented `useOptimistic` semantics):
- **Success:** the action runs `revalidatePath('/dashboard')` / `revalidatePath('/rules')`,
  props refresh, the new `isCompleted` base matches the optimistic flip, and it sticks.
- **Error:** no `revalidatePath` runs, so the `isCompleted` prop is unchanged; when the
  transition ends `useOptimistic` reverts to that base value automatically. The toast tells
  the user it failed.

**Consumers:** `RuleCheckbox` and `DailyRulesCard.RuleRow` both drop their own
`useTransition` + `toggleRuleCompletion` calls and use the hook.

Behavior change — the icon reflects the **optimistic** `completed` state immediately
(`✅` / `⬜`) instead of swapping to the `⏳` spinner. `disabled={isPending}` is kept (a brief,
~one-round-trip lockout) to avoid a double-flip race on the server-side toggle, but because
the check appears instantly the control will not feel stuck. The `⏳` branch is removed from
both components' icon rendering.

---

## Part B — N3.3: Midnight refresh toast

**Problem:** "Today" is computed server-side at render. A user who leaves the dashboard open
past midnight (common for an evening journaling habit) keeps writing into yesterday's view
until a manual refresh.

**New client component:** `components/MidnightRefreshNotice.tsx`, rendered in
`app/dashboard/page.tsx`. Renders nothing; it is a behavioral mount.

Props: `{ timezone: string, renderedDay: string }` where `renderedDay` is the `YYYY-MM-DD`
the server treated as "today". Both are already computed in `page.tsx`
(`getUserTimezone` / `getTodayForUser`).

Behavior:
- On mount, compute ms until the next midnight in `timezone`: format the current instant in
  that TZ (`Intl.DateTimeFormat` / `toLocaleString` with `timeZone`), derive seconds elapsed
  since local midnight, `msUntilMidnight = 86_400_000 - elapsed + small buffer`, then `setTimeout`.
- Also attach `visibilitychange` and `focus` listeners — background tabs throttle timers and
  laptops sleep, so the timer alone is unreliable for the exact overnight case this targets.
- The shared check (`maybeNotify`): compute today's `YYYY-MM-DD` in `timezone`; if it differs
  from `renderedDay` and a notice has not already been shown, show a **persistent**
  (`duration: 0`) `info` toast:

  > ☀️ New day started — showing yesterday's view. **[ Refresh → ]**

  The Refresh button calls `router.refresh()`. A `useRef` guard prevents showing the toast
  more than once per mount. No silent auto-refresh — an in-progress journal entry is never
  clobbered; the user chooses when to refresh.
- Clean up the timeout and listeners on unmount.

---

## Part C — N3.5: Streak freeze confirm + retry

**Problem:** In `StreakFreezeBanner`, "Recover" immediately spends scarce freezes/shields with
no confirmation of the cost. On failure the result-handling silently does nothing (only the
`success` branch is handled), so the user has no feedback and no retry path short of reloading.

**Changes to `components/StreakFreezeBanner.tsx`:**
- Add a `confirming` boolean state. The first "Recover" tap sets `confirming = true`, swapping
  the single button for **`Confirm: {costLabel}`** + **Cancel** (reusing the existing
  `costLabel` builder — e.g. "1 freeze + 2 shields"). Cancel sets `confirming = false`.
- The Confirm tap runs the existing `handleUseRecovery` spend:
  - On `{ success }` → `router.refresh()` (unchanged).
  - On `{ error }` → `addToast('error', result.error)` and set `confirming = false`, returning
    the banner to its "Recover" state, which is itself the retry path. (Today this branch is a
    silent no-op — that is the bug.)
- The banner remains dismissable via the existing `✕`.

---

## Testing

Vitest + Testing Library, matching `tests/components/journalEditor.test.tsx`:

- **Rule toggle** (`tests/components/ruleToggle.test.tsx` or hook-level): tapping flips the
  icon to the completed state immediately (optimistic, before the action resolves); on an
  action returning `{ error }` the icon reverts and an error toast is shown.
- **Streak freeze banner** (`tests/components/streakFreezeBanner.test.tsx`): first tap shows
  the Confirm/Cancel two-step; Cancel returns to Recover without spending; Confirm calls
  `useStreakRecovery`; an `{ error }` result shows an error toast and restores the Recover
  button.
- **Midnight notice** (`tests/components/midnightRefreshNotice.test.tsx`): with vitest fake
  timers, advancing past the computed midnight when the TZ day has rolled over shows the
  persistent refresh toast; no toast when the day has not changed.

## Verification

- `npx eslint` (NOT `npm run lint` — Next 16 removed `next lint`).
- `npm run build` before merge.
- `npm test` locally.
- No schema change, no migration, no production-data exposure.

## Out of scope

N3.6–N3.9 (rest of the Tier-3 usability cluster) are deferred to a later pass. N1.5
(timezone-aware uniqueness, needs a migration) and the N2.2/N2.3 perf items are separate tracks.
