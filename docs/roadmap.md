# Journal App — Roadmap

**Last updated:** 2026-03-21

---

## Recently Completed (2026-03-21)

### Codebase Audit — Phases 1-8
All 79 findings addressed across 8 phases:
- **Phase 1:** Security hardening (password export fix, security headers, path traversal, auth checks)
- **Phase 2:** Error boundaries + loading states (9 new files)
- **Phase 3:** Performance (DB indexes, React.cache, query parallelization)
- **Phase 4:** Accessibility foundations (form labels, dialog ARIA, status announcements, skip link)
- **Phase 5:** SEO (robots.txt, sitemap, per-page metadata, Open Graph)
- **Phase 6:** Code organization (split 908-line admin-actions.ts, shared helpers)
- **Phase 7:** UX polish (toast notifications, empty states, mobile nav)
- **Phase 8:** Remaining accessibility (contrast, landmarks, keyboard visibility, screen reader)

### Prompt Variety Improvement
- 4-day recency suppression excludes recently-shown prompts from selection
- SHA-256 PRNG replaces mulberry32 for better distribution on consecutive dates
- Simulation script (`scripts/simulatePrompts.sh`) for validation

### Task Assignment Feature
- Task + TaskAssignment data model with fan-out assignment (user/group/all)
- Admin CRUD: list page, create form, detail page with progress tracking, edit page
- User dashboard: sidebar task list with inline completion notes, notification banner
- Admin dashboard: task stats card

### Infrastructure
- Pinned Node 22 via `.node-version` + `engines` field
- Updated Next.js 16.1.4 -> 16.2.1, eslint-config-next, dotenv, zod, @types/react
- Installed `fnm` for local Node version management

---

## Upcoming — Task Stats Enhancement
- Add completion rate card to admin dashboard
- Add task activity section to user stats page
- See `docs/exploration-task-stats.md` for details

---

## Remaining Work

### Dependency Upgrades

These need their own planning/testing cycles.

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| Prisma | 6.19.2 | 7.x | Breaking changes: `prisma.config.ts` replaces env auto-loading. Aligns with ScoringApp. |
| Tailwind CSS | 4.1.18 | 4.2.x | Caused dev server hangs when attempted — needs investigation. |
| React / React DOM | 19.2.3 | 19.2.4+ | Same hang issue as Tailwind — likely related. Test together. |
| ESLint | 9.x | 10.x | Major version, config format changes likely. |
| AWS SDK (SES) | 3.975.0 | 3.1014+ | Large jump but should be compatible. Test email flows (password reset, etc.). |

### Security Improvements

**Rate limiting on auth endpoints**
- **Priority:** Medium
- **Files:** `auth.ts`, `app/actions/forgot-password.ts`
- **Issue:** No rate limiting on login attempts or password reset requests.
- **Fix:** Implement rate limiting via middleware or in-memory store.

**Route protection whitelist approach**
- **Priority:** Medium
- **File:** `auth.config.ts`
- **Issue:** Currently only `/dashboard` is protected at the proxy level. Other routes rely on per-page `auth()` checks.
- **Fix:** Switch to a public-route whitelist (like ScoringApp's `proxy.ts` pattern).

### Code Quality

**Eliminate `any` types (19+ instances)**
- **Priority:** Medium
- **Fix:** Define proper interfaces. Use Zod schemas with `z.infer` for validated data.

**Replace console.log/error with structured logger**
- **Priority:** Low
- **Fix:** Replace with a structured logger (e.g., `pino`).

**Add breadcrumbs to admin section**
- **Priority:** Low
- **Fix:** Create a `Breadcrumbs` component with accessible `<nav>` and `<ol>`.

### Future Features

**Multi-tenancy** — See `docs/exploration-multi-tenancy.md`. Minimal path (3-4 days) would fix scoping gaps and allow a second org. Full self-registration/invite system is 2-3 weeks.

---

## Suggested Order

1. **Task stats enhancement** — quick win, builds on shipped feature
2. **Rate limiting** — security, standalone change
3. **Route protection whitelist** — security, standalone change
4. **`any` types cleanup** — code quality, incremental
5. **Prisma 7 upgrade** — needs migration planning
6. **Dependency upgrades** — batch after Prisma
7. **Structured logger** — nice-to-have
8. **Admin breadcrumbs** — nice-to-have
9. **Multi-tenancy** — if the use case materializes
