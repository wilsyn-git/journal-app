# Security Batch A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three app-code security gaps — avatar content-type bypass (#62), cron secret timing leak (#63), and JWT key-separation regression risk (#60).

**Architecture:** Three independent, self-contained changes on one feature branch (`fix/security-batch-a-62-63-60`, already created). Each adds a small pure/testable function plus a call-site change, fully covered by Vitest. No new dependencies, no DB/schema/migration changes, no EC2 env changes.

**Tech Stack:** TypeScript, Next.js server actions / route handlers, Node `crypto`, Vitest (`npm test` → `vitest run`), `@/` path alias.

**Spec:** `docs/superpowers/specs/2026-06-11-security-batch-a-design.md`

---

## File Structure

- `lib/avatarValidation.ts` — **modify**: add server-only `validateAvatarBytes(buffer)`.
- `app/actions/settings.ts` — **modify**: call `validateAvatarBytes` before `writeFile`.
- `tests/lib/avatarValidation.test.ts` — **modify**: add magic-byte cases.
- `lib/api/timingSafe.ts` — **create**: `safeSecretCompare(a, b)` helper.
- `tests/lib/timingSafe.test.ts` — **create**: helper tests.
- `app/api/v1/cron/streak/route.ts` — **modify**: use `safeSecretCompare`.
- `lib/api/jwt.ts` — **modify**: extract + use `resolveJwtSecret(env)`.
- `tests/lib/jwtSecret.test.ts` — **create**: `resolveJwtSecret` tests.
- `DEPLOYMENT.md` — **modify**: add `CRON_SECRET` rotation note.

---

## Task 1: Avatar magic-byte validation (#62)

**Files:**
- Modify: `lib/avatarValidation.ts`
- Test: `tests/lib/avatarValidation.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/lib/avatarValidation.test.ts` — update the import line to include `validateAvatarBytes`, then append this block:

```typescript
import { validateAvatarFile, validateAvatarBytes, AVATAR_MAX_BYTES } from '@/lib/avatarValidation'

describe('validateAvatarBytes', () => {
  it('accepts a buffer with the JPEG SOI marker', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(validateAvatarBytes(buf)).toBeNull()
  })

  it('rejects a PNG buffer', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    expect(validateAvatarBytes(buf)).toBe('File is not a valid JPEG image')
  })

  it('rejects an SVG/HTML buffer', () => {
    const buf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">', 'utf-8')
    expect(validateAvatarBytes(buf)).toBe('File is not a valid JPEG image')
  })

  it('rejects an empty/too-short buffer', () => {
    expect(validateAvatarBytes(Buffer.from([]))).toBe('File is not a valid JPEG image')
    expect(validateAvatarBytes(Buffer.from([0xff, 0xd8]))).toBe('File is not a valid JPEG image')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/avatarValidation.test.ts`
Expected: FAIL — `validateAvatarBytes is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

In `lib/avatarValidation.ts`, append after the existing `validateAvatarFile`:

```typescript
/**
 * Server-side defense for #62: the client-supplied MIME type (checked by
 * validateAvatarFile) is forgeable, so confirm the raw bytes are actually a
 * JPEG before writing to a public path. JPEG files begin with the SOI marker
 * 0xFF 0xD8 followed by 0xFF. Returns an error message if invalid, else null.
 */
