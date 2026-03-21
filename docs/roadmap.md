# Journal App — Remaining Roadmap

**Date:** 2026-03-21
**Context:** Items deferred from the comprehensive audit (Phases 1-8 complete).

---

## Dependency Upgrades

These need their own planning/testing cycles.

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| Prisma | 6.19.2 | 7.x | Breaking changes: `prisma.config.ts` replaces env auto-loading. Aligns with ScoringApp. |
| Tailwind CSS | 4.1.18 | 4.2.x | Caused dev server hangs when attempted — needs investigation. |
| React / React DOM | 19.2.3 | 19.2.4+ | Same hang issue as Tailwind — likely related. Test together. |
| ESLint | 9.x | 10.x | Major version, config format changes likely. |
| AWS SDK (SES) | 3.975.0 | 3.1014+ | Large jump but should be compatible. Test email flows (password reset, etc.). |

---

## Security Improvements

### Rate limiting on auth endpoints
- **Priority:** Medium
- **Files:** `auth.ts`, `app/actions/forgot-password.ts`
- **Issue:** No rate limiting on login attempts or password reset requests. Brute-force and email flooding possible.
- **Fix:** Implement rate limiting via middleware or in-memory store (e.g., `rate-limiter-flexible`).

### Route protection whitelist approach
- **Priority:** Medium
- **File:** `auth.config.ts`
- **Issue:** Currently only `/dashboard` is protected at the proxy level. Other routes (`/admin`, `/settings`, `/stats`, `/api`) rely on per-page `auth()` checks.
- **Fix:** Switch to a public-route whitelist (like ScoringApp's `proxy.ts` pattern). Default to protected, explicitly allow public routes.

---

## Code Quality

### Eliminate `any` types (19+ instances)
- **Priority:** Medium
- **Files:** `app/stats/page.tsx`, `app/actions/restore.ts`, `app/actions/admin.ts`, `app/actions/feedback.ts`, `app/admin/tools/page.tsx`, `app/admin/prompts/page.tsx`
- **Fix:** Define proper interfaces. Use Zod schemas with `z.infer` for validated data. Particularly important in restore action where untrusted data flows through `any` into the database.

### Replace console.log/error with structured logger
- **Priority:** Low
- **Files:** `auth.ts`, `lib/email/index.ts`, multiple action files
- **Fix:** Replace with a structured logger (e.g., `pino`) that can be configured per environment. Remove debug logs like `console.log('Invalid credentials')` in auth.ts.

### Add breadcrumbs to admin section
- **Priority:** Low
- **Issue:** No breadcrumbs in admin (e.g., "Admin > Profiles > [Profile Name]"). ScoringApp has accessible breadcrumbs.
- **Fix:** Create a `Breadcrumbs` component with `<nav aria-label="Breadcrumb">` and `<ol>` list pattern.

---

## Suggested Order

1. **Rate limiting** — security, standalone change
2. **Route protection whitelist** — security, standalone change
3. **`any` types cleanup** — code quality, can be done incrementally
4. **Prisma 7 upgrade** — needs migration planning, aligns with ScoringApp
5. **Dependency upgrades** (Tailwind, React, ESLint, AWS SDK) — batch after Prisma
6. **Structured logger** — nice-to-have
7. **Admin breadcrumbs** — nice-to-have
