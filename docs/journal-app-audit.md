# Journal App — Comprehensive Audit

**Date:** 2026-03-21
**Scope:** Performance, Accessibility, Security, SEO, UX, Architecture

This document captures findings from a full codebase audit, organized by category and priority. Each item includes the affected file(s), a description, and a suggested fix. Use this as a backlog for planning improvements.

---

## Priority Legend

- **HIGH** — Security risk, data loss potential, or significant user impact. Fix soon.
- **MEDIUM** — Degrades experience or maintainability. Plan for.
- **LOW** — Nice-to-have, minor polish, or future alignment.

---

## 1. Security (9 items)

### 1.1 [HIGH] Admin export leaks password hashes
**File:** `app/api/admin/export/route.ts:25-30`
`prisma.user.findMany()` includes `password`, `resetToken`, and `resetTokenExpiry` in the backup JSON. Even bcrypt hashes should never be exported.
**Fix:** Use `select` or `omit` to exclude sensitive fields.

### 1.2 [HIGH] No security headers
**File:** `next.config.ts`
The config has no `headers()` function. No CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy. Vulnerable to clickjacking, MIME sniffing; no HSTS.
**Fix:** Add a `headers()` async function returning security headers for all routes. ScoringApp's config has a ready-made template.

### 1.3 [HIGH] Path traversal risk in restore binary
**File:** `app/actions/restore.ts:145-162`
`restoreBinary` joins user-uploaded paths with `process.cwd()/public` without validating the resolved path stays within the target directory. A crafted path like `../../etc/cron.d/evil` could write files outside public/.
**Fix:** Use `path.resolve()` and verify the result starts with the expected directory. Reject paths containing `..`.

### 1.4 [HIGH] updateProfile lacks auth ownership check
**File:** `app/actions/settings.ts:9`
Takes `userId` as a client parameter with only a truthy check. Any user could call this with another user's ID.
**Fix:** Call `auth()` inside the function and verify `session.user.id === userId`.

### 1.5 [HIGH] Restore action accepts unvalidated data
**File:** `app/actions/restore.ts:68-121`
Parses user-uploaded JSON/gzip and inserts directly into the database via `prisma[model].create({ data: cleanItem })` with no Zod validation.
**Fix:** Validate each entity against a Zod schema before insertion.

### 1.6 [HIGH] Admin page does not verify ADMIN role
**File:** `app/admin/page.tsx:6-12`
Checks `organizationId` but not `session.user.role === 'ADMIN'`. Any authenticated user with an org can view the admin dashboard.
**Fix:** Add role check and redirect non-admins.

### 1.7 [MEDIUM] No rate limiting on auth endpoints
**Files:** `auth.ts`, `app/actions/forgot-password.ts`
No rate limiting on login attempts or password reset requests.
**Fix:** Implement rate limiting via middleware or in-memory store.

### 1.8 [MEDIUM] Error messages leak internal details
**Files:** `app/actions/admin.ts:79`, `app/actions/restore.ts:139`
Raw error messages (potentially containing schema details, file paths) returned to the client.
**Fix:** Return generic messages; log details server-side.

