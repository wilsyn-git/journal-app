# NewUserForm Password Field (#71) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin create-user password field masked by default with Show/Hide and Generate controls (#71), without breaking form submission.

**Architecture:** A new pure, testable `generatePassword` util; the existing `'use client'` `NewUserForm` becomes a controlled input with mask-toggle and generate behavior. One feature branch (`fix/newuser-password-71`, already created). No new dependencies, no DB/schema/migration changes.

**Tech Stack:** TypeScript, React client component, Web Crypto (`crypto.getRandomValues`), Vitest + @testing-library/react (jsdom per-file pragma), `@/` path alias.

**Spec:** `docs/superpowers/specs/2026-06-11-newuser-password-71-design.md`

---

## File Structure

- `lib/generatePassword.ts` — **create**: `generatePassword(length, randomInts)` + default `secureRandomInts`.
- `tests/lib/generatePassword.test.ts` — **create**: deterministic unit tests.
- `components/admin/NewUserForm.tsx` — **modify**: controlled masked password field + Show/Hide + Generate + clear-on-success.
- `tests/components/newUserForm.test.tsx` — **create**: mask/toggle/generate component tests.

---

## Task 1: `generatePassword` util (#71)

**Files:**
- Create: `lib/generatePassword.ts`
- Test: `tests/lib/generatePassword.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/generatePassword.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generatePassword } from '@/lib/generatePassword'

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'

describe('generatePassword', () => {
  it('returns a string of the requested length', () => {
    expect(generatePassword(16, (n) => Array(n).fill(0))).toHaveLength(16)
    expect(generatePassword(24, (n) => Array(n).fill(0))).toHaveLength(24)
  })

  it('defaults to length 16', () => {
    expect(generatePassword(undefined, (n) => Array(n).fill(0))).toHaveLength(16)
  })

  it('maps each random int to charset[int % charset.length]', () => {
    const pw = generatePassword(3, () => [0, 1, 2])
    expect(pw).toBe(CHARSET.slice(0, 3))
  })

  it('only produces characters from the charset (real RNG)', () => {
    const pw = generatePassword(64)
    for (const ch of pw) expect(CHARSET).toContain(ch)
  })

  it('produces different output for different random inputs', () => {
    const a = generatePassword(8, () => [0, 0, 0, 0, 0, 0, 0, 0])
    const b = generatePassword(8, () => [1, 1, 1, 1, 1, 1, 1, 1])
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/generatePassword.test.ts`
Expected: FAIL — cannot find module `@/lib/generatePassword`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/generatePassword.ts`:

```typescript
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'

/**
 * Returns `count` non-negative 32-bit integers from the platform CSPRNG.
 * Separated out so generatePassword can be unit-tested with a deterministic
 * fake instead of real randomness.
 */
export function secureRandomInts(count: number): number[] {
    const arr = new Uint32Array(count)
    crypto.getRandomValues(arr)
    return Array.from(arr)
}

/**
 * Generates a strong password of `length` characters drawn from a mixed
 * charset (upper, lower, digits, symbols). #71: used by the admin create-user
 * form's Generate button. `randomInts` is injectable for testing.
 */
