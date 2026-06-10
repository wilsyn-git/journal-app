# Achievement Badge Visual Polish — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design)
**Scope:** Presentational only — premium "pronounced & playful" hover/glow/shine for the achievement cards on the stats page.

## Goal

Give the achievement cards on `/stats` a premium, lively feel on hover: a noticeable lift, a violet glow ring, a fast diagonal shine sweep on earned badges, and an icon pop. The treatment is the most pronounced of the three intensities reviewed (game-feel "achievement unlocked"), while staying tasteful within the existing dark/glassy aesthetic.

## Locked Design Decisions

1. **Intensity:** Pronounced & playful (Option C from visual companion review).
2. **Interactivity:** Decorative hover only — **no `cursor-pointer`**. The cards are not clickable, so they must not signal a click affordance.
3. **Reduced motion:** Respect `prefers-reduced-motion: reduce` — disable transforms and hide the shine overlay; static glow/border treatment still applies.
4. **No behavioral changes:** No props, logic, data, or rendering-structure changes. Tiers, progress bar, labels, and the `earned = a.currentTier > 0` derivation are untouched.

## Affected Files

- `app/globals.css` — register the shine animation + add the reduced-motion guard.
- `components/stats/AchievementGrid.tsx` — card markup / className changes only.

## Changes

### 1. `app/globals.css` — shine keyframe (project convention)

The project registers animations as `--animate-*` custom properties with `@keyframes` **inside** the `@theme inline { ... }` block (see existing `--animate-fade-in` / `--animate-slide-up`). Add a matching entry so the component can use the Tailwind class `animate-shine` rather than an inline arbitrary-value animation:

```css
--animate-shine: shine 0.7s ease-out;

@keyframes shine {
  0%   { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
}
```

### 2. `components/stats/AchievementGrid.tsx` — card markup

Keyed off the existing `earned` boolean. Per card:

- **Container:** add `relative overflow-hidden group` and `transition-all duration-300` to the existing card `<div>`, plus a stable `achievement-card` class so the reduced-motion guard can scope to these cards only.
  - **Earned hover:** `hover:-translate-y-1.5 hover:scale-[1.02]`, brighter background `hover:bg-purple-900/40`, bright border `hover:border-purple-400/80`, and a glow ring:
    `hover:shadow-[0_14px_36px_rgba(139,92,246,0.35),0_0_18px_rgba(139,92,246,0.25)]`.
  - **Locked hover (quieter):** `hover:-translate-y-1 hover:scale-[1.01]`, `hover:bg-white/10`, `hover:border-white/15`.
  - **No `cursor-pointer`** on either state.
- **Shine overlay (earned only):** an absolutely-positioned `<div>` rendered only when `earned`. It carries:
  - a stable class `achievement-shine` (so the reduced-motion media query can target it cleanly without fighting Tailwind utility specificity),
  - `absolute inset-0 z-0 pointer-events-none`,
  - a diagonal white gradient background (e.g. `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.14) 50%, transparent 60%)`) applied via an inline `style` (one-off value, not worth a utility),
  - initial `-translate-x-[120%]` (off-screen left) and `group-hover:animate-shine` to sweep across on hover.
- **Content stacking:** the existing inner content wrapper (the `flex items-start gap-3` row) gets `relative z-10` so it sits above the shine overlay.
- **Icon pop (earned only):** the icon `<span>` gets a stable `achievement-icon` class, `transition-transform duration-300`, and, when earned, `group-hover:scale-[1.22] group-hover:rotate-6`. Locked icon keeps its existing `grayscale opacity-50` and gets no pop.

### 3. `app/globals.css` — reduced-motion guard

Add (outside `@theme`, in the base/global section). Scope to the stable achievement classes so the guard cannot over-reach to other `.group` elements site-wide, and so it neutralizes both the card lift and the nested icon pop:

```css
@media (prefers-reduced-motion: reduce) {
  .achievement-card:hover,
  .achievement-card:hover .achievement-icon { transform: none !important; }
  .achievement-shine { display: none !important; }
}
```

## Out of Scope

- Making cards clickable / any drawer or detail view (that is the separate heatmap option).
- Changes to achievement data, tier logic, or the progress bar.
- Any new dependency.

## Verification

CSS-only with no behavioral logic — no meaningful unit test. Verify by:

1. `npx eslint components/stats/AchievementGrid.tsx app/globals.css` — clean (project lints with `npx eslint`, not `npm run lint`).
2. `npm run build` — green.
3. Local dev server eyeball of `/stats`:
   - Earned card: hover shows lift + scale + violet glow ring + shine sweep + icon pop.
   - Locked card: hover shows the quieter lift, no shine, no icon pop.
   - No pointer cursor on hover.
   - DevTools "Emulate prefers-reduced-motion: reduce": transforms and shine are gone; static border/glow still reads.

## Deploy Notes

Code-only change (no `prisma/` changes → **no migration**). Local-test and get user approval before merge/deploy. Do not touch the prod DB. After deploy: verify `/login` → 200.
