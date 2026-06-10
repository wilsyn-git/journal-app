# Critical Security Resolutions — #58, #59, #61, #64

> **Created:** 2026-06-10 · **Status:** resolution map (pre-implementation)
> **Source:** validated criticals from `docs/issuesMerged.md`
> **Branch (proposed):** `fix/critical-security-hardening`
> **Deploy shape:** all four are **code-only, no schema migration**. One new env var (`ADMIN_PASSWORD`) for #59. Decisions below were confirmed with Sam 2026-06-10.

---

## Summary of chosen approaches

| # | Issue | Chosen resolution |
|---|-------|-------------------|
| 58 | CSP allows `unsafe-inline`/`unsafe-eval` | **Nonce-based CSP** via new `middleware.ts`; drop both relaxations from `script-src` |
| 59 | Seed hardcodes `password123`, no prod guard | **Require `ADMIN_PASSWORD` env in prod**, guard against default; keep dev default |
| 61 | Login timing user-enumeration | **Constant-time dummy bcrypt compare** in both login paths |
| 64 | Revoked devices keep live tokens | **`sessionId` in JWT + per-request `revokedAt` check**; fix DELETE route to set `revokedAt` |

Suggested implementation order: **#61 → #59 → #64 → #58** (cheapest/safest first; CSP last as the highest regression risk).

---

## #61 — Login timing side-channel  `[critical]`

**Root cause:** both login paths run bcrypt only when the user exists, so a missing user returns measurably faster (user enumeration). Bodies/status already match — timing is the only leak.

**Affected code (both must be fixed):**
- `app/api/v1/auth/login/route.ts:56-64` — `findUnique` → early `return` on `!user`, bcrypt after.
- `auth.ts:35-39` — NextAuth `authorize()`: `if (!user) return null;` then `bcrypt.compare`.

**Resolution:**
1. Add a shared precomputed dummy hash constant (bcryptjs, cost 10 — matches `app/actions/users.ts:31`). Put it in a small helper, e.g. `lib/api/constantTimeAuth.ts`:
   ```ts
   // bcryptjs.hashSync('a-non-matching-placeholder', 10) — precomputed, never matches a real password
   export const DUMMY_PASSWORD_HASH = '$2b$10$....'   // generate once, commit the literal
   ```
2. In both paths, always run the compare:
   ```ts
   const user = await prisma.user.findUnique({ where: { email } })
   const matches = await bcrypt.compare(password, user?.password ?? DUMMY_PASSWORD_HASH)
   if (!user || !matches) return <same "Invalid credentials" 401 / null>
   ```
   bcrypt now runs on every attempt regardless of user existence.

**Tests:** unit test asserting the missing-user and wrong-password branches both invoke `bcrypt.compare` (spy call count) and return identical error shape. (Timing itself is not unit-testable; assert the code path.)

**Defense-in-depth note:** API route already has in-memory IP rate-limiting (5/15min, `route.ts:9-30`); the NextAuth path has none. Out of scope here, but worth a follow-up issue.

**Risk/rollback:** trivial, isolated. Rollback = revert the two edits.

---

## #59 — Seed admin password  `[critical]`

**Root cause:** `prisma/seed.ts:9` hashes a literal `'password123'`; `DEPLOYMENT.md:74` instructs operators to run `npx prisma db seed` on prod. No env override, no prod guard.

**Nuance confirmed in code:** the admin `upsert`'s `update` clause sets only `organizationId` — it does **not** reset the password on re-run. So the risk is the **first** production seed creating a known-password admin, not re-runs. The seed also creates genuinely prod-needed data (org, categories, prompts), so we can't just block it wholesale.

**Resolution (`prisma/seed.ts`):**
1. Source the admin password from env:
   ```ts
   const adminPassword = process.env.ADMIN_PASSWORD ?? 'password123'
   ```
2. Guard production against the default:
   ```ts
   if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
     throw new Error('ADMIN_PASSWORD must be set when seeding in production')
   }
   ```
   (Throwing aborts the seed before any write — safe, since seed is idempotent via upsert.)
3. Hash `adminPassword` instead of the literal.

**Docs/config:**
- Add `ADMIN_PASSWORD=` to `.env.example` with a comment.
- `DEPLOYMENT.md:64-75`: prepend `openssl rand -base64 24` → set `ADMIN_PASSWORD` before `npx prisma db seed`; note to change it post-first-login.

**Tests:** none practical for seed; verify locally by running with/without the env in a throwaway `NODE_ENV=production` invocation against a temp DB (do **not** touch prod DB).

**Risk/rollback:** low. Existing prod admin is unaffected (no password write on upsert-update). Rollback = revert seed.

---

## #64 — Revoked devices keep live tokens  `[critical]`

**Root cause (full lifecycle from investigation):**
- Access token TTL **1h**, payload is only `{ userId, orgId }` — no session binding (`lib/api/jwt.ts:9-28`).
- `authenticateRequest` (`lib/api/apiAuth.ts:1-16`) verifies signature+expiry only, **never** reads `DeviceSession`. Used by **12** `/api/v1/*` routes.
- `DeviceSession.revokedAt` exists (`prisma/schema.prisma`), but only the **refresh** route (`auth/refresh/route.ts:29`) and **admin** action (`app/actions/deviceSessions.ts`) consult it.
- **Secondary bug:** `DELETE /api/v1/devices/[token]/route.ts` sets `deviceToken: null` instead of `revokedAt` — so the user-facing "revoke" doesn't even block refresh, only nulls the push token. Inconsistent with the admin path.