export function validateAvatarBytes(buffer: Buffer): string | null {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
        return 'File is not a valid JPEG image'
    }
    return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/avatarValidation.test.ts`
Expected: PASS (all `validateAvatarFile` and `validateAvatarBytes` cases).

- [ ] **Step 5: Commit**

```bash
git add lib/avatarValidation.ts tests/lib/avatarValidation.test.ts
git commit -m "feat(security): add server-side JPEG magic-byte avatar validation (#62)"
```

---

## Task 2: Wire avatar byte-check into the upload action (#62)

**Files:**
- Modify: `app/actions/settings.ts`

No unit test for this task (server action does filesystem + Prisma I/O; covered by the dev-server smoke test in Verification). The pure logic is already tested in Task 1.

- [ ] **Step 1: Update the import**

In `app/actions/settings.ts`, change the existing import:

```typescript
import { validateAvatarFile } from "@/lib/avatarValidation"
```

to:

```typescript
import { validateAvatarFile, validateAvatarBytes } from "@/lib/avatarValidation"
```

- [ ] **Step 2: Add the byte-check before writeFile**

In the `if (file && file.size > 0) {` block, the current code reads:

```typescript
        const avatarError = validateAvatarFile(file)
        if (avatarError) return { error: avatarError }

        const buffer = Buffer.from(await file.arrayBuffer())
        const filename = `${userId}-${randomUUID()}.jpg`
```

Insert the byte-check immediately after the buffer is created:

```typescript
        const avatarError = validateAvatarFile(file)
        if (avatarError) return { error: avatarError }

        const buffer = Buffer.from(await file.arrayBuffer())
        const bytesError = validateAvatarBytes(buffer)
        if (bytesError) return { error: bytesError }

        const filename = `${userId}-${randomUUID()}.jpg`
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `settings.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/actions/settings.ts
git commit -m "fix(security): reject forged avatars before disk write (#62)"
```

---

## Task 3: Timing-safe secret compare helper (#63)

**Files:**
- Create: `lib/api/timingSafe.ts`
- Test: `tests/lib/timingSafe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/timingSafe.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { safeSecretCompare } from '@/lib/api/timingSafe'

describe('safeSecretCompare', () => {
  it('returns true for equal non-empty strings', () => {
    expect(safeSecretCompare('s3cret-value', 's3cret-value')).toBe(true)
  })

  it('returns false for different values of equal length', () => {
    expect(safeSecretCompare('s3cret-value', 's3cret-VALUE')).toBe(false)
  })

  it('returns false for different-length values', () => {
    expect(safeSecretCompare('short', 'a-much-longer-secret')).toBe(false)
  })

  it('returns false when either side is null/undefined/empty', () => {
    expect(safeSecretCompare(null, 'x')).toBe(false)
    expect(safeSecretCompare('x', undefined)).toBe(false)
    expect(safeSecretCompare('', '')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/timingSafe.test.ts`
Expected: FAIL — cannot find module `@/lib/api/timingSafe`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/api/timingSafe.ts`:

```typescript
import { timingSafeEqual } from 'crypto'

/**
 * Constant-time secret comparison for #63. crypto.timingSafeEqual throws if the
 * two buffers differ in length, so we length-guard first (returning false). A
 * missing/empty value on either side is never a valid match. Compares over
 * UTF-8 bytes.
 */
export function safeSecretCompare(
    a: string | null | undefined,
    b: string | null | undefined,
): boolean {
    if (!a || !b) return false
    const bufA = Buffer.from(a, 'utf-8')
    const bufB = Buffer.from(b, 'utf-8')
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/timingSafe.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add lib/api/timingSafe.ts tests/lib/timingSafe.test.ts
git commit -m "feat(security): add timing-safe secret compare helper (#63)"
```

---

## Task 4: Use timing-safe compare in the cron route (#63)

**Files:**
- Modify: `app/api/v1/cron/streak/route.ts`

- [ ] **Step 1: Add the import**

In `app/api/v1/cron/streak/route.ts`, add after the existing `import { chunk } from '@/lib/chunk'` line:

```typescript
import { safeSecretCompare } from '@/lib/api/timingSafe'
```

- [ ] **Step 2: Replace the guard**

Current code (lines ~10-14):

```typescript
    // Simple shared secret auth for cron endpoints
    const cronSecret = request.headers.get('x-cron-secret')
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
        return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)
    }
```

Replace with:

```typescript
    // Constant-time shared-secret auth for cron endpoints (#63)
    const cronSecret = request.headers.get('x-cron-secret')
    if (!safeSecretCompare(cronSecret, process.env.CRON_SECRET)) {
        return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)
    }
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: no errors related to `route.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/cron/streak/route.ts
git commit -m "fix(security): cron auth uses timing-safe compare (#63)"
```

---

## Task 5: JWT key-separation hard guard (#60)

**Files:**
- Modify: `lib/api/jwt.ts`
- Test: `tests/lib/jwtSecret.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/jwtSecret.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveJwtSecret } from '@/lib/api/jwt'

describe('resolveJwtSecret', () => {
  it('returns API_JWT_SECRET in production, ignoring AUTH_SECRET', () => {
    expect(
      resolveJwtSecret({ API_JWT_SECRET: 'api-key', AUTH_SECRET: 'auth-key', NODE_ENV: 'production' }),
    ).toBe('api-key')
  })

  it('throws in production when API_JWT_SECRET is unset', () => {
    expect(() =>
      resolveJwtSecret({ AUTH_SECRET: 'auth-key', NODE_ENV: 'production' }),
    ).toThrow('API_JWT_SECRET must be set in production')
  })

  it('falls back to AUTH_SECRET in development', () => {
    expect(resolveJwtSecret({ AUTH_SECRET: 'auth-key', NODE_ENV: 'development' })).toBe('auth-key')
  })

  it('falls back to dev-only-secret when nothing is set in development', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'development' })).toBe('dev-only-secret')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/jwtSecret.test.ts`
