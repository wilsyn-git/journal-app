# Issues — myJournal

> Last synced: 2026-04-16

## Open Issues — Security (Critical)

| # | Title | Labels | Created |
|---|-------|--------|---------|
| 59 | Seed script creates admin@example.com with hardcoded password123 and no prod guard | critical | 2026-04-16 |
| 58 | CSP allows 'unsafe-inline' and 'unsafe-eval' for scripts | critical | 2026-04-16 |
| 57 | resolveCategory trusts caller-provided categoryId without org scope | bug, critical | 2026-04-16 |
| 56 | Admin profile mutations missing organization ownership check (IDOR) | bug, critical | 2026-04-16 |

## Open Issues — Security & Infra (Important)

| # | Title | Labels | Created |
|---|-------|--------|---------|
| 69 | APNs key file handling and rotation undocumented | documentation, important | 2026-04-16 |
| 68 | PM2 log rotation not configured | documentation, important | 2026-04-16 |
| 67 | No /health readiness endpoint | enhancement, important | 2026-04-16 |
| 66 | No automated encrypted database backup | important, observation | 2026-04-16 |
| 65 | Admin export endpoint logs full stack trace on error | important, minor | 2026-04-16 |
| 64 | Device-session revocation does not invalidate live API access tokens | bug, important | 2026-04-16 |
| 63 | Cron endpoint auth is a plain shared header secret | important | 2026-04-16 |
| 62 | Avatar upload validates only client-provided MIME type | bug, important | 2026-04-16 |
| 61 | Login endpoints leak user existence via timing side-channel | important | 2026-04-16 |
| 60 | API JWT secret falls back to AUTH_SECRET (key-separation) | important | 2026-04-16 |

## Open Issues — UX

| # | Title | Labels | Created |
|---|-------|--------|---------|
| 75 | Inconsistent server-action error / toast convention | minor, refactor | 2026-04-16 |
| 74 | Journal textarea locked to h-32 with resize-none | enhancement, minor | 2026-04-16 |
| 73 | Dashboard rules entry hidden for users with no rules assigned | enhancement, minor | 2026-04-16 |
| 72 | Admin tables overflow awkwardly on mobile | minor | 2026-04-16 |
| 71 | NewUserForm password field uses type="text" | bug, important | 2026-04-16 |
| 70 | Form submit buttons do not render isPending state | bug, important | 2026-04-16 |

## Open Issues — Strategic / Observations

| # | Title | Labels | Created |
|---|-------|--------|---------|
| 81 | Enable SQLite WAL mode and document safe backup-during-write | observation, performance | 2026-04-16 |
| 80 | Screen-reader and focus-management audit | important, observation | 2026-04-16 |
| 79 | Export/restore coverage incomplete (rules, tasks, achievements, inventory) | enhancement, important | 2026-04-16 |
| 78 | User-initiated account deletion (GDPR right to be forgotten) | enhancement, important | 2026-04-16 |
| 77 | No error tracking or structured logging in production | important, observation | 2026-04-16 |
| 76 | No automated test harness | important, observation | 2026-04-16 |

## Open Issues — Pre-existing Backlog

| # | Title | Labels | Created |
|---|-------|--------|---------|
| 52 | Extract dashboard sidebar and admin response rate into separate modules | minor, refactor, backlog | 2026-03-24 |
| 50 | Optimize dashboard data fetching (redundant queries + missed concurrency) | minor, performance, backlog | 2026-03-24 |
| 44 | Consolidate user journal export routes | minor, refactor, backlog | 2026-03-24 |
| 39 | Extract shared journal entry upsert function | important, refactor, backlog | 2026-03-24 |