export function generatePassword(
    length = 16,
    randomInts: (count: number) => number[] = secureRandomInts,
): string {
    const ints = randomInts(length)
    let out = ''
    for (let i = 0; i < length; i++) {
        out += CHARSET[ints[i] % CHARSET.length]
    }
    return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/generatePassword.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 5: Commit**

```bash
git add lib/generatePassword.ts tests/lib/generatePassword.test.ts
git commit -m "feat(security): add generatePassword util (#71)"
```

---

## Task 2: Masked password field with Show/Hide + Generate (#71)

**Files:**
- Modify: `components/admin/NewUserForm.tsx`
- Test: `tests/components/newUserForm.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `tests/components/newUserForm.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

vi.mock('@/app/actions/users', () => ({ createUser: vi.fn() }))
const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { NewUserForm } from '@/components/admin/NewUserForm'

afterEach(() => { cleanup(); addToastMock.mockReset() })

function openForm() {
  render(<NewUserForm />)
  fireEvent.click(screen.getByRole('button', { name: /create user/i }))
}

describe('NewUserForm password field', () => {
  it('renders the password field masked by default', () => {
    openForm()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('Show toggles the field to text and back', () => {
    openForm()
    const field = screen.getByLabelText('Password')
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    expect(field).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: /hide/i }))
    expect(field).toHaveAttribute('type', 'password')
  })

  it('Generate fills the field and reveals it', () => {
    openForm()
    const field = screen.getByLabelText('Password') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: /generate/i }))
    expect(field).toHaveAttribute('type', 'text')
    expect(field.value.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/newUserForm.test.tsx`
Expected: FAIL — by default the field is `type="text"` (the masked-default test fails), and there are no Show/Generate buttons.

- [ ] **Step 3: Add state and import**

In `components/admin/NewUserForm.tsx`, add the import near the top (after the existing imports):

```typescript
import { generatePassword } from "@/lib/generatePassword"
```

Inside the `NewUserForm` component, just below the existing `const [isOpen, setIsOpen] = useState(false);`, add:

```typescript
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
```

- [ ] **Step 4: Clear the field on successful create**

The component has this effect:

```typescript
    useEffect(() => {
        if (state?.success) {
            addToast('success', 'User created successfully');
            setIsOpen(false);
        }
    }, [state]);
```

Add the two reset lines so a reopened form starts clean:

```typescript
    useEffect(() => {
        if (state?.success) {
            addToast('success', 'User created successfully');
            setIsOpen(false);
            setPassword('');
            setShowPassword(false);
        }
    }, [state]);
```

- [ ] **Step 5: Replace the password field block**

Replace the entire password `<div>` block (the label + input + hint paragraph, currently:

```tsx
                <div>
                    <label htmlFor="new-user-password" className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                    <input
                        id="new-user-password"
                        name="password"
                        type="text"
                        required
                        placeholder="Initial Password"
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">Make sure to copy this password to share with the user.</p>
                </div>
```

) with:

```tsx
                <div>
                    <label htmlFor="new-user-password" className="block text-sm font-medium text-gray-300 mb-2">Password</label>
                    <div className="flex gap-2">
                        <input
                            id="new-user-password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Initial Password"
                            className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            className="px-3 rounded-lg bg-white/5 text-white text-sm hover:bg-white/10 transition-colors"
                        >
                            {showPassword ? 'Hide' : 'Show'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}
                            className="px-3 rounded-lg bg-white/5 text-white text-sm hover:bg-white/10 transition-colors"
                        >
                            Generate
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Use Generate or type a password, then copy it to share with the new user.</p>
                </div>
```

- [ ] **Step 6: Run the component test to verify it passes**

Run: `npm test -- tests/components/newUserForm.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 7: Verify the build type-checks**

Run: `npx tsc --noEmit`
Expected: no errors related to `NewUserForm.tsx`.

- [ ] **Step 8: Commit**

```bash
git add components/admin/NewUserForm.tsx tests/components/newUserForm.test.tsx
git commit -m "fix(security): mask NewUserForm password with Show/Hide + Generate (#71)"
```

---

## Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green, including the two new files.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 3: Dev-server smoke test**

Start the dev server (`npm run dev`), open the admin users page, click **+ Create User**:
- The Password field is masked (dots) by default.
- **Show** reveals the text; **Hide** masks it again.
- **Generate** fills a long random value and reveals it.
- Filling name/email + the password and clicking **Create Account** still creates the user (form submission unchanged).

- [ ] **Step 4: Update issue trackers**

Mark #71 closed in `docs/issuesMerged.md` (move it out of the OPEN UX table to the FIXED table; update the Tally) and in `ISSUES.md` (add to a Recently Closed subsection; remove from the open UX table).

```bash
git add docs/issuesMerged.md ISSUES.md
git commit -m "docs(security): mark #71 closed in trackers"
```

---

## Self-Review Notes

- **Spec coverage:** generatePassword (util + injectable RNG) → Task 1; controlled masked field, Show/Hide, Generate auto-reveal, reworded hint, clear-on-success → Task 2; verification + trackers → Task 3. All spec sections mapped.
- **Type consistency:** `generatePassword(length = 16, randomInts = secureRandomInts): string` defined in Task 1 and called with no args in Task 2's Generate handler. `password`/`showPassword` state names used consistently across steps 3–5.
- **No placeholders:** every code step shows complete code; every run step has its command and expected result.