**Net effect:** revoking a device leaves its access token working up to 60 min, and (via the buggy DELETE) its refresh token working indefinitely.

**Resolution:**
1. **Bind tokens to a session.** Add `sessionId` to `AccessTokenPayload` and include it when signing:
   - `app/api/v1/auth/login/route.ts:66-89` — create the `DeviceSession` **first**, then `signAccessToken({ userId, orgId, sessionId: session.id })`. (Currently it signs before creating; reorder.)
   - `app/api/v1/auth/refresh/route.ts` — include `sessionId: session.id` when issuing the new access token.
2. **Check revocation per request.** In `authenticateRequest`, after `verifyAccessToken`:
   ```ts
   if (payload.sessionId) {
     const session = await prisma.deviceSession.findUnique({
       where: { id: payload.sessionId }, select: { revokedAt: true },
     })
     if (!session || session.revokedAt) return { error: 'Session revoked', status: 401 }
   }
   // legacy tokens without sessionId: allowed; they age out within 1h (one-time migration window)
   ```
   `DeviceSession.id` is the PK (already indexed) → one O(1) read per authenticated request. Acceptable for this app.
3. **Fix the DELETE route** (`devices/[token]/route.ts`) to set `revokedAt: new Date()` (matching the admin action), in addition to / instead of nulling `deviceToken`. Confirm intended semantics: "remove device" = revoke that session.

**Backward compatibility:** existing iOS access tokens lack `sessionId`. Because TTL is 1h, the legacy-allow branch self-heals within an hour of deploy (clients refresh → get session-bound tokens). A revoked device's *legacy* token could survive ≤1h post-deploy — acceptable one-time window. (If we want zero window, also force-rotate by treating missing `sessionId` as invalid — rejected here to avoid logging everyone out on deploy.)

**Tests:**
- `authenticateRequest`: revoked session → 401; active session → pass; legacy (no sessionId) → pass.
- DELETE route sets `revokedAt`.
- login/refresh embed `sessionId`.

**Risk/rollback:** medium. The legacy-allow branch prevents a logout storm. Rollback = revert; no schema change to undo.

---

## #58 — CSP `unsafe-inline` / `unsafe-eval`  `[critical]`

**Root cause:** `next.config.ts:31` ships `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. No application inline scripts exist, **but** Next.js 16 App Router streams its own inline hydration scripts (dynamic RSC payloads), so a strict `script-src` requires a **nonce** (hashes won't work on dynamic content). Tailwind v4 injects a runtime `<style>`, so `style-src` still needs `'unsafe-inline'` unless separately noncing styles.

**Resolution — nonce-based CSP:**
1. **New `middleware.ts`** (project root) — per request:
   - Generate a nonce (`crypto.randomUUID()`/`randomBytes` base64).
   - Build the CSP with `script-src 'self' 'nonce-<nonce>'` (no `unsafe-inline`, no `unsafe-eval`), keeping `style-src 'self' 'unsafe-inline'`, and the rest as today.
   - Set the CSP on the response header **and** forward the nonce on a request header (`x-nonce`) so Next applies it to its inline scripts (Next reads the nonce from the CSP it sees).
   - Dev exception: in `NODE_ENV !== 'production'`, keep `'unsafe-eval'` (and `'unsafe-inline'`) so HMR/React-Refresh works.
2. **Remove the `Content-Security-Policy` entry from `next.config.ts` headers()** (middleware now owns it) — but keep the other security headers there (`X-Frame-Options`, etc.), or move them all into middleware for one source of truth.
3. Verify no app code needs the nonce manually (none found); if any `<script>`/`next/script inline` is added later, read the nonce via `headers().get('x-nonce')`.

**Scope decision:** nonce **scripts** now (closes the XSS vector — the point of #58); leave `style-src 'unsafe-inline'` for Tailwind as a documented follow-up (noncing Tailwind v4's runtime style injection is fiddly and lower-value).

**Tests / verification:** unit-test the middleware CSP string (prod: no `unsafe-inline`/`unsafe-eval` in script-src, nonce present; dev: relaxed). **Critical manual check:** run a prod build (`npm run build && npm start`) and confirm pages hydrate with **no CSP violations** in the browser console — this is the regression that matters.

**Risk/rollback:** highest of the four (hydration regression if the nonce isn't wired correctly). Mitigation: verify against a prod build locally before merge. Rollback = restore the `next.config.ts` CSP line and delete `middleware.ts`.

---

## Cross-cutting

- **No DB migration** for any of the four. Deploy = code-only (plus setting `ADMIN_PASSWORD` on the box for #59).
- **Build gate:** run `npm run build` before merge — `'use server'` files reject non-async exports, and `next lint` is broken repo-wide (use `npx eslint`). New shared helpers (`constantTimeAuth`, middleware) and the `apiAuth` change touch server boundaries, so a clean build is the real check.
- **Severity note for the tracker:** #61 and #64 were re-graded to critical during validation (see `docs/issuesMerged.md`); closing these four clears the entire critical row.
- **Suggested next step:** turn this into a per-task implementation plan and execute subagent-driven on `fix/critical-security-hardening`, one task per issue with a build+review checkpoint between each.
