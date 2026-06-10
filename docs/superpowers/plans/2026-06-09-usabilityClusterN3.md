# Usability Cluster (N3.6 / N3.8 / N3.9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent usability fixes — accurate streak-item copy (N3.6), preview+confirm on timezone change (N3.8), and `{ error }`-returning `updateProfile` + client image validation (N3.9).

**Architecture:** N3.9 extracts a pure `validateAvatarFile` helper (unit-tested) used by the server action and mirrored client-side; the action returns `{ error }` and the form renders it. N3.8 adds a client-side pending/confirm gate to `TimezonePicker` (server action unchanged). N3.6 is copy-only edits to two existing popovers, grounded in verified mechanics. No schema changes, no migration.

**Tech Stack:** Next.js 16 (server actions), Prisma/SQLite, TypeScript, Tailwind v4, Vitest + React Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-09-usabilityClusterN3-design.md`

---

## File Structure

- **New** `lib/avatarValidation.ts` — pure `validateAvatarFile` + `AVATAR_MAX_BYTES`.
- **New** `tests/lib/avatarValidation.test.ts`.
- **Modify** `app/actions/settings.ts` — `updateProfile` uses the helper and returns `{ error }`.
- **Modify** `app/settings/ProfileForm.tsx` — handle `{ error }`, add MIME check, remove dead code.
- **New** `tests/components/profileForm.test.tsx`.
- **Modify** `app/settings/TimezonePicker.tsx` — pending + confirm gate.
- **New** `tests/components/timezonePicker.test.tsx`.
- **Modify** `components/StreakFreezeItem.tsx`, `components/StreakShieldItem.tsx` — popover copy.
- **Modify** `docs/newissues.md` — annotate N3.6/N3.8/N3.9 resolved.

---

## Task 1: Pure `validateAvatarFile` helper + unit tests (N3.9 core)

**Files:**
- Create: `lib/avatarValidation.ts`
- Test: `tests/lib/avatarValidation.test.ts`

- [ ] **Step 1: Write the failing test `tests/lib/avatarValidation.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { validateAvatarFile, AVATAR_MAX_BYTES } from '@/lib/avatarValidation'

describe('validateAvatarFile', () => {
  it('accepts a JPEG under the size limit', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: 1000 })).toBeNull()
  })

  it('accepts a JPEG exactly at the limit', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: AVATAR_MAX_BYTES })).toBeNull()
  })

  it('rejects non-JPEG images', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 1000 })).toBe('Only JPG images are allowed')
    expect(validateAvatarFile({ type: 'image/gif', size: 1000 })).toBe('Only JPG images are allowed')
  })

  it('rejects a JPEG over the size limit', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: AVATAR_MAX_BYTES + 1 })).toBe('Image must be smaller than 2MB')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/lib/avatarValidation.test.ts`
Expected: FAIL — cannot resolve `@/lib/avatarValidation`.

- [ ] **Step 3: Implement `lib/avatarValidation.ts`**

```ts
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/** Returns an error message if the avatar file is invalid, else null. */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
    if (!file.type.startsWith('image/jpeg')) return 'Only JPG images are allowed'
    if (file.size > AVATAR_MAX_BYTES) return 'Image must be smaller than 2MB'
    return null
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run tests/lib/avatarValidation.test.ts`
Expected: PASS (4 tests). Then `npx eslint lib/avatarValidation.ts tests/lib/avatarValidation.test.ts` → no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/avatarValidation.ts tests/lib/avatarValidation.test.ts
git commit -m "feat(settings): add pure validateAvatarFile helper with unit tests"
```

---

## Task 2: `updateProfile` returns `{ error }`; ProfileForm handles it + MIME check + cleanup (N3.9)

**Files:**
- Modify: `app/actions/settings.ts`
- Modify: `app/settings/ProfileForm.tsx`
- Test: `tests/components/profileForm.test.tsx`

- [ ] **Step 1: Update `updateProfile` in `app/actions/settings.ts`**