### 1.9 [MEDIUM] Route protection only covers /dashboard
**File:** `auth.config.ts:8-14`
`/admin`, `/settings`, `/stats`, and `/api` routes rely on per-page `auth()` checks rather than proxy-level protection. If any page forgets the check, it's exposed.
**Fix:** Switch to a public-route whitelist approach (like ScoringApp's proxy.ts pattern).

---

## 2. Performance (13 items)

### 2.1 [HIGH] Missing database indexes on JournalEntry
**File:** `prisma/schema.prisma:156-174`
No index on `userId` or `(userId, createdAt)`. Nearly every data-fetching function filters by these columns.
**Fix:** Add `@@index([userId, createdAt])` and consider `@@index([userId, promptId, createdAt])`.

### 2.2 [HIGH] getUserStats fetches ALL entries unbounded
**File:** `app/lib/analytics.ts:79-87`
Loads every journal entry (including full `answer` text) into memory for JS processing. Grows linearly with usage.
**Fix:** Split word cloud query (needs text) from streak/heatmap (only needs dates). Consider incremental computation or caching.

### 2.3 [HIGH] getUserStats not cached
**File:** `app/lib/analytics.ts:78`
Expensive computation with no `React.cache()` or cross-request caching. Recomputes from scratch every request.
**Fix:** Wrap in `React.cache()` for request dedup. Consider `unstable_cache` with time-based revalidation.

### 2.4 [MEDIUM] Duplicate auth() calls in admin actions
**File:** `app/lib/admin-actions.ts` (multiple locations)
`ensureAdmin()` calls `auth()`, then the action calls `auth()` again for `organizationId`. Two roundtrips per action.
**Fix:** Have `ensureAdmin()` return the session object.

### 2.5 [MEDIUM] Admin dashboard has sequential queries after initial parallel batch
**File:** `app/admin/page.tsx:72-133`
After the initial `Promise.all` of 5 queries, 3 more run sequentially but are independent.
**Fix:** Run all independent queries in a single `Promise.all`.

### 2.6 [MEDIUM] PromptCard missing React.memo
**File:** `components/PromptCard.tsx`
When any prompt's answer changes, ALL PromptCards re-render because `onChange` is a new closure each render.
**Fix:** Wrap in `React.memo` and memoize `onChange` callbacks with `useCallback`.

### 2.7 [MEDIUM] @dnd-kit loaded eagerly
**File:** `components/admin/ReorderPromptsDialog.tsx`
The drag-and-drop library is imported at the top level but only used when an admin clicks "Reorder."
**Fix:** Use `next/dynamic` with `ssr: false` to lazy-load.

### 2.8 [MEDIUM] Settings page makes redundant user queries
**File:** `app/settings/page.tsx:26-42`
Fetches the user twice (once for org, once for avatars/groups).
**Fix:** Combine into one `findUnique` with broader `include`.

### 2.9 [MEDIUM] Stats page makes sequential queries
**File:** `app/stats/page.tsx:50-58`
`getUserStats()`, `getActiveOrganization()`, and admin user list are called sequentially but are independent.
**Fix:** Use `Promise.all()`.

### 2.10 [MEDIUM] Dashboard fetches same user in 3+ overlapping queries
**File:** `app/dashboard/page.tsx:71-87`
Three separate `prisma.user.findUnique` calls for overlapping data on the same user.
**Fix:** Combine into one or two queries with broader includes.

### 2.11 [MEDIUM] submitEntry creates entries one-at-a-time in a loop
**File:** `app/lib/actions.ts:78-86`
Sequential `prisma.journalEntry.create()` calls inside a `for` loop.
**Fix:** Use `prisma.$transaction` with batch creates.

### 2.12 [MEDIUM] Full Prompt objects sent to client
**File:** `app/dashboard/page.tsx:159`
Passes full Prisma objects (including `organizationId`, `categoryString`, `isGlobal`, `sortOrder`, `createdAt`, etc.) to a client component.
**Fix:** Map to only needed fields: `{ id, content, type, options }`.

### 2.13 [LOW] getJournalHistory fetches all entries unbounded
**File:** `app/lib/data.ts:213-237`
Loads all entries for all time when the calendar shows one month.
**Fix:** Limit to last 12-18 months or paginate.

---

## 3. Accessibility (36 items)

### Form Labels (HIGH — 9 items)

All of these violate WCAG 1.3.1 / 4.1.2 (Level A). Labels lack `htmlFor`, inputs lack `id`.

| # | File | Fields |
|---|------|--------|
| 3.1 | `components/ChangePasswordDialog.tsx:79,91,103` | Current/New/Confirm password |
| 3.2 | `app/settings/ProfileForm.tsx:191,200,209` | Display Name, Email, Bio |
| 3.3 | `app/reset-password/[token]/page.tsx:65,79` | New/Confirm password |
| 3.4 | `components/admin/NewUserForm.tsx:39,48,60` | Name, Email, Password |
| 3.5 | `components/admin/EditUserForm.tsx:13,26` | Name, Email |
| 3.6 | `components/admin/PromptEditor.tsx:72,85,102,124` | Textarea, select, inputs |
| 3.7 | `components/admin/BrandingForm.tsx:46,64` | App Name, Upload Logo |
| 3.8 | `components/PromptCard.tsx:57-64` | TEXT textarea (no `aria-labelledby`) |
| 3.9 | `components/PromptCard.tsx:96-108` | RANGE input (no `aria-labelledby`) |

**Fix pattern:** Add matching `htmlFor`/`id` pairs, or `aria-labelledby` pointing to the prompt heading.

### Dialogs & Focus Management (HIGH — 4 items)

All custom modals lack `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, and Escape key handler. Violates WCAG 2.4.3 (Level A).

| # | File |
|---|------|
| 3.10 | `components/ChangePasswordDialog.tsx:57-145` |
| 3.11 | `components/admin/ReorderPromptsDialog.tsx:88-131` |
| 3.12 | `components/admin/DeleteCategoryButton.tsx:66-98` |
| 3.13 | `components/ChangePasswordDialog.tsx:54` — trigger div not keyboard accessible |

**Fix pattern:** Use `<dialog>` element or Radix Dialog. Add focus trap, Escape handler, focus restore on close.

### Error/Status Announcements (HIGH — 7 items)

Missing `role="alert"` or `aria-live` on error/status messages. Violates WCAG 4.1.3 (Level AA).

| # | File | Context |
|---|------|---------|
| 3.14 | `app/login/page.tsx:63-66` | Login error |
| 3.15 | `components/JournalEditor.tsx:88-101` | Save status (Saving/Saved/Error) |
| 3.16 | `components/ChangePasswordDialog.tsx:114-123` | Error/success messages |
| 3.17 | `app/forgot-password/page.tsx:63-66` | Error message |
| 3.18 | `app/reset-password/[token]/page.tsx:92-96` | Error message |
| 3.19 | `components/admin/EditUserForm.tsx:45-51` | Success/error messages |
| 3.20 | `components/providers/ToastProvider.tsx:55` | Toast container |

**Fix pattern:** Add `role="alert"` for errors, `role="status"` with `aria-live="polite"` for status updates.

### Skip Link & Landmarks (MEDIUM — 6 items)

| # | Severity | File | Issue |
|---|----------|------|-------|
| 3.21 | HIGH | `app/layout.tsx` | No skip navigation link (WCAG 2.4.1) |
| 3.22 | MEDIUM | `app/page.tsx:19` | `<header>` nested inside `<main>` |
| 3.23 | MEDIUM | `app/page.tsx:45,77,88,99` | Heading skip h1→h3 |
| 3.24 | MEDIUM | `app/settings/page.tsx:49-122` | No `<main>` landmark |
| 3.25 | MEDIUM | `app/stats/page.tsx:62-196` | No `<main>` landmark |
| 3.26 | LOW | `components/admin/AdminSidebar.tsx:39` | `<nav>` missing `aria-label` |

### Color Contrast (4 items)

| # | Severity | Issue |
|---|----------|-------|
| 3.27 | HIGH | `text-gray-500` on dark bg (#6b7280 on #09090b) ≈ 4.0:1, fails 4.5:1. Use `text-gray-400`. |
| 3.28 | MEDIUM | `text-[10px]` with gray-500 (StreakBadge, CalendarSidebar, stats) — too small + low contrast |
| 3.29 | MEDIUM | Focus ring `ring-primary/50` (half-opacity) may be too subtle on dark bg |
| 3.30 | LOW | Gradient text `to-white/70` — effective contrast passes but uneven for low-vision |

### Keyboard Navigation (5 items)

| # | Severity | File | Issue |
|---|----------|------|-------|
| 3.31 | HIGH | `app/admin/prompts/page.tsx:121` | Edit/Delete buttons hidden on keyboard focus (`opacity-0 group-hover:opacity-100`) |
| 3.32 | MEDIUM | `components/admin/DeleteCategoryButton.tsx:61` | Delete button hidden on keyboard focus |
| 3.33 | MEDIUM | `components/admin/ProfileRulesManager.tsx:185` | Action buttons hidden on keyboard focus |
| 3.34 | MEDIUM | `components/CalendarSidebar.tsx:142,148` | Prev/Next month buttons lack `aria-label` |
| 3.35 | MEDIUM | `components/CalendarSidebar.tsx:110-127` | Day links show only number, no date context |

### Screen Reader Support (5 items)

| # | Severity | File | Issue |
|---|----------|------|-------|
| 3.36 | MEDIUM | Multiple files | Emoji used as meaningful content without `role="img"` + `aria-label` |
| 3.37 | MEDIUM | `components/ContributionHeatmap.tsx:134-138` | Heatmap invisible to screen readers |
| 3.38 | MEDIUM | `components/stats/TimeOfDayChart.tsx:13-39` | Bar chart has no accessible alternative |
| 3.39 | MEDIUM | `components/stats/TrendChart.tsx:55` | SVG chart lacks title/label |
| 3.40 | MEDIUM | `components/stats/BadgeGrid.tsx:9-20` | Locked/unlocked status only visual |

---

## 4. SEO (7 items)

### 4.1 [HIGH] No robots.txt
No `app/robots.ts` or `public/robots.txt`. Search engines have no crawl directives.
**Fix:** Create `app/robots.ts` with appropriate allow/disallow rules.

### 4.2 [HIGH] No sitemap
No `app/sitemap.ts` or `public/sitemap.xml`.
**Fix:** Create `app/sitemap.ts` returning URLs for public pages.

### 4.3 [MEDIUM] No per-page metadata
Only `app/layout.tsx` exports metadata. Dashboard, stats, admin, settings all inherit the same generic title.
**Fix:** Add `export const metadata` with unique titles/descriptions to each page.

### 4.4 [MEDIUM] Missing Open Graph image
`openGraph` config in layout.tsx has no `images` property. Social shares show no preview.
**Fix:** Create an OG image and add to metadata.

### 4.5 [MEDIUM] No metadataBase
Without `metadataBase`, canonical URLs and OG URLs won't resolve correctly.
**Fix:** Add `metadataBase: new URL('https://yourdomain.com')` to root metadata.

### 4.6 [LOW] No structured data (JSON-LD)
No JSON-LD on any page.

### 4.7 [LOW] No Twitter card metadata
Falls back to OpenGraph but with less control.

---

## 5. UX & Architecture (14 items)

### 5.1 [HIGH] No error boundaries
Zero `error.tsx` or `global-error.tsx` files. Unhandled errors show Next.js default error page.
**Fix:** Add `app/error.tsx`, `app/dashboard/error.tsx`, `app/admin/error.tsx`, `app/not-found.tsx`.

### 5.2 [HIGH] No loading states
Zero `loading.tsx` files. No feedback during server-side page transitions.
**Fix:** Add `loading.tsx` to dashboard, stats, admin, and settings routes.

### 5.3 [HIGH] admin-actions.ts is 908 lines
**File:** `app/lib/admin-actions.ts`
20+ server actions spanning profiles, rules, groups, categories, prompts, users, and import.
**Fix:** Split into domain-specific files: `app/actions/profiles.ts`, `groups.ts`, `prompts.ts`, `users.ts`.

### 5.4 [HIGH] User ID resolution duplicated across 4+ files
**Files:** `app/dashboard/page.tsx:31-37`, `app/stats/page.tsx:29-34`, `app/lib/actions.ts:66-74`, `app/settings/page.tsx:19-24`
The `session.user.id` fallback-by-email pattern is copy-pasted everywhere.
**Fix:** Extract to `lib/auth-helpers.ts` as `resolveUserId(session)`.

### 5.5 [HIGH] No Zod validation on server actions
**File:** `app/lib/admin-actions.ts` (908 lines, no validation)
Only `auth.ts` uses Zod. All server actions parse `FormData` with raw `as string` casts.
**Fix:** Create Zod schemas for each action's inputs. Validate at the top before any DB call.

### 5.6 [MEDIUM] Toast system exists but is unused
**File:** `components/providers/ToastProvider.tsx`
Well-implemented toast system with no consumers. Forms use `alert()` or nothing.
**Fix:** Wire up toast notifications on server action success/failure across all forms.

### 5.7 [MEDIUM] Empty states are generic
`PastJournalView`, stats page, ProfileRulesManager show bare "No data" messages with no guidance.
**Fix:** Follow ScoringApp pattern: every empty state should include what to do next.

### 5.8 [MEDIUM] Settings/Stats pages have no mobile navigation
**Files:** `app/settings/page.tsx:51`, `app/stats/page.tsx:64`
Sidebars are `hidden` on mobile with no hamburger menu alternative.
**Fix:** Reuse the DashboardShell pattern with mobile hamburger.

### 5.9 [MEDIUM] Server actions split inconsistently
Actions live in both `app/actions/*.ts` and `app/lib/*.ts`.
**Fix:** Consolidate all under `app/actions/` with domain-based naming.

### 5.10 [MEDIUM] Sidebar branding duplicated in 3 places
**Files:** `app/dashboard/page.tsx:172-175`, `app/stats/page.tsx:66-69`, `app/settings/page.tsx:52-55`
**Fix:** Extract to a shared `SidebarHeader` component.

### 5.11 [MEDIUM] `any` types throughout codebase (19+ instances)
**Files:** `app/stats/page.tsx`, `app/lib/admin-actions.ts`, `app/actions/restore.ts`, others
Despite `"strict": true` in tsconfig.
**Fix:** Define proper interfaces. Use Zod schemas and `z.infer`.

### 5.12 [MEDIUM] console.log/error in production code
**Files:** `auth.ts`, `lib/email/index.ts`, multiple action files
**Fix:** Replace with a structured logger (e.g., `pino`) or remove debug logs.

### 5.13 [LOW] No breadcrumbs in admin section
ScoringApp has accessible breadcrumbs. Journal app has none.

### 5.14 [LOW] Prisma 6 → 7 alignment with ScoringApp
Not urgent, but reduces cognitive overhead since both apps share the EC2 instance.

---

## Summary

| Category | HIGH | MEDIUM | LOW | Total |
|----------|------|--------|-----|-------|
| Security | 6 | 3 | 0 | 9 |
| Performance | 3 | 9 | 1 | 13 |
| Accessibility | 16 | 16 | 4 | 36 |
| SEO | 2 | 3 | 2 | 7 |
| UX & Architecture | 5 | 7 | 2 | 14 |
| **Total** | **32** | **38** | **9** | **79** |

## Suggested Fix Order

**Phase 1 — Security hardening:**
Items 1.1-1.6 (password leak, headers, path traversal, auth checks, validation, admin role check)

**Phase 2 — Error handling & loading states:**
Items 5.1-5.2 (error boundaries, loading.tsx files)

**Phase 3 — Performance quick wins:**
Items 2.1, 2.3, 2.4, 2.5, 2.8, 2.9 (indexes, caching, parallel queries)

**Phase 4 — Accessibility foundations:**
Items 3.1-3.9 (form labels), 3.10-3.13 (dialogs), 3.14-3.20 (announcements), 3.21 (skip link)

**Phase 5 — SEO basics:**
Items 4.1-4.5 (robots, sitemap, metadata, OG image)

**Phase 6 — Code organization:**
Items 5.3-5.5, 5.9 (split admin-actions, extract helpers, add Zod, consolidate actions)

**Phase 7 — UX polish:**
Items 5.6-5.8, 5.10 (toast usage, empty states, mobile nav, shared components)

**Phase 8 — Remaining accessibility:**
Items 3.22-3.40 (landmarks, contrast, keyboard, screen reader)
