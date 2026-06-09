# Performance & Usability Audit — Master Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 performance and usability issues identified in the web quality audit, ordered by impact.

**Architecture:** Each task is independent and can be executed in parallel by separate subagents. No task depends on another. Each produces a working commit.

**Tech Stack:** Next.js 16, React 19, Prisma 6, Tailwind CSS v4, TypeScript 5

---

## Task Overview

| # | Task | Category | Severity | Plan File |
|---|------|----------|----------|-----------|
| 1 | Parallelize dashboard queries | Performance | High | `plan-01-parallelize-dashboard-queries.md` |
| 2 | Switch `<img>` to `next/image` | Performance | Critical | `plan-02-next-image-migration.md` |
| 3 | Eliminate duplicate queries in DailyJournalForm | Performance | High | `plan-03-deduplicate-journal-form-queries.md` |
| 4 | Fix login button disabled state | Accessibility | High | `plan-04-fix-login-button-disabled.md` |
| 5 | Add `prefers-reduced-motion` support | Accessibility | Medium | `plan-05-prefers-reduced-motion.md` |
| 6 | Add aria labels to sidebar buttons | Accessibility | Medium | `plan-06-aria-labels-sidebar.md` |
| 7 | Fix N+1 query in getActivePrompts | Performance | High | `plan-07-fix-n-plus-1-prompts.md` |

## Execution Strategy

Some plans share files. To avoid merge conflicts, execute in two waves:

**Wave 1 (fully parallel — no file overlap):**
- Plan 4: `app/login/page.tsx`
- Plan 5: `app/globals.css`
- Plan 7: `app/lib/data.ts`

**Wave 2 (sequential — shared files):**
- Plan 6: `components/DashboardShell.tsx` (aria labels)
- Plan 2: `components/DashboardShell.tsx` + `app/page.tsx` + `app/dashboard/page.tsx` + `app/stats/page.tsx` + `app/settings/page.tsx` (image migration)
- Plan 1: `app/dashboard/page.tsx` (query parallelization)
- Plan 3: `app/dashboard/page.tsx` + `components/DailyJournalForm.tsx` (depends on Plan 1's structure)

**After all tasks complete:** Run `npm run build` to verify no type errors or build failures.
