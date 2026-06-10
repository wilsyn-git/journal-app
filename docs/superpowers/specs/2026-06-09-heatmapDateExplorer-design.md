# Heatmap Date Explorer — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design)
**Scope:** Make the stats-page contribution heatmap interactive — click an activity day to open a centered modal showing that day's journal entries, habits completed, and a summary. Includes a small fix for N3.10 (legend not rendering on `/stats`).

## Goal

On `/stats`, clicking a heatmap cell that has activity opens a focused, centered modal showing exactly what was journaled and which daily habits were completed that day, with a summary header. The detail must always match the entries that colored the clicked cell. Works for admins inspecting another user (org-scoped), not just self-view.

## Locked Design Decisions

1. **Presentation:** centered modal (blurred dim backdrop; close via ✕, `Escape`, and backdrop click; focus-trapped).
2. **Clickable cells:** only days with activity (`value > 0` journal words **or** has rule data). Empty and future cells are inert.
3. **Modal content:** summary header (date, entry count, total word count, habit count) → journal entries (type-aware) → habits completed.
4. **Reuse over reinvent:** extract the existing `EntryCard` from `PastJournalView.tsx` into its own file and render the modal's entry list with it, so the modal matches the dashboard's day view and answer-rendering is not duplicated.
5. **N3.10:** diagnose and fix the legend not appearing on `/stats`, scoped as a small add-on.

## Correctness Foundation (timezone / bucketing)

The heatmap is bucketed in `app/lib/analytics.ts` (`getUserStats`): journal entries are grouped by **`createdAt`**, converted to a day string with `toLocaleDateString('en-CA', { timeZone })` in the **user's timezone**, and each cell value is that day's average word count.