Add this import near the top (with the other imports):
```ts
import { validateAvatarFile } from "@/lib/avatarValidation"
```
Then, inside `updateProfile`, replace the avatar validation block. Current code:
```ts
    // 2. Handle Avatar Upload if present
    if (file && file.size > 0) {
        // Validation
        if (!file.type.startsWith("image/jpeg")) {
            throw new Error("Only JPG images are allowed")
        }
        if (file.size > 2 * 1024 * 1024) {
            throw new Error("Image must be smaller than 2MB")
        }
```
Replace with:
```ts
    // 2. Handle Avatar Upload if present
    if (file && file.size > 0) {
        const avatarError = validateAvatarFile(file)
        if (avatarError) return { error: avatarError }
```
Leave the rest of the block (buffer write, old-avatar deactivation, new record, `revalidatePath`, `return { success: true }`) unchanged. The auth guards at the top stay as `throw new Error("Unauthorized")`.

- [ ] **Step 2: Write the failing ProfileForm test `tests/components/profileForm.test.tsx`**

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const updateProfileMock = vi.fn()
vi.mock('@/app/actions/settings', () => ({
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
}))
const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { ProfileForm } from '@/app/settings/ProfileForm'

afterEach(() => { cleanup(); updateProfileMock.mockReset(); addToastMock.mockReset() })

function renderForm() {
  return render(
    <ProfileForm userId="u1" activeAvatar={null} initialName="Sam" initialEmail="s@x.com" initialBio={null} />
  )
}

describe('ProfileForm error handling', () => {
  it('shows the specific error toast when updateProfile returns { error }', async () => {
    updateProfileMock.mockResolvedValue({ error: 'Only JPG images are allowed' })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith('error', 'Only JPG images are allowed'))
  })

  it('shows the success toast when updateProfile succeeds', async () => {
    updateProfileMock.mockResolvedValue({ success: true })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith('success', 'Profile updated successfully'))
  })
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run tests/components/profileForm.test.tsx`
Expected: FAIL — the current `handleSubmit` always toasts success on resolve (it doesn't inspect the result), so the first test (error case) fails.

- [ ] **Step 4: Update `app/settings/ProfileForm.tsx`**

Make these edits:

(a) **Hoist the `currentResizedBlob` ref** up with the other refs. Add it right after the existing `formRef` line:
```tsx
    const currentResizedBlob = useRef<Blob | null>(null)
```
and DELETE the later duplicate declaration `// Determine the current blob to send` / `const currentResizedBlob = useRef<Blob | null>(null)` (currently ~line 117-118).

(b) **Delete the dead `handleFileChange` function** entirely (the first file handler, currently ~lines 22-48 — the one that is never wired to an input; the live handler is `onFileSelect`). Keep `resizeImage` and `onFileSelect`.

(c) **Add the client-side MIME check** to `onFileSelect`, before resizing. Current:
```tsx
    const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Preview immediately (even if big) or wait? 
        // Resize first.
        const blob = await resizeImage(file, 500)
```
becomes:
```tsx
    const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith('image/')) {
            addToast('error', 'Please select an image file')
            return
        }

        const blob = await resizeImage(file, 500)
```

(d) **Handle the `{ error }` result** in `handleSubmit`. Current:
```tsx
        try {
            await updateProfile(userId, formData)
            addToast('success', 'Profile updated successfully')
        } catch (err) {
            console.error(err)
            addToast('error', 'Update failed')
        } finally {
            setIsPending(false)
        }
```
becomes:
```tsx
        try {
            const result = await updateProfile(userId, formData)
            if (result && 'error' in result) {
                addToast('error', result.error)
            } else {
                addToast('success', 'Profile updated successfully')
            }
        } catch (err) {
            console.error(err)
            addToast('error', 'Update failed')
        } finally {
            setIsPending(false)
        }
```

- [ ] **Step 5: Run tests + lint**

