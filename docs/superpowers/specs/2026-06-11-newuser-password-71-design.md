# NewUserForm password field — masked + toggle + generate (#71)

**Date:** 2026-06-11
**Branch:** `fix/newuser-password-71`
**Scope:** Fix #71 — the admin "create user" form renders the initial-password field as `type="text"` (plaintext). Make it masked by default while preserving the admin's need to read/copy the password to hand off to the new user.

## Context

`components/admin/NewUserForm.tsx` (a `'use client'` component used by `app/admin/users/page.tsx`) has a password input at line 69 with `type="text"`, plus a hint (line 74): *"Make sure to copy this password to share with the user."* The plaintext is **intentional** — an admin sets an initial password and must read it to share it. So the fix must keep the password readable on demand, not just hide it.

Codebase conventions confirmed: no icon library (lucide/heroicons/react-icons) is in use; the login page uses a plain `type="password"` with no toggle. The form already imports `useState`. The `createUser` server action reads the password from form data via the input's `name="password"`.

## Goals / Non-goals

**Goal:** Password field masked by default, with a way to reveal it and a way to generate a strong one — without breaking the create-user form submission.

**Non-goals (YAGNI):** no icon library (use a text "Show"/"Hide" button); no password-strength meter; no guaranteed per-character-class composition; no change to any password minimum/policy (that is the separate N3.12); no change to the `createUser` server action.

## Design

### `lib/generatePassword.ts` (new — pure, testable)

```typescript
export function generatePassword(length = 16, randomInts = secureRandomInts): string
```

- Builds a password by indexing into a charset of `A–Z`, `a–z`, `0–9`, and a small symbol set (`!@#$%^&*`).
- `randomInts(count: number): number[]` returns `count` non-negative integers; the default `secureRandomInts` uses `crypto.getRandomValues(new Uint32Array(count))`. Injecting it makes the function deterministic under test.
- Each output character is `charset[randomInts()[i] % charset.length]`.
- Returns a string of exactly `length` characters.

### `components/admin/NewUserForm.tsx` (modify)

- Add state: `const [password, setPassword] = useState('')` and `const [showPassword, setShowPassword] = useState(false)`.
- Make the password input **controlled**: `value={password}`, `onChange={e => setPassword(e.target.value)}`, and `type={showPassword ? 'text' : 'password'}`. Keep `name="password"`, `required`, and the existing classes so form submission is unchanged.
- Add two small `type="button"` controls near the field:
  - **Show/Hide** — toggles `showPassword`; label is `showPassword ? 'Hide' : 'Show'`.
  - **Generate** — `setPassword(generatePassword()); setShowPassword(true)` so the generated value is immediately visible to copy.
- Reword the hint to: *"Use Generate or type a password, then copy it to share with the new user."*
- When the form closes/resets after a successful create, clear `password` and reset `showPassword` to false (the component already closes on `state?.success`; extend that effect to clear the field).

## Error handling

No new failure modes. `generatePassword` is synchronous and pure; the field stays a normal required input, so existing client/server validation in `createUser` is unaffected.

## Testing

**`tests/lib/generatePassword.test.ts`** (unit, deterministic):
- With a fake `randomInts` returning a fixed sequence, the output has the expected length and maps to the expected charset characters.
- Default length is 16; a requested length N yields N characters.
- Every character of the output is a member of the charset.

**`tests/components/newUserForm.test.tsx`** (component, @testing-library — repo already has `tests/components/*`):
- The password field renders `type="password"` by default (masked).
- Clicking **Show** switches it to `type="text"`; clicking again returns to `password`.
- Clicking **Generate** fills the field with a non-empty value and reveals it (`type="text"`).

## Verification (before merge)

- `npm test` green (new tests + existing suite).
- `npm run build` green.
- Dev-server smoke: open admin → New User; password field is masked; Show reveals it; Generate fills + reveals a strong value; submitting still creates the user.

## Deployment

Standard code deploy (backup DB → `git pull` → `npm run build` → `pm2 restart journal-app`). No migration, no new dependencies, no env changes.

## Tracker updates (on completion)

Mark #71 closed in `docs/issuesMerged.md` and `ISSUES.md`.