Therefore the new server action MUST, for a given `dateStr`:
- use the **same `createdAt` field** and the **same timezone** (the target user's stored timezone) to compute the day window via `startOfDayInTimezone(dateStr, tz)` / `endOfDayInTimezone(dateStr, tz)` (`lib/timezone.ts`).

This guarantees the modal returns exactly the entries that colored the clicked cell.

## Affected / New Files

- **New** `components/journal/EntryCard.tsx` — `EntryCard` extracted verbatim from `PastJournalView.tsx` (type-aware prompt+answer rendering, including `JSON.parse` of radio/checkbox answers).
- **Modify** `components/PastJournalView.tsx` — import `EntryCard` from the new file; remove the local copy. No behavioral change.
- **Modify** `app/actions/journal.ts` — add `getDailyJournalDetails`.
- **New** `components/stats/DayDetailModal.tsx` — the centered modal.
- **Modify** `components/ContributionHeatmap.tsx` — accept `userId`, mark activity cells interactive, fetch + open modal.
- **Modify** `app/stats/page.tsx` — pass `userId={targetUserId}` to `<ContributionHeatmap>`; N3.10 legend fix.
- **New** test file for `getDailyJournalDetails`.

## Server Action — `getDailyJournalDetails(targetUserId: string, dateStr: string)`

In `app/actions/journal.ts`. Behavior:

1. `const session = await auth()`; if no session → throw `Unauthorized`.
2. Resolve `currentUserId = await resolveUserId(session)`; if none → throw `User not found`.
3. **Resolve effective target with org-safe auth:**
   - If `targetUserId` is falsy or equals `currentUserId` → effective target = `currentUserId`.
   - Else (inspecting someone else) → call `await requireAdminForUser(targetUserId)` (from `lib/adminGuards.ts`), which asserts the session is an admin and the target is in the admin's org; effective target = `targetUserId`. (Closes the cross-org gap in the original draft plan.)
4. `const tz = await getUserTimezoneById(effectiveTargetId)`.
5. `const start = startOfDayInTimezone(dateStr, tz)`, `const end = endOfDayInTimezone(dateStr, tz)`.
6. Query entries:
   ```ts
   prisma.journalEntry.findMany({
     where: { userId: effectiveTargetId, createdAt: { gte: start, lte: end } },
     select: { id: true, answer: true, isLiked: true, prompt: { select: { content: true, type: true } } },
     orderBy: { createdAt: 'asc' },
   })
   ```
7. Query habits completed that day (daily rules use `periodKey === dateStr`):
   ```ts
   prisma.ruleCompletion.findMany({
     where: { userId: effectiveTargetId, periodKey: dateStr },
     select: { rule: { select: { title: true } } },
   })
   ```
8. Compute summary: `entryCount = entries.length`; `wordCount = sum over entries of answer.trim().split(/\s+/).length` for non-empty answers (same rule as `analytics.ts`).
9. Return:
   ```ts
   { date: dateStr,
     entries,                                  // shape matches EntryCard's EntryWithPrompt (id, answer, isLiked, prompt{content,type})
     rules: ruleCompletions.map(rc => rc.rule.title),
     summary: { entryCount, wordCount } }
   ```

Notes: only daily habits appear (weekly/monthly `periodKey` formats differ) — consistent with the heatmap's daily rule cell. `isLiked` is included so `EntryCard` renders identically to the dashboard.

## `EntryCard` extraction

- Create `components/journal/EntryCard.tsx` exporting `EntryCard` and the `EntryWithPrompt` type, moved verbatim from `PastJournalView.tsx` (including its `PROMPT_TYPES` usage and any imports it needs).
- In `PastJournalView.tsx`, delete the local `EntryCard` and import it from the new file. The `EntryWithPrompt` type is also imported from there (single source of truth). No rendering change.

## `DayDetailModal.tsx`

Props: `{ date: string; details: DayDetails | null; loading: boolean; onClose: () => void }`.

- Centered modal over a `backdrop-blur` dim overlay.
- Close on ✕ button, `Escape` keydown, and backdrop click. Focus moved to the modal on open; focus trap within; restore focus to the triggering cell on close.
- `role="dialog"`, `aria-modal="true"`, `aria-label` set to the formatted date.
- Body states:
  - **loading:** a lightweight spinner/skeleton.
  - **loaded with entries:** summary header (formatted date + `{entryCount} entries · {wordCount} words · {habitCount} habits`) → entry list via `EntryCard` → "Habits completed" list (✓ + title); omit the habits section if none.
  - **loaded, no entries:** an empty state (shouldn't occur given activity-only cells, but handled defensively).
- Visual language matches the existing dark/glass aesthetic and the approved mockup.

## `ContributionHeatmap.tsx` changes

- Add optional prop `userId?: string`.
- `'use client'` state: `selectedDate: string | null`, `loading: boolean`, `details: DayDetails | null`.
- For cells where `value > 0 || hasRuleData`, add `cursor-pointer hover:ring-2 hover:ring-white/60 transition-all` and an `onClick`/keyboard handler (`role="button"`, `tabIndex={0}`, Enter/Space) calling:
  ```ts
  async function openDay(dateStr: string) {
    setSelectedDate(dateStr); setLoading(true);
    try { setDetails(await getDailyJournalDetails(userId ?? '', dateStr)); }
    catch (e) { /* toast or console; keep modal closed on hard failure */ }
    finally { setLoading(false); }
  }
  ```
- Render `<DayDetailModal>` when `selectedDate` is set; `onClose` clears `selectedDate`/`details`.
- Inert cells (empty/future) keep current markup — no pointer, no handler.

## N3.10 — legend fix

`app/stats/page.tsx` renders `<ContributionHeatmap data=… ruleData=… weeksHistory={46} />` with `showLegend` defaulting to `true`, yet the legend does not appear. Diagnose the actual cause (candidates: the legend sits inside the horizontal scroll container and is clipped/scrolled out of view, or a layout/width issue) and apply the minimal fix so the legend is visible on `/stats`. No change to legend content.

## Testing

- **Unit tests** for `getDailyJournalDetails` (add to the existing vitest suite):
  - returns the entries whose `createdAt` falls within the tz day window for `dateStr` (and excludes adjacent-day entries across the boundary).
  - `rules` reflects `RuleCompletion` rows with `periodKey === dateStr`.
  - `summary.entryCount` / `summary.wordCount` correct (including ignoring empty answers).
  - **auth:** self-view works for a non-admin; inspecting another user requires admin + same org (cross-org or non-admin target is rejected).
- **Visual verification** on the dev server: click an activity cell → modal opens with correct content; ✕/Esc/backdrop close; empty/future cells inert; admin inspecting another user sees that user's day; legend visible.

## Out of Scope

- Editing or liking entries from within the modal (read-only view; `isLiked` is display-only here).
- Weekly/monthly habit display.
- Any change to heatmap coloring, bucketing, or the `date` vs `createdAt` choice.

## Deploy Notes

Code-only (no `prisma/` changes → **no migration**). Local-test and get user approval before merge/deploy. Do not touch the prod DB; back it up before deploy regardless. Verify `/login` → 200 after deploy. Lint with `npx eslint`; `npm run build` before merge.