Run: `npx vitest run tests/components/profileForm.test.tsx` → expect 2 pass.
Run: `npx eslint app/actions/settings.ts app/settings/ProfileForm.tsx` → no errors (confirms the dead `handleFileChange` removal left no unused refs/imports).
Run: `npm run build` → green.

- [ ] **Step 6: Commit**

```bash
git add app/actions/settings.ts app/settings/ProfileForm.tsx tests/components/profileForm.test.tsx
git commit -m "feat(settings): updateProfile returns { error }; ProfileForm shows it + client MIME check (N3.9)"
```

---

## Task 3: Timezone preview + confirm (N3.8)

**Files:**
- Modify: `app/settings/TimezonePicker.tsx`
- Test: `tests/components/timezonePicker.test.tsx`

- [ ] **Step 1: Write the failing test `tests/components/timezonePicker.test.tsx`**

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const setTzMock = vi.fn()
vi.mock('@/app/actions/settings', () => ({
  setUserTimezone: (...args: unknown[]) => setTzMock(...args),
}))
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

import { TimezonePicker } from '@/app/settings/TimezonePicker'

afterEach(() => { cleanup(); setTzMock.mockReset() })

// Open the dropdown by clicking the display row, then pick Los Angeles from the common list.
function openAndPickLA() {
  fireEvent.click(screen.getByText(/New.York/))
  fireEvent.click(screen.getByRole('button', { name: /Los.Angeles/ }))
}

describe('TimezonePicker preview + confirm (N3.8)', () => {
  it('selecting a timezone shows the confirm bar and does NOT save yet', () => {
    render(<TimezonePicker currentTimezone="America/New_York" />)
    openAndPickLA()
    expect(screen.getByText(/roll over at midnight/i)).toBeInTheDocument()
    expect(setTzMock).not.toHaveBeenCalled()
  })

  it('Confirm saves the pending timezone', async () => {
    setTzMock.mockResolvedValue({ success: true })
    render(<TimezonePicker currentTimezone="America/New_York" />)
    openAndPickLA()
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }))
    await waitFor(() => expect(setTzMock).toHaveBeenCalledWith('America/Los_Angeles'))
  })

  it('Cancel discards the pending change without saving', () => {
    render(<TimezonePicker currentTimezone="America/New_York" />)
    openAndPickLA()
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))
    expect(screen.queryByText(/roll over at midnight/i)).not.toBeInTheDocument()
    expect(setTzMock).not.toHaveBeenCalled()
  })
})
```

Note: the labels rendered by `getTimezoneLabel` include an offset suffix, so the regex selectors (`/New.York/`, `/Los.Angeles/`) match the city portion regardless of offset. If `Intl.supportedValuesOf('timeZone')` is unavailable in the test runtime and the common list renders empty, the implementer must make the selection robust (e.g. type into the search box to surface the option) — but must NOT weaken the three core assertions: no save on select, save on Confirm, no save on Cancel.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/components/timezonePicker.test.tsx`
Expected: FAIL — current `handleSelect` saves immediately (so "does NOT save yet" fails and there is no confirm bar).

- [ ] **Step 3: Add pending state + confirm/cancel handlers**

In `app/settings/TimezonePicker.tsx`, add a `pendingTz` state alongside the others (after `const [isPending, setIsPending] = useState(false)`):
```tsx
    const [pendingTz, setPendingTz] = useState<string | null>(null)
```

Replace the existing `handleSelect` with a version that only stages the change:
```tsx
    const handleSelect = (tz: string) => {
        setIsOpen(false)
        setSearch('')
        if (tz === selected) { setPendingTz(null); return }
        setPendingTz(tz)
    }

    const confirmChange = async () => {
        if (!pendingTz) return
        setIsPending(true)
        try {
            await setUserTimezone(pendingTz)
            setSelected(pendingTz)
            addToast('success', 'Timezone updated')
            setPendingTz(null)
        } catch {
            addToast('error', 'Failed to update timezone')
            setPendingTz(null)
        } finally {
            setIsPending(false)
        }
    }

    const cancelChange = () => setPendingTz(null)
```

