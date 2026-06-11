# Merged Issue List — Validated

> **Validated against code:** 2026-06-10
> **Sources merged:** `ISSUES.md` (GitHub mirror, #39–81) + `docs/newissues.md` (June architecture review, N1–N4)
> **Method:** each item re-checked against the current codebase by a verification pass. Verdicts: **OPEN** (still true), **PARTIAL** (substantially addressed, residual remains), **FIXED** (close it), **BY-DESIGN** (not a defect / miscategorized).
> Severity in **bold** is the corrected severity where it differs from the original filing.

---

## ✅ FIXED — close these (verified in code)

The **four critical security issues** were fixed on `fix/critical-security-hardening` (merged to `main` 2026-06-10, pending EC2 deploy). Resolution map: `docs/criticalSecurityResolutions.md`.

| # | Title | Evidence |
|---|-------|----------|
| 58 | CSP allows `'unsafe-inline'` / `'unsafe-eval'` | nonce-based CSP in `proxy.ts` + `lib/csp.ts`; static pages opted dynamic |
| 59 | Seed hardcodes `password123`, no prod guard | `ADMIN_PASSWORD` env + prod guard in `prisma/seed.ts` |
| 61 | Login timing user-enumeration | constant-time bcrypt both paths via `lib/api/constantTimeAuth.ts` |
| 64 | Revoked devices keep live tokens | `sessionId` in JWT + per-request `revokedAt` check in `lib/api/apiAuth.ts`; DELETE route sets `revokedAt` |
| 56 | Admin profile mutations missing org ownership (IDOR) | `lib/adminGuards.ts` `requireAdminForProfiles` on all profile-connect paths |
| 57 | resolveCategory trusts categoryId without org scope | `lib/categoryUtils.ts` org-scopes via `findFirst({ id, organizationId })` |
| 39 | No shared journal-entry upsert function | consolidated in `app/api/v1/entries/route.ts` + `entries/batch/route.ts` |
| 72 | Admin tables overflow on mobile | `overflow-x-auto` on table container (`AdminUsersPage`) |
| 75 | Inconsistent server-action error/toast convention | actions now uniformly `return { error }`; no throws found in sampled `app/actions/*` |
| 81 | Enable SQLite WAL mode | `lib/sqlitePragmas.ts:11-12` WAL + busy_timeout; tested |
| N1.7 | `frozenDate` string unvalidated | `lib/streakSpend.ts` validates `/^\d{4}-\d{2}-\d{2}$/` before write |
| N3.13 | Achievement toasts can't be dismissed | `ToastProvider.tsx:70-75` close button + auto-dismiss |
| 62 | Avatar upload validates only client MIME type | server-side JPEG magic-byte check (`validateAvatarBytes` in `lib/avatarValidation.ts`) before disk write in `app/actions/settings.ts` — *fixed on `fix/security-batch-a-62-63-60` 2026-06-11* |
| 63 | Cron auth is a plain shared header secret | constant-time `safeSecretCompare` (`lib/api/timingSafe.ts`) in cron streak route; rotation documented — *fixed 2026-06-11* |
| 60 | API JWT falls back to `AUTH_SECRET` | `resolveJwtSecret` in `lib/api/jwt.ts` requires `API_JWT_SECRET` in prod, no AUTH_SECRET fallback — *fixed 2026-06-11* |
| 67 | No `/health` readiness endpoint | `GET /api/health` (`app/api/health/route.ts` + `lib/health.ts` `SELECT 1`) → 200/503, `no-store`, whitelisted public in `auth.config.ts` — *fixed on `fix/ops-batch-b-67-68` 2026-06-11* |
| 68 | PM2 log rotation not configured | pm2-logrotate runbook in `DEPLOYMENT.md` + applied live on EC2 (global module, covers journal-app + scoringapp) — *fixed 2026-06-11* |
| 69 | APNs key handling & rotation undocumented | `DEPLOYMENT.md` "APNs push notifications (iOS)" runbook (setup/perms/rotation); `*.p8` gitignored; `.env.example` annotated — *fixed 2026-06-11*. NB: APNs currently unset in prod → push disabled |

> **Accepted residuals from the critical fixes** (sound, not blockers): ≤1h legacy-token window after the #64 deploy; `style-src 'unsafe-inline'` kept for Tailwind v4 runtime styles (#58); `_global-error` framework scripts un-nonced, recovery via plain link (#58).

---

## 🔴 OPEN — Critical security

_None._ All four (#58, #59, #61, #64) closed 2026-06-10 — see the FIXED table above.

---

## 🟠 OPEN — Important security & infra (verified still true)

| # | Sev | Title | Evidence |
|---|-----|-------|----------|
| 65 | **minor/med** ⬇ | Admin export logs full stack trace | `app/api/admin/export/route.ts:154`, `export-user/route.ts:89` — *app-level leak, not core auth* |
| 66 | important | No automated encrypted DB backup | `DEPLOYMENT.md:158-162` (manual only) — **deferred pending possible GCP migration** |

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

- **FIXED (close):** 18 — #56, #57, #39, #72, #75, #81, N1.7, N3.13, **+ #58, #59, #61, #64** (criticals, merged 2026-06-10), **+ #60, #62, #63** (batch A important security, 2026-06-11), **+ #67, #68** (batch B ops/infra, 2026-06-11), **+ #69** (APNs docs, 2026-06-11)
- **By-design / resolved:** 2 — #73, N4.5
- **OPEN:** 13 — **0 critical remaining**; remaining important security/infra row = #65 (minor/med), #66 (backup — deferred pending GCP). Note: APNs is documented (#69) but **unconfigured in prod** → iOS push currently disabled (operational follow-up, not a tracked defect)
- **PARTIAL:** 7 — #70, #76, #79, #80, #50, N3.11, N3.15

### Severity corrections (applied during validation)
- **#61 → critical**, **#64 → critical** — both now FIXED.
- **#65 → medium** (was important) — app-level stack-trace leak.
- **N1.9 → medium** (was low) — unreachable `'all'` is a UX defect.
