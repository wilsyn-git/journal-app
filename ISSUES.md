# Issues — myJournal

> Last synced: 2026-04-16
> **Validated against code: 2026-06-10** — see `docs/issuesMerged.md` for the full merged + validated list (incl. the June review's N-items). Closures, partials, and severity corrections below reflect that pass.

## Recently Closed — verified fixed 2026-06-10

**All four critical security issues fixed** on `fix/critical-security-hardening` (merged to `main` 2026-06-10; pending EC2 deploy). See `docs/criticalSecurityResolutions.md`.

| # | Title | Evidence |
|---|-------|----------|
| 64 | Device-session revocation does not invalidate live API access tokens | `sessionId` in JWT + per-request `revokedAt` check in `lib/api/apiAuth.ts`; DELETE devices route sets `revokedAt` |
| 61 | Login endpoints leak user existence via timing side-channel | constant-time bcrypt (both paths) via `lib/api/constantTimeAuth.ts` |
| 59 | Seed script creates admin@example.com with hardcoded password123 and no prod guard | `ADMIN_PASSWORD` env + production guard in `prisma/seed.ts` |
| 58 | CSP allows 'unsafe-inline' and 'unsafe-eval' for scripts | nonce-based CSP in `proxy.ts` + `lib/csp.ts` |
| 57 | resolveCategory trusts caller-provided categoryId without org scope | `lib/categoryUtils.ts` org-scoped |
| 56 | Admin profile mutations missing organization ownership check (IDOR) | `lib/adminGuards.ts` `requireAdminForProfiles` |
| 81 | Enable SQLite WAL mode and document safe backup-during-write | `lib/sqlitePragmas.ts` |
| 75 | Inconsistent server-action error / toast convention | actions now uniformly `return { error }` |
| 72 | Admin tables overflow awkwardly on mobile | `overflow-x-auto` on table container |
| 39 | Extract shared journal entry upsert function | consolidated in `app/api/v1/entries` routes |

## Open Issues — Security (Critical)

_None._ All four prior criticals (#58, #59, #61, #64) closed 2026-06-10 — see above.

**Deploy note (#59):** set a strong `ADMIN_PASSWORD` on the EC2 box before the next `npx prisma db seed`, or seeding aborts.

## Open Issues — Security & Infra (Important)

| # | Title | Labels | Created |
|---|-------|--------|---------|
| 69 | APNs key file handling and rotation undocumented | documentation, important | 2026-04-16 |
| 68 | PM2 log rotation not configured | documentation, important | 2026-04-16 |
| 67 | No /health readiness endpoint | enhancement, important | 2026-04-16 |
| 66 | No automated encrypted database backup | important, observation | 2026-04-16 |
| 65 | Admin export endpoint logs full stack trace on error | **minor** (was important) | 2026-04-16 |
| 63 | Cron endpoint auth is a plain shared header secret | important | 2026-04-16 |
| 62 | Avatar upload validates only client-provided MIME type | bug, important | 2026-04-16 |
| 60 | API JWT secret falls back to AUTH_SECRET (key-separation) | important | 2026-04-16 |

## Open Issues — UX

| # | Title | Labels | Created | Status |
|---|-------|--------|---------|--------|
| 74 | Journal textarea locked to h-32 with resize-none | enhancement, minor | 2026-04-16 | open |
| 71 | NewUserForm password field uses type="text" | bug, important | 2026-04-16 | open |
| 70 | Form submit buttons do not render isPending state | bug, important | 2026-04-16 | **partial** — only `ProfileForm` outstanding |

### Reclassified (not a defect)

| # | Title | Finding |
|---|-------|---------|
| 73 | Dashboard rules entry hidden for users with no rules assigned | **by-design** — Rules link conditionally rendered when `ruleProgress.total > 0` |

## Open Issues — Strategic / Observations

| # | Title | Labels | Created | Status |
|---|-------|--------|---------|--------|
| 80 | Screen-reader and focus-management audit | important, observation | 2026-04-16 | **partial** — aria-live added; dialogs unaudited |
| 79 | Export/restore coverage incomplete (rules, tasks, achievements, inventory) | enhancement, important | 2026-04-16 | **partial** — rules now covered; tasks/achievements/inventory missing |
| 78 | User-initiated account deletion (GDPR right to be forgotten) | enhancement, important | 2026-04-16 | open |
| 77 | No error tracking or structured logging in production | important, observation | 2026-04-16 | open |
| 76 | No automated test harness | important, observation | 2026-04-16 | **partial** — Vitest configured; coverage thin |

## Open Issues — Pre-existing Backlog

| # | Title | Labels | Created | Status |
|---|-------|--------|---------|--------|
| 52 | Extract dashboard sidebar and admin response rate into separate modules | minor, refactor, backlog | 2026-03-24 | open |
| 50 | Optimize dashboard data fetching (redundant queries + missed concurrency) | minor, performance, backlog | 2026-03-24 | **partial** — Promise.all in place; archive runs sync each load |
| 44 | Consolidate user journal export routes | minor, refactor, backlog | 2026-03-24 | open |

> The June architecture-review items (N1–N4) that remain open or partial are tracked in `docs/issuesMerged.md` alongside these, to avoid duplicating them here.
