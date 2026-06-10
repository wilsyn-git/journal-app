# Usability Cluster (N3.6 / N3.8 / N3.9) — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design)
**Scope:** Three independent MED-priority usability fixes from `docs/newissues.md`, bundled on one branch. No schema changes, no migration.

## Goals

- **N3.6:** Make the streak freeze/shield explanatory copy accurate and make the freeze-vs-shield distinction legible.
- **N3.8:** Make a timezone change deliberate — preview + confirm before it applies, instead of saving instantly.
- **N3.9:** Make `updateProfile` return `{ error }` like other actions (so the form shows specific errors and never sticks on "Saving…"), and add the missing client-side image validation.

---

## N3.6 — Correct & sharpen the streak-item popovers (copy only)

**Files:** `components/StreakFreezeItem.tsx`, `components/StreakShieldItem.tsx`

Both components already render an info popover (toggled by the ⓘ button). The work is to correct inaccurate copy and clarify the distinction. **No logic/markup changes** beyond the popover `<p>` text.

**Verified mechanics (source of truth for the copy):**
- Earning (`lib/inventoryEarning.ts`): the counter increments by 1 on the user's **first journal entry each day**; it resets to 0 only when an item is earned (counter reaches `earningInterval`) or at row creation — **never on a missed day**. So progress is *cumulative journaling days*, not *consecutive* days. Confirmed: no `earningCounter` reset exists on a streak break.
- Recovery (`lib/streakRecovery.ts`): tiered — **freezes are used first** and only when the missed-day gap is **≤ `STREAK_FREEZE.graceWindowDays` (2)**; **shields cover the remainder / longer gaps** with no time limit.
- Constants (`lib/inventory.ts`): freeze `earningInterval` 14, `maxQuantity` 5, `graceWindowDays` 2; shield `earningInterval` 30, `maxQuantity` 5.

**Freeze popover — new copy** (keep interpolating `STREAK_FREEZE.*`):
- "Earn a freeze for every **{earningInterval} days you journal** — your first entry each day counts one step. Missing a day pauses progress; it doesn't reset it."
- "Hold up to **{maxQuantity}** at a time."
- "If you miss a day, a freeze keeps your streak alive. Freezes cover short gaps — **up to {graceWindowDays} missed days** — and are used first."

**Shield popover — new copy** (keep interpolating `STREAK_SHIELD.*`):
- "Earn a shield for every **{earningInterval} days you journal** — your first entry each day counts one step. Missing a day pauses progress; it doesn't reset it."
- "Hold up to **{maxQuantity}** at a time."
- "Shields cover **longer gaps that freezes can't reach, with no time limit** — they're used after freezes."

Exact wording may be polished during implementation as long as it stays faithful to the verified mechanics above (cumulative not consecutive; freezes-first-≤2-days; shields-cover-longer-gaps).

**Testing:** pure copy — verified visually on `/inventory`. No unit test required.

---

## N3.8 — Preview + confirm before applying a timezone

**Files:** `app/settings/TimezonePicker.tsx` (client only; `setUserTimezone` action unchanged)

**Current behavior:** `handleSelect(tz)` immediately calls `setUserTimezone(tz)` and toasts success — no chance to reconsider.

**New behavior:**
- Selecting a timezone from the dropdown sets a **pending** selection (`pendingTz`) and closes the dropdown. It does **not** persist yet. The picker's displayed value stays on the currently-saved timezone.
- If the picked tz equals the current saved tz, it's a no-op (no pending state).
- When `pendingTz` is set, render a **confirm bar** below the picker:
  - A one-line preview: *"Your daily entries will roll over at midnight {label}."* (label via the existing `getTimezoneLabel`).
  - **Confirm** button → `setUserTimezone(pendingTz)`; on success: success toast, update displayed `selected`, clear `pendingTz`; on failure: error toast, clear `pendingTz` (display stays on current). Disable buttons while the request is pending.
  - **Cancel** button → clear `pendingTz`; display stays on the current timezone.
