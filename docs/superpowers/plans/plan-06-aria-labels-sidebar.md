# Task 6: Add Aria Labels to Sidebar Buttons

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accessible labels to icon-only buttons in the dashboard sidebar so screen readers can announce their purpose.

**Architecture:** Two buttons in `DashboardShell.tsx` are icon-only (hamburger menu and close button). Add `aria-label` attributes to both.

**Tech Stack:** React, HTML accessibility attributes

---

### Files

- Modify: `components/DashboardShell.tsx` (lines 37-39 and 50-53)

---

- [ ] **Step 1: Read the current file**

Read `components/DashboardShell.tsx` and locate the two buttons.

- [ ] **Step 2: Add aria-label to the mobile close button**

In `components/DashboardShell.tsx`, find the close button (around line 37):

```tsx
// OLD:
<button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">
    ✕
</button>

// NEW:
<button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white" aria-label="Close sidebar">
    ✕
</button>
```

- [ ] **Step 3: Add aria-label to the hamburger menu button**

Find the hamburger button (around line 50):

```tsx
// OLD:
<button
    onClick={() => setSidebarOpen(true)}
    className="p-1 -ml-2 text-gray-300 hover:text-white"
>

// NEW:
<button
    onClick={() => setSidebarOpen(true)}
    className="p-1 -ml-2 text-gray-300 hover:text-white"
    aria-label="Open menu"
>
```

- [ ] **Step 4: Verify the build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/DashboardShell.tsx
git commit -m "fix(a11y): add aria-label to sidebar toggle buttons

The hamburger menu and close buttons were icon-only with no
accessible names. Screen readers now announce 'Open menu' and
'Close sidebar' respectively.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