- [ ] **Step 4: Render the confirm bar**

In the JSX, immediately AFTER the closing of the dropdown block `{isOpen && ( ... )}` and BEFORE the component's outer closing `</div>`, add:
```tsx
            {pendingTz && (
                <div className="mt-2 rounded-lg border border-white/10 bg-black/40 p-3 text-sm">
                    <p className="text-gray-300">
                        Your daily entries will roll over at midnight{' '}
                        <span className="text-white font-medium">{getTimezoneLabel(pendingTz)}</span>.
                    </p>
                    <div className="mt-2 flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={cancelChange}
                            disabled={isPending}
                            className="px-3 py-1.5 rounded-md border border-white/10 text-gray-300 hover:bg-white/5 text-xs disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirmChange}
                            disabled={isPending}
                            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs disabled:opacity-50"
                        >
                            {isPending ? 'Saving…' : 'Confirm'}
                        </button>
                    </div>
                </div>
            )}
```

- [ ] **Step 5: Run tests + lint + build**

Run: `npx vitest run tests/components/timezonePicker.test.tsx` → expect 3 pass.
Run: `npx eslint app/settings/TimezonePicker.tsx` → no errors.
Run: `npm run build` → green.

- [ ] **Step 6: Commit**

```bash
git add app/settings/TimezonePicker.tsx tests/components/timezonePicker.test.tsx
git commit -m "feat(settings): preview + confirm before applying a timezone change (N3.8)"
```

---

## Task 4: Correct & sharpen streak-item popovers (N3.6, copy only)

**Files:**
- Modify: `components/StreakFreezeItem.tsx`
- Modify: `components/StreakShieldItem.tsx`

- [ ] **Step 1: Replace the freeze popover copy**

In `components/StreakFreezeItem.tsx`, replace the `{showInfo && ( ... )}` popover block. Current:
```tsx
            {showInfo && (
                <div className="border-t border-white/5 px-4 py-3 text-xs text-gray-400 space-y-1.5">
                    <p>Journal <strong className="text-white">{STREAK_FREEZE.earningInterval} consecutive days</strong> to earn a freeze.</p>
                    <p>Hold up to <strong className="text-white">{STREAK_FREEZE.maxQuantity}</strong> at a time. Miss a day? Use a freeze to keep your streak.</p>
                    <p>You have <strong className="text-white">{STREAK_FREEZE.graceWindowDays} days</strong> to decide before a streak is lost.</p>
                </div>
            )}
```
Replace with:
```tsx
            {showInfo && (
                <div className="border-t border-white/5 px-4 py-3 text-xs text-gray-400 space-y-1.5">
                    <p>Earn a freeze for every <strong className="text-white">{STREAK_FREEZE.earningInterval} days you journal</strong> — your first entry each day counts one step. Missing a day pauses progress; it doesn&apos;t reset it.</p>
                    <p>Hold up to <strong className="text-white">{STREAK_FREEZE.maxQuantity}</strong> at a time.</p>
                    <p>If you miss a day, a freeze keeps your streak alive. Freezes cover short gaps — <strong className="text-white">up to {STREAK_FREEZE.graceWindowDays} missed days</strong> — and are used first.</p>
                </div>
            )}
```

- [ ] **Step 2: Replace the shield popover copy**