Expected: FAIL — `resolveJwtSecret` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `lib/api/jwt.ts`, replace the current top-of-file secret resolution:

```typescript
import { SignJWT, jwtVerify } from 'jose'

const secret = process.env.API_JWT_SECRET || process.env.AUTH_SECRET
if (!secret && process.env.NODE_ENV === 'production') {
  throw new Error('API_JWT_SECRET or AUTH_SECRET must be set in production')
}
const JWT_SECRET = new TextEncoder().encode(secret || 'dev-only-secret')
```

with:

```typescript
import { SignJWT, jwtVerify } from 'jose'

/**
 * Resolve the API JWT signing secret (#60). Production REQUIRES a dedicated
 * API_JWT_SECRET so the mobile-API signing key is separated from the NextAuth
 * session secret (AUTH_SECRET) — no silent fallback in prod. Non-production
 * keeps a convenient fallback chain so local dev needs no extra config.
 */
export function resolveJwtSecret(env: {
  API_JWT_SECRET?: string
  AUTH_SECRET?: string
  NODE_ENV?: string
}): string {
  if (env.NODE_ENV === 'production') {
    if (!env.API_JWT_SECRET) {
      throw new Error('API_JWT_SECRET must be set in production')
    }
    return env.API_JWT_SECRET
  }
  return env.API_JWT_SECRET || env.AUTH_SECRET || 'dev-only-secret'
}

const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret(process.env))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/jwtSecret.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add lib/api/jwt.ts tests/lib/jwtSecret.test.ts
git commit -m "fix(security): require API_JWT_SECRET in production, drop AUTH_SECRET fallback (#60)"
```

---

## Task 6: Document CRON_SECRET rotation (#63)

**Files:**
- Modify: `DEPLOYMENT.md`

- [ ] **Step 1: Locate the cron/secrets section**

Run: `grep -niE "cron_secret|cron|secret" DEPLOYMENT.md | head`
Identify where environment/secrets are documented (the section listing `.env` keys).

- [ ] **Step 2: Add a rotation subsection**

Append this subsection near the env/secrets documentation in `DEPLOYMENT.md`:

```markdown
### Rotating `CRON_SECRET`

The cron endpoint (`POST /api/v1/cron/streak`) authenticates via a constant-time
comparison of the `x-cron-secret` request header against `CRON_SECRET`. To rotate:

1. Generate a new value: `openssl rand -base64 32`.
2. Update `CRON_SECRET` in the server `.env` (`/home/ubuntu/journal-app/.env`).
3. Update the external caller (whatever issues the scheduled `POST`) to send the
   new value in the `x-cron-secret` header — do this in lockstep so no scheduled
   run is rejected.
4. Restart the app: `pm2 restart journal-app`.
```

- [ ] **Step 3: Commit**

```bash
git add DEPLOYMENT.md
git commit -m "docs(security): document CRON_SECRET rotation (#63)"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green, including the three new/extended files.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 3: Dev-server smoke test**

Start the dev server (`npm run dev`), then in the app:
- Log in (confirms JWT path still works).
- Upload a valid JPEG avatar → succeeds.
- Attempt to upload a non-JPEG (e.g. rename a `.png` to `.jpg`) → rejected with "File is not a valid JPEG image".

- [ ] **Step 4: Update issue trackers**

Mark #60, #62, #63 as closed/fixed in `docs/issuesMerged.md` (move to the FIXED table / update the OPEN row and Tally) and in `ISSUES.md`.

```bash
git add docs/issuesMerged.md ISSUES.md
git commit -m "docs(security): mark #60, #62, #63 closed in trackers"
```

---

## Self-Review Notes

- **Spec coverage:** #62 → Tasks 1-2; #63 → Tasks 3-4 (code) + Task 6 (docs); #60 → Task 5. Verification → Task 7. All spec sections mapped.
- **Type consistency:** `validateAvatarBytes(buffer: Buffer): string | null`, `safeSecretCompare(a, b): boolean`, `resolveJwtSecret(env): string` — names/signatures used identically across tasks and tests.
- **No placeholders:** every code step shows complete code; every run step shows the command and expected result.
