# Merged Issue List — Validated

> **Validated against code:** 2026-06-10
> **Sources merged:** `ISSUES.md` (GitHub mirror, #39–81) + `docs/newissues.md` (June architecture review, N1–N4)
> **Method:** each item re-checked against the current codebase by a verification pass. Verdicts: **OPEN** (still true), **PARTIAL** (substantially addressed, residual remains), **FIXED** (close it), **BY-DESIGN** (not a defect / miscategorized).
> Severity in **bold** is the corrected severity where it differs from the original filing.

---

## ✅ FIXED — close these (verified in code)

| # | Title | Evidence |
|---|-------|----------|
| 56 | Admin profile mutations missing org ownership (IDOR) | `lib/adminGuards.ts` `requireAdminForProfiles` on all profile-connect paths |
| 57 | resolveCategory trusts categoryId without org scope | `lib/categoryUtils.ts` org-scopes via `findFirst({ id, organizationId })` |
| 39 | No shared journal-entry upsert function | consolidated in `app/api/v1/entries/route.ts` + `entries/batch/route.ts` |
| 72 | Admin tables overflow on mobile | `overflow-x-auto` on table container (`AdminUsersPage`) |
| 75 | Inconsistent server-action error/toast convention | actions now uniformly `return { error }`; no throws found in sampled `app/actions/*` |
| 81 | Enable SQLite WAL mode | `lib/sqlitePragmas.ts:11-12` WAL + busy_timeout; tested |
| N1.7 | `frozenDate` string unvalidated | `lib/streakSpend.ts` validates `/^\d{4}-\d{2}-\d{2}$/` before write |
| N3.13 | Achievement toasts can't be dismissed | `ToastProvider.tsx:70-75` close button + auto-dismiss |

---

## 🔴 OPEN — Critical security (verified still true)

| # | Sev | Title | Evidence | Note |
|---|-----|-------|----------|------|
| 58 | critical | CSP allows `'unsafe-inline'` / `'unsafe-eval'` | `next.config.ts:31` | unchanged |
| 59 | critical | Seed hardcodes `password123`, no prod guard | `prisma/seed.ts:9` | runs unconditionally |
| 61 | **critical** ⬆ | Login leaks user existence via timing side-channel | `app/api/v1/auth/login/route.ts:56-64` | early-returns when user not found → no constant-time path. *Was filed "important."* |
| 64 | **critical** ⬆ | Device-session revocation doesn't invalidate live tokens | `lib/api/apiAuth.ts` + `lib/api/jwt.ts:24-29` | `verifyAccessToken` never checks `revokedAt`. *Was filed "important."* |

---

## 🟠 OPEN — Important security & infra (verified still true)

| # | Sev | Title | Evidence |
|---|-----|-------|----------|
| 60 | important | API JWT falls back to `AUTH_SECRET` | `lib/api/jwt.ts:3` |
| 62 | important | Avatar upload validates only client MIME type | `lib/avatarValidation.ts:4-8` (no server magic-byte check) |
| 63 | important | Cron auth is a plain shared header secret | `app/api/v1/cron/streak/route.ts:12-14` |
| 65 | **minor/med** ⬇ | Admin export logs full stack trace | `app/api/admin/export/route.ts:154`, `export-user/route.ts:89` — *app-level leak, not core auth* |
| 66 | important | No automated encrypted DB backup | `DEPLOYMENT.md:158-162` (manual only) |
| 67 | important | No `/health` readiness endpoint | none exists under `app/` |
| 68 | important | PM2 log rotation not configured | `DEPLOYMENT.md:95-102` (no pm2-logrotate / ecosystem config) |
| 69 | important | APNs key handling & rotation undocumented | absent from `DEPLOYMENT.md` |

---

## 🟡 OPEN — Correctness & data integrity (verified still true)

| # | Sev | Title | Evidence |
|---|-----|-------|----------|
| N1.4r | low | `removeUserFromGroup` no org-check on `userId`; `createGroup` connects users by email unchecked | `app/actions/groups.ts` |
| N1.5 | med | JournalEntry uniqueness not timezone-aware (`@@unique([userId, promptId, date])`, `date` is DateTime) | `prisma/schema.prisma` |
| N1.6 | med | All-users assignment unbounded (`resolveAssignmentUserIds(ALL)` → unbounded findMany + N sync inserts) | `app/actions/rules.ts`, `tasks.ts` |
| N1.8 | low | No data archival/retention strategy | `DEPLOYMENT.md` |
| N1.9 | **med** ⬆ | Weekly calendar `'all'` unreachable when rules mix reset days | `lib/rules.ts` `computeRuleCalendarStatus` weekly branch — *unreachable status reads as a UX bug* |

---

## 🔵 OPEN — UX (verified still true)

| # | Sev | Title | Evidence |
|---|-----|-------|----------|
| 71 | important/bug | NewUserForm password field uses `type="text"` | `NewUserForm.tsx:69` |
| 74 | minor | Journal textarea locked `h-32` + `resize-none` | `PromptCard.tsx:64` |
| N3.4r | low | `DailyRulesCard` aggregate header lags optimistic row flips | `components/DailyRulesCard.tsx:19-29` |
| N3.12 | low | Login form doesn't state password minimum | `app/login/page.tsx:43-54` |
| N3.14 | low | Task sidebar notes risk loss; expanded state not persisted | `components/TaskSidebar.tsx:32-34` |

---

## 🟣 PARTIAL — substantially addressed, residual remains

| # | Title | Done | Residual |
|---|-------|------|----------|
| 70 | Form buttons render isPending | Most forms use `useActionState`/`useTransition` | `ProfileForm.tsx:182` still manual `useState` |
| 76 | Automated test harness | Vitest configured, `tests/` exists | coverage thin (a handful of tests) |
| 79 | Export/restore coverage | export now includes **rules** | still missing tasks, achievements, inventory; no user-facing restore |
| 80 | SR & focus-management audit | several `aria-live` regions added | dialogs (delete/reorder) not audited for focus trap / `aria-modal` |
| 50 | Dashboard data fetching | `Promise.all` parallelized | `archiveAcknowledgedTasks()` runs sync every load, incl. viewing others |
| N3.11 | Journal history empty state | no crash on empty | still renders nothing (no "No entries yet" placeholder) |
| N3.15 | Heatmap/day-explorer timezone | tz now passed to heatmap source | day-detail modal's `ruleCompletion` query still not scoped to active assignments |

---

## 🟤 OPEN — Refactor / backlog / docs / observations

| # | Sev | Title | Evidence / Note |
|---|-----|-------|------|
| 44 | minor/refactor | Export routes not consolidated | three overlapping export endpoints |
| 52 | minor/refactor | Sidebar / admin response-rate not extracted | inline in `CalendarSidebar`/`AdminSidebar` |
| 77 | important/obs | No error tracking / structured logging | raw `console.*` throughout; no Sentry/pino |
| 78 | important/obs | No user-initiated account deletion (GDPR) | only admin `deleteUser`; no self-serve erasure |
| N4.6 | med | NEXTAUTH env vars under-documented | `NEXTAUTH_URL` requirement stated nowhere; naming drift `AUTH_SECRET` vs `NEXTAUTH_SECRET` |
| N4.7 | low | README overstates accessibility | `README.md:51-58` claims WCAG 2.2 vs open a11y gaps |
| N4.8 | low | No docs index | no `docs/INDEX.md`; feature docs scattered |

---

## ⚪ BY-DESIGN / MISCATEGORIZED — reclassify, don't "fix"

| # | Original | Finding |
|---|----------|---------|
| 73 | "Dashboard rules entry hidden" (bug) | **By-design** — `DashboardPage.tsx:310-317` conditionally renders the Rules link only when `ruleProgress.total > 0`. Intentional; reclassify as observation or close. |
| N4.5 | "Route-protection docs wrong" (med) | **Resolved/miscategorized** — `docs/reference/scoringappPatterns.md` now self-disclaims as ScoringApp; real mechanism (NextAuth + public-route whitelist in `auth.config.ts:13-19`) is correct. |

---

## Tally

- **FIXED (close):** 8 — #56, #57, #39, #72, #75, #81, N1.7, N3.13
- **By-design / resolved:** 2 — #73, N4.5
- **OPEN:** 23 — incl. **4 critical** (#58, #59, #61, #64)
- **PARTIAL:** 7 — #70, #76, #79, #80, #50, N3.11, N3.15

### Severity corrections to apply
- **#61 → critical** (was important) — user-enumeration timing leak
- **#64 → critical** (was important) — revoked tokens stay live
- **#65 → medium** (was important) — app-level stack-trace leak
- **N1.9 → medium** (was low) — unreachable `'all'` is a UX defect
