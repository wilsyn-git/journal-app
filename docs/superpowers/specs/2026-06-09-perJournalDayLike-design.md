# Design: N3.7 — Per-journal-day like (replace per-entry like)

**Date:** 2026-06-09
**Branch:** `fix/journalDayLike`
**Source:** `docs/newissues.md` finding N3.7 (Like-button visibility on past entries is inconsistent)
**Execution:** subagent-driven, one task per unit, review between. One local-test pass, then deploy.

## Problem

Today "like" is a per-prompt-answer affair: `JournalEntry.isLiked` (boolean), toggled admin-only via `toggleEntryLike(entryId)`, and the heart renders inside every `EntryCard`. The control's visibility gate (`isAdmin || optimisticLiked`) means a non-admin can see a half-styled heart they can't use, and the feature's intent is illegible. We collapse it to **one like per journal-day**, rendered once at the bottom of the past-day view.

## Approach (confirmed with user)

- **Storage:** keep `JournalEntry.isLiked` — **no schema change, no migration**. A day is "liked" when *any* of its entries is liked (already how the calendar reads it). The single control toggles `isLiked` on **all** of that day's entries at once. This keeps the iOS `GET /api/v1/entries` response shape (`isLiked` per entry) and backup/restore unchanged.
- **Visibility:** admin gets a tappable toggle; a regular user (viewing their own past day) sees a **read-only** filled heart + label **only when the day is liked**, nothing when unliked. Consistent with the calendar sidebar, which already shows users a rose-red liked day.
- **Rejected alternative:** a new `JournalDayLike` table (cleaner grain) — rejected because it forces a schema migration, a data migration of existing likes, an iOS API breaking change, and backup/restore updates, for no user-visible benefit here.

---

## Components & changes

### 1. `lib/dayLike.ts` (NEW) — DI'd core logic
```
export async function setDayLike(
  prisma: PrismaClient,
  entryIds: string[],
  organizationId: string,
  liked: boolean
): Promise<{ count: number }>
```
- One org-scoped write: `prisma.journalEntry.updateMany({ where: { id: { in: entryIds }, user: { organizationId } }, data: { isLiked: liked } })`.
- Org-scoping in the `where` clause is a small hardening win over today's role-only `toggleEntryLike` (an admin can no longer like another org's entries by id).
- Returns the `updateMany` count (lets the caller/tests assert how many rows changed). Empty `entryIds` → no-op, `count: 0`.
- No `auth()` / no `revalidate` here — pure, DI'd, unit-testable against a temp DB (matches the `spendStreakRecovery`/`setDayLike` convention).

### 2. `app/actions/feedback.ts` — replace the action
- Replace `toggleEntryLike(entryId)` with:
```
export async function setJournalDayLike(entryIds: string[], liked: boolean): Promise<{ success: true } | { error: string }>
```
- Body: `const session = await ensureAdmin()` → `await setDayLike(prisma, entryIds, session.user.organizationId, liked)` → `revalidatePath('/dashboard')` → `return { success: true }`, wrapped in try/catch returning `{ error }` on failure (matches existing style). Note: `revalidatePath('/dashboard')` revalidates the route regardless of the `?viewUserId=` query param, so the admin's user-view refreshes too — the old action's separate `revalidatePath('/dashboard?viewUserId=…')` call is unnecessary and dropped (the new action doesn't load the entry to learn the userId anyway).
- The client passes the desired `liked` value (from its optimistic state) — stateless and race-free, no read-modify-write.
- **Caller check:** grep the repo for `toggleEntryLike`. The only known caller is `PastJournalView`. The iOS API only *reads* `isLiked` (no write endpoint), so it's unaffected. If any other caller exists, keep a thin `toggleEntryLike` shim; otherwise delete it.

### 3. `components/PastJournalView.tsx` — move the control to the bottom
- **Remove** the per-`EntryCard` heart button entirely (the `(isAdmin || optimisticLiked)` block and its `useOptimistic`/`handleToggle` inside `EntryCard`).
- Derive at the top level: `const dayLiked = entries.some(e => e.isLiked)` and `const entryIds = entries.map(e => e.id)`.
- Render ONE control **after** the entries list (bottom of the page):
  - **Admin** (`isAdmin === true`): a tappable heart using `useOptimistic(dayLiked, (s) => !s)` + `useTransition`; on tap, optimistically flip and call `setJournalDayLike(entryIds, nextLiked)`; on failure revert and show an error toast using the SAME toast utility the daily-flow UX work already uses (grep `components/hooks/useRuleToggle.ts` and `components/StreakFreezeBanner.tsx` for the exact import — reuse it, do not add a new toast dependency).
  - **Non-admin**: if `dayLiked`, render a read-only filled heart + label “Liked by your admin” (no button, not interactive); if not `dayLiked`, render nothing.
- `Props` stay `{ entries, date, isAdmin }`; `EntryWithPrompt` keeps `id` and `isLiked` (used for derivation).

### Unchanged
- `app/lib/data.ts` `getJournalHistory` (already OR-aggregates `isLiked` to day level → calendar sidebar works as-is).
- `getEntriesByDate` (still returns `isLiked` per entry — used to derive `dayLiked`).
- iOS `GET /api/v1/entries` (still returns `isLiked` per entry, now consistent across a day).
- `app/api/admin/export` + `app/actions/restore.ts` (`isLiked` still a `JournalEntry` field).

### Known legacy edge (documented, no action)
Days created in the per-item era can have *mixed* `isLiked` (some entries liked, some not). The web day-view reads them as liked (`some`), and the first admin re-toggle normalizes every entry for that day. The iOS per-entry list may show mixed hearts for such old days until re-toggled — cosmetic only; not worth a data migration.

---

## Testing

- `tests/lib/dayLike.test.ts` (real temp DB via `createTestDb` + `createUserFixture`):
  - sets every entry of a day to `liked: true`, then `false`;
  - **org-scoping:** entries belonging to another org are NOT modified (seed a 2nd org, assert untouched);
  - **normalization:** a day with mixed initial `isLiked` ends all-true after `setDayLike(..., true)`;
  - empty `entryIds` → `count: 0`, no throw.
- `tests/components/pastJournalView.test.tsx` (mirror the existing component-test setup, e.g. `journalEditor.test.tsx` — same jsdom env pragma + RTL):
  - no per-entry heart renders inside entry cards;
  - **admin:** exactly one toggle at the bottom; clicking flips it optimistically and invokes the action (mock `setJournalDayLike`);
  - **non-admin + dayLiked:** one read-only filled heart + label, not a button;
  - **non-admin + not liked:** no like control at all.

**Before merge (all required):**
- `npx eslint` on changed files (NOT `npm run lint`).
- `npm run build` (the `'use server'` re-export / non-async-export gotcha — `feedback.ts` is a `'use server'` file, so `setDayLike` must live in `lib/dayLike.ts`, not be re-exported from the action module).
- `npx vitest run`.

## Out of scope
- The other N3.x usability items (N3.6, N3.8, N3.9, N3.10–N3.14).
- Any change to who can like (stays admin-only) or notifications when a day is liked.
- A data migration to normalize legacy mixed-state days.
