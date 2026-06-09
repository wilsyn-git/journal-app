# Task 5: Add `prefers-reduced-motion` Support

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Respect the user's OS-level motion preference by disabling animations and transitions when `prefers-reduced-motion: reduce` is set.

**Architecture:** Add a single CSS media query to `app/globals.css` that overrides all animation and transition durations to near-zero. This is the standard approach recommended by WCAG 2.1 Success Criterion 2.3.3.

**Tech Stack:** CSS, Tailwind CSS v4

---

### Files

- Modify: `app/globals.css` (append at end of file)

---

- [ ] **Step 1: Read the current globals.css**

Read `app/globals.css` to understand the existing animations. Key animations:
- `fade-in` (0.5s ease-out) — defined in `@theme inline`
- `slide-up` (0.7s ease-out) — defined in `@theme inline`
- `animate-pulse` — Tailwind built-in, used on background gradients
- Various `transition-all duration-300` on hover effects
- `glass-card:hover` has `transition: all 0.3s ease`

- [ ] **Step 2: Add the reduced-motion media query**

Append to the end of `app/globals.css`:

```css
/* Respect user's motion preferences (WCAG 2.1 SC 2.3.3) */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This approach:
- Uses `0.01ms` instead of `0s` to ensure animation end-state is still applied (some browsers skip `animationend` events at 0s)
- Sets `animation-iteration-count: 1` to stop infinite animations like `animate-pulse`
- Disables smooth scrolling
- Uses `!important` to override inline styles and Tailwind utilities

- [ ] **Step 3: Verify the build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "fix(a11y): add prefers-reduced-motion support

Disables all animations and transitions when the user's OS
has reduced motion enabled. Covers fade-in, slide-up, pulse,
hover transforms, and smooth scrolling. WCAG 2.1 SC 2.3.3.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
