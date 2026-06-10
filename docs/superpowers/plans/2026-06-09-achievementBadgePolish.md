# Achievement Badge Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pronounced, premium hover treatment (lift, violet glow ring, diagonal shine sweep, icon pop) to the achievement cards on `/stats`, with no pointer affordance and full `prefers-reduced-motion` support.

**Architecture:** Purely presentational. Register a `shine` keyframe in `app/globals.css` following the project's existing `@theme inline` animation convention, add a scoped `prefers-reduced-motion` guard, then apply Tailwind hover/group-hover utilities (plus three stable classes for the reduced-motion guard to target) to the card markup in `components/stats/AchievementGrid.tsx`. No logic, props, data, or rendering-structure changes.

**Tech Stack:** Next.js 16 (RSC), Tailwind CSS v4 (`@theme inline`), TypeScript. Lint with `npx eslint`; build with `npm run build`.

**Spec:** `docs/superpowers/specs/2026-06-09-achievementBadgePolish-design.md`

---

## File Structure

- **Modify** `app/globals.css` — add `--animate-shine` + `@keyframes shine` inside the existing `@theme inline { ... }` block; add a `@media (prefers-reduced-motion: reduce)` guard in the base/global section (after `@theme`).
- **Modify** `components/stats/AchievementGrid.tsx` — card container, shine overlay, content stacking, and icon className changes only. No changes to the type, props, `earned`/`progressPercent` derivations, or the tier/progress/label JSX.

---

## Task 1: Register the shine animation and reduced-motion guard in globals.css

**Files:**
- Modify: `app/globals.css` (animation in `@theme inline` block ~lines 59–82; new media query after the `@theme` block closes at line 83)

- [ ] **Step 1: Add the shine animation inside `@theme inline`**

In `app/globals.css`, the `@theme inline` block already defines `--animate-fade-in` / `--animate-slide-up` and their `@keyframes`. Immediately after the existing `--animate-slide-up: slide-up 0.7s ease-out forwards;` line (line 60), add the shine animate variable:

```css
  --animate-shine: shine 0.7s ease-out;
```

Then, after the existing `@keyframes slide-up { ... }` block (which ends at line 82) and **before** the closing `}` of `@theme inline` (line 83), add:

```css
  @keyframes shine {
    0% {
      transform: translateX(-120%);
    }

    100% {
      transform: translateX(120%);
    }
  }
```

- [ ] **Step 2: Add the scoped reduced-motion guard after the `@theme` block**

After the `@theme inline { ... }` block closes (line 83) and before the `/* Base Styles */` comment (line 85), add:

```css
@media (prefers-reduced-motion: reduce) {
  .achievement-card:hover,
  .achievement-card:hover .achievement-icon {
    transform: none !important;
  }

  .achievement-shine {
    display: none !important;
  }
}
```

- [ ] **Step 3: Verify the build still compiles**

Run: `npm run build`
Expected: build completes green. (At this point `animate-shine` and the three classes are defined but not yet used — that's fine; Tailwind v4 generates `animate-shine` from the `--animate-shine` theme var, and the media query is valid CSS.)

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(stats): add shine keyframe and reduced-motion guard for achievement polish"
```

---

## Task 2: Apply the pronounced hover treatment to the achievement cards

**Files:**
- Modify: `components/stats/AchievementGrid.tsx:24-35` (card container `<div>`, inner content row, and icon `<span>`)

This task replaces the card container className, inserts a shine overlay for earned cards, adds `relative z-10` to the content row, and tags the icon. The current code (lines 24–35) is:

```tsx
                    <div
                        key={a.id}
                        className={`
                            p-4 rounded-xl border transition-all
                            ${earned
                                ? 'bg-purple-900/20 border-purple-500/30 text-white'
                                : 'bg-white/5 border-white/5 text-gray-500'
                            }
                        `}
                    >
                        <div className="flex items-start gap-3">
                            <span className={`text-3xl ${earned ? '' : 'grayscale opacity-50'}`}>{a.icon}</span>
```

- [ ] **Step 1: Replace the card container, add the shine overlay, stack content, and tag the icon**

Replace the block above (lines 24–35) with:

```tsx
                    <div
                        key={a.id}
                        className={`
                            achievement-card group relative overflow-hidden p-4 rounded-xl border transition-all duration-300
                            ${earned
                                ? 'bg-purple-900/20 border-purple-500/30 text-white hover:-translate-y-1.5 hover:scale-[1.02] hover:bg-purple-900/40 hover:border-purple-400/80 hover:shadow-[0_14px_36px_rgba(139,92,246,0.35),0_0_18px_rgba(139,92,246,0.25)]'
                                : 'bg-white/5 border-white/5 text-gray-500 hover:-translate-y-1 hover:scale-[1.01] hover:bg-white/10 hover:border-white/15'
                            }
                        `}
                    >
                        {earned && (
                            <div
                                className="achievement-shine absolute inset-0 z-0 pointer-events-none -translate-x-[120%] group-hover:animate-shine"
                                style={{
                                    background:
                                        'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.14) 50%, transparent 60%)',
                                }}
                            />
                        )}
                        <div className="flex items-start gap-3 relative z-10">
                            <span
                                className={`achievement-icon text-3xl transition-transform duration-300 ${earned ? 'group-hover:scale-[1.22] group-hover:rotate-6' : 'grayscale opacity-50'}`}
                            >
                                {a.icon}
                            </span>
```

Leave everything from `<div className="flex-1 min-w-0">` (line 36) onward unchanged.

- [ ] **Step 2: Lint the changed files**

Run: `npx eslint components/stats/AchievementGrid.tsx app/globals.css`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build completes green.

- [ ] **Step 4: Commit**

```bash
git add components/stats/AchievementGrid.tsx
git commit -m "feat(stats): pronounced hover/glow/shine for achievement badges"
```

---

## Task 3: Visual verification on the running app

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts (typically on http://localhost:3000). Navigate to `/stats` for an org/account that has at least one earned and one locked achievement.

- [ ] **Step 2: Verify the earned-card hover**

Hover an earned (unlocked) achievement card. Confirm all of:
- Card lifts and scales up slightly (`-translate-y-1.5`, `scale-[1.02]`).
- Background deepens to violet and the border brightens.
- A violet glow ring appears around the card.
- A diagonal white shine sweeps left-to-right across the card once.
- The emoji icon pops (scales up + rotates slightly).
- The cursor stays the default arrow (no pointer/hand).

- [ ] **Step 3: Verify the locked-card hover**

Hover a locked achievement card. Confirm: a smaller lift/scale, slightly brighter background/border, **no** shine sweep, **no** icon pop, default cursor.

- [ ] **Step 4: Verify reduced-motion**

In Chrome DevTools, open the Command Menu (Cmd+Shift+P) → "Emulate CSS prefers-reduced-motion: reduce". Re-hover an earned card. Confirm: no lift/scale transform, no icon pop, no shine sweep — but the static border/background hover color still applies (the card still visibly responds, just without motion).

- [ ] **Step 5: Report results**

Summarize the four checks above (pass/fail with any notes) back for user review. Do not merge or deploy — await user approval per the spec's deploy notes.

---

## Notes

- **No migration:** code-only change, no `prisma/` edits.
- **Do not** merge or deploy without user approval. Do not touch the prod DB.
- Tailwind v4 generates the `animate-shine` utility automatically from the `--animate-shine` theme variable — no `tailwind.config` entry needed (the project has no JS Tailwind config; it is CSS-first via `@theme`).
