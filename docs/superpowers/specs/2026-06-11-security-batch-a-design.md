# Security Batch A — App-code fixes (#62, #63, #60)

**Date:** 2026-06-11
**Branch:** `fix/security-batch-a-62-63-60`
**Scope:** Three "important security & infra" items from `docs/issuesMerged.md` that are app-code changes. No new dependencies, no DB/schema changes, no migration.

## Context

All three verified still true against current `main` on 2026-06-11. Production EC2 (`ssh little`) env was inspected:
- `API_JWT_SECRET` is **set** and **differs** from `AUTH_SECRET` → #60's fallback is dormant in prod.
- `CRON_SECRET` is **set**.
- No crontab/systemd timer triggers the cron route on EC2 → the cron caller is external (or not yet scheduled). Not a blocker: the #63 fix keeps the caller contract unchanged.

## Goals / Non-goals

**Goals:** Close the avatar upload content-type bypass; remove the cron secret timing leak; make the JWT key-separation config mandatory in production.

**Non-goals (deliberately deferred):**
- #62: No `sharp` re-encode / EXIF stripping. Magic-byte sniff only.
- #63: No HMAC signed-timestamp / replay protection. Timing-safe compare on the existing static secret only.
- #60: No removal of the dev fallback; non-prod behavior unchanged.

---

## #62 — Avatar magic-byte validation

**Problem:** `app/actions/settings.ts` writes the raw uploaded buffer to a public path (`public/uploads/avatars/`) after only `validateAvatarFile`, which checks `file.type` — the client-supplied MIME string. An attacker can forge `type: image/jpeg` and upload arbitrary bytes (HTML/SVG/script polyglot) served from our origin → stored-XSS / content-sniffing vector.

**Change:**
- `lib/avatarValidation.ts`: add server-only `validateAvatarBytes(buffer: Buffer): string | null`. Returns an error string unless the buffer's leading bytes are a JPEG SOI marker (`0xFF 0xD8 0xFF`). Keep existing `validateAvatarFile` (client MIME + size) as the first-pass check.
- `app/actions/settings.ts`: after `Buffer.from(await file.arrayBuffer())` (currently line 37) and **before** `writeFile` (currently line 48), call `validateAvatarBytes(buffer)`; if it returns non-null, return `{ error }` and do not touch disk.

**Test:** `tests/avatarValidation.test.ts`
- Buffer starting `FF D8 FF` → passes (null).
- PNG (`89 50 4E 47`), SVG/HTML (`<`), empty buffer → rejected with an error string, even when paired with a forged `image/jpeg` MIME.

---

## #63 — Cron timing-safe secret compare

**Problem:** `app/api/v1/cron/streak/route.ts:12-14` compares the incoming `x-cron-secret` header to `process.env.CRON_SECRET` with `!==` (non-constant-time → timing side-channel). Endpoint only triggers streak push notifications (low blast radius).

**Change:**
- New `lib/api/timingSafe.ts`: `safeSecretCompare(a: string | null | undefined, b: string | null | undefined): boolean`. Returns `false` if either side is missing or lengths differ (guards against `crypto.timingSafeEqual` throwing on unequal-length buffers), otherwise returns the `timingSafeEqual` result over UTF-8 byte buffers. Reusable by future cron routes.
- `app/api/v1/cron/streak/route.ts`: replace the guard with `if (!safeSecretCompare(cronSecret, process.env.CRON_SECRET)) return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)`. Caller contract unchanged (same header name, same secret value).
- `DEPLOYMENT.md`: add a short "Rotating `CRON_SECRET`" subsection — update `.env`, restart PM2, and update the external caller in lockstep.

**Test:** `tests/timingSafe.test.ts`
- Equal non-empty strings → `true`.
- Different value (same length) → `false`.
- Different length → `false`.
- `null` / `undefined` / empty on either side → `false`.

---

## #60 — JWT key-separation hard guard

**Problem:** `lib/api/jwt.ts:3` resolves the signing secret as `API_JWT_SECRET || AUTH_SECRET`. In production this silently borrows the NextAuth session secret if `API_JWT_SECRET` is unset — a key-separation regression waiting to happen. Prod currently sets it, so the fallback is dormant; the goal is to make that mandatory.

**Change:**
- `lib/api/jwt.ts`: extract a pure `resolveJwtSecret(env: { API_JWT_SECRET?: string; AUTH_SECRET?: string; NODE_ENV?: string }): string`:
  - Production: require `API_JWT_SECRET`. If unset, `throw new Error('API_JWT_SECRET must be set in production')`. No `AUTH_SECRET` fallback in prod.
  - Non-production: return `API_JWT_SECRET || AUTH_SECRET || 'dev-only-secret'` (unchanged behavior).
- Module top-level calls `resolveJwtSecret(process.env)` to build `JWT_SECRET`. Prod already sets `API_JWT_SECRET`, so zero runtime impact.

**Test:** `tests/jwtSecret.test.ts` (against the pure `resolveJwtSecret`)
- production + `API_JWT_SECRET` set → returns it (ignores `AUTH_SECRET`).
- production + `API_JWT_SECRET` unset → throws.
- development + only `AUTH_SECRET` set → returns `AUTH_SECRET`.
- development + nothing set → returns `'dev-only-secret'`.

---

## Verification (before merge)

- `npm run build` green.
- `npm test` green (new tests + existing suite).
- Dev-server smoke: log in; upload a valid avatar (succeeds); attempt a non-JPEG avatar (rejected with message).

## Deployment note

Separate step, after user approval. **No EC2 env changes required** — `API_JWT_SECRET` and `CRON_SECRET` are already set. Standard safe deploy flow (backup DB → `git pull` → `npm install` if `package.json` changed → build → `pm2 restart journal-app`). No migration (`prisma/` untouched).

## Tracker updates (on completion)

Mark #62, #63, #60 closed in `docs/issuesMerged.md` and `ISSUES.md`.
