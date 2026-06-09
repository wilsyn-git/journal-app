# Task 4: Fix Login Button Disabled State

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the login button is actually disabled (not just announced as disabled) while the form is submitting, preventing double-submissions.

**Architecture:** The login button currently uses `aria-disabled={isPending}` but is missing the actual `disabled` attribute. Add `disabled={isPending}` to make it truly non-interactive during submission.

**Tech Stack:** React 19 `useActionState`, HTML button element

---

### Files

- Modify: `app/login/page.tsx` (line 69-74)

---

- [ ] **Step 1: Read the current login page**

Read `app/login/page.tsx` and confirm the button at line 69-74.

- [ ] **Step 2: Add the `disabled` attribute**

In `app/login/page.tsx`, modify the submit button (around line 69):

```tsx
// OLD (line 69-74):
<button
    className="w-full py-3.5 rounded-xl bg-primary font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:bg-primary/90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
    aria-disabled={isPending}
>
    {isPending ? 'Signing in...' : 'Sign in'}
</button>

// NEW:
<button
    className="w-full py-3.5 rounded-xl bg-primary font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:bg-primary/90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
    disabled={isPending}
    aria-disabled={isPending}
>
    {isPending ? 'Signing in...' : 'Sign in'}
</button>
```

The only change is adding `disabled={isPending}`. The existing CSS classes `disabled:opacity-50 disabled:cursor-not-allowed` will now actually take effect.

- [ ] **Step 3: Verify the build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx
git commit -m "fix(a11y): add disabled attribute to login button during submission

The button had aria-disabled but was missing the actual disabled
attribute, allowing double-submissions. Now properly disabled
while the form is pending.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