In `components/StreakShieldItem.tsx`, replace the `{showInfo && ( ... )}` popover block. Current:
```tsx
            {showInfo && (
                <div className="border-t border-white/5 px-4 py-3 text-xs text-gray-400 space-y-1.5">
                    <p>Journal <strong className="text-white">{STREAK_SHIELD.earningInterval} consecutive days</strong> to earn a shield.</p>
                    <p>Hold up to <strong className="text-white">{STREAK_SHIELD.maxQuantity}</strong> at a time. Shields cover missed days with no time limit.</p>
                    <p>When freezes can&apos;t reach, shields pick up the slack.</p>
                </div>
            )}
```
Replace with:
```tsx
            {showInfo && (
                <div className="border-t border-white/5 px-4 py-3 text-xs text-gray-400 space-y-1.5">
                    <p>Earn a shield for every <strong className="text-white">{STREAK_SHIELD.earningInterval} days you journal</strong> — your first entry each day counts one step. Missing a day pauses progress; it doesn&apos;t reset it.</p>
                    <p>Hold up to <strong className="text-white">{STREAK_SHIELD.maxQuantity}</strong> at a time.</p>
                    <p>Shields cover <strong className="text-white">longer gaps that freezes can&apos;t reach, with no time limit</strong> — they&apos;re used after freezes.</p>
                </div>
            )}
```

- [ ] **Step 3: Lint + build**

Run: `npx eslint components/StreakFreezeItem.tsx components/StreakShieldItem.tsx` → no errors (apostrophes are written as `&apos;` to satisfy `react/no-unescaped-entities`).
Run: `npm run build` → green.

- [ ] **Step 4: Commit**

```bash
git add components/StreakFreezeItem.tsx components/StreakShieldItem.tsx
git commit -m "fix(inventory): correct streak freeze/shield popover copy (N3.6)"
```

---

## Task 5: Annotate the tracker + full verification

**Files:**
- Modify: `docs/newissues.md`
- (verification only otherwise)

- [ ] **Step 1: Annotate N3.6, N3.8, N3.9 in `docs/newissues.md`**

Under each of the three headings (`### N3.6 …`, `### N3.8 …`, `### N3.9 …`), append one resolution line (preserve the original ticket text). Use:
- N3.6: `**Resolved (2026-06-09, feat/usabilityClusterN3):** per-item info popovers already existed; corrected inaccurate copy ("consecutive" → cumulative journaling days) and sharpened the freeze-vs-shield distinction (freezes first, ≤2-day gaps; shields cover longer gaps).`
- N3.8: `**Resolved (2026-06-09, feat/usabilityClusterN3):** timezone changes now stage a pending selection with a "roll over at midnight {tz}" preview and require Confirm before saving.`
- N3.9: `**Resolved (2026-06-09, feat/usabilityClusterN3):** updateProfile now returns { error } for avatar validation (via pure validateAvatarFile); ProfileForm shows the specific error and clears "Saving…", and the live file handler validates MIME client-side. Dead handleFileChange removed.`

- [ ] **Step 2: Full suite + build**

Run: `npm test`
Expected: all green — prior tests plus the new `avatarValidation` (4), `profileForm` (2), `timezonePicker` (3).
Run: `npm run build`
Expected: green.

- [ ] **Step 3: Commit the annotation**

```bash
git add docs/newissues.md
git commit -m "docs(newissues): mark N3.6/N3.8/N3.9 resolved (feat/usabilityClusterN3)"
```

- [ ] **Step 4: Visual verification on the dev server (`npm run dev`)**

- `/inventory`: open both ⓘ popovers — copy reads "every N days you journal" (not "consecutive"), freeze says "used first / up to 2 missed days", shield says "longer gaps … used after freezes".
- `/settings`: pick a different timezone → confirm bar appears with the "roll over at midnight {tz}" preview; the picker still shows the old tz; **Cancel** discards it (no change); pick again + **Confirm** → saves, success toast, picker updates.
- `/settings`: trigger a profile save → success toast; (optionally) a forced `{ error }` path shows the specific message and the button leaves "Saving…".

- [ ] **Step 5: Report results for user review.** Do not merge or deploy — await user approval.

---

## Notes

- **No migration** (no `prisma/` changes).
- **Do not** merge/deploy without user approval. Back up the prod DB before deploy; verify `/login` → 200 after. Lint with `npx eslint`; `npm run build` before merge.
- N3.9: `updateProfile`'s auth guards intentionally remain `throw` (not user-actionable); only avatar validation returns `{ error }`.