- Keep the existing click-outside / dropdown behavior. The pending confirm bar persists until Confirm/Cancel (clicking outside the dropdown does not auto-confirm).

**Testing:** component test (`tests/components/timezonePicker.test.tsx`, jsdom + RTL, mock `@/app/actions/settings`):
- Selecting a timezone shows the confirm bar and does **not** call `setUserTimezone`.
- Clicking **Confirm** calls `setUserTimezone` with the picked tz.
- Clicking **Cancel** does not call `setUserTimezone` and the confirm bar disappears.

---

## N3.9 — `updateProfile` returns `{ error }`; client MIME check; dead-code cleanup

**Files:** `app/actions/settings.ts`, `app/settings/ProfileForm.tsx`, new `lib/avatarValidation.ts`

### `lib/avatarValidation.ts` (new, pure)
```ts
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
/** Returns an error message if the avatar file is invalid, else null. */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
    if (!file.type.startsWith('image/jpeg')) return 'Only JPG images are allowed'
    if (file.size > AVATAR_MAX_BYTES) return 'Image must be smaller than 2MB'
    return null
}
```

### `app/actions/settings.ts` — `updateProfile`
- Return type becomes `{ success: true } | { error: string }`.
- Replace the two inline avatar `throw`s with `validateAvatarFile`:
  ```ts
  if (file && file.size > 0) {
      const err = validateAvatarFile(file)
      if (err) return { error: err }
      // ...existing write/avatar-record logic unchanged...
  }
  ```
- The auth guards (`!userId`, `!session?.user`, `currentUserId !== userId`) stay as `throw new Error("Unauthorized")` — not user-actionable form errors. All avatar/file write logic otherwise unchanged. Still `return { success: true }` at the end.

### `app/settings/ProfileForm.tsx`
- `handleSubmit`: capture the result and branch:
  ```ts
  const result = await updateProfile(userId, formData)
  if (result && 'error' in result) addToast('error', result.error)
  else addToast('success', 'Profile updated successfully')
  ```
  Keep the `try/catch` for unexpected throws (auth/network) → generic `'Update failed'` toast; `finally` clears `isPending` (no more stuck "Saving…").
- **Client MIME check:** add to the live `onFileSelect` handler, before resizing:
  ```ts
  if (!file.type.startsWith('image/')) { addToast('error', 'Please select an image file'); return }
  ```
- **Dead-code cleanup:** remove the unused `handleFileChange` function; move the `currentResizedBlob` ref declaration up with the other refs (it's currently declared after the `handleSubmit` that uses it). No behavioral change from the cleanup.

### Testing
- `tests/lib/avatarValidation.test.ts` — unit: valid JPEG under 2 MB → null; non-JPEG (`image/png`, `image/gif`) → "Only JPG images are allowed"; JPEG over 2 MB → "Image must be smaller than 2MB"; exactly at the limit → null.
- `tests/components/profileForm.test.tsx` (jsdom + RTL, mock `@/app/actions/settings` and ToastProvider): submitting when `updateProfile` resolves `{ error: 'X' }` shows an error toast with "X"; when it resolves `{ success: true }` shows the success toast; `isPending` is cleared either way.

---

## Branch / Deploy

- One branch (`feat/usabilityClusterN3`). Code-only, **no migration**.
- Annotate N3.6, N3.8, N3.9 in `docs/newissues.md` as resolved (with branch + date), preserving original ticket text.
- Local-test, get user approval before merge/deploy. Back up prod DB before deploy; verify `/login` → 200 after. Lint with `npx eslint`; `npm run build` before merge.

## Out of Scope

- The N3.15 timezone-bucketing follow-up.
- The streak recovery flow / `streakRecovery.ts` logic.
- Any schema change or change to the `setUserTimezone` / earning server logic.
