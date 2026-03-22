# iOS REST API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a REST API layer (`/api/v1/`) to the journal app so a native iOS app can consume journal entries, tasks, and stats with JWT auth, push notifications, and offline sync support.

**Architecture:** New API route handlers under `/app/api/v1/` that reuse existing Prisma models and business logic. A new `DeviceSession` model handles refresh tokens and APNs device registration. JWT access tokens are signed/verified with `jose` library. Push notifications sent via APNs using `@parse/node-apn`.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 6, jose (JWT), @parse/node-apn (push), Zod 4 (validation), node-cron (streak checks)

**Spec:** `docs/superpowers/specs/2026-03-22-ios-api-design.md`

---

### Task 1: Add DeviceSession model to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma:60-84` (User model — add relation)
- Modify: `prisma/schema.prisma` (append DeviceSession model)

- [ ] **Step 1: Add DeviceSession model to schema**

Add after the `JournalEntry` model at the end of `prisma/schema.prisma`:

```prisma
model DeviceSession {
  id           String    @id @default(uuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  deviceToken  String?
  refreshToken String    @unique
  deviceName   String
  lastActiveAt DateTime  @default(now())
  createdAt    DateTime  @default(now())
  revokedAt    DateTime?

  @@index([userId])
  @@index([refreshToken])
}
```

Add to the `User` model (after `taskAssignments` on line 78):

```prisma
  deviceSessions DeviceSession[]
```

- [ ] **Step 2: Generate and apply migration**

Run:
```bash
npx prisma migrate dev --name add-device-session
```
Expected: Migration creates `DeviceSession` table successfully.

- [ ] **Step 3: Verify Prisma client generation**

Run:
```bash
npx prisma generate
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add DeviceSession model for iOS API auth"
```

---

### Task 2: Install dependencies and create JWT utilities

**Files:**
- Modify: `package.json` (add jose)
- Create: `lib/api/jwt.ts`
- Create: `lib/api/apiAuth.ts`
- Create: `lib/api/apiResponse.ts`

- [ ] **Step 1: Install jose for JWT signing/verification**

Run:
```bash
npm install jose
```

`jose` is chosen over `jsonwebtoken` because it works in edge runtimes and has no native dependencies.

- [ ] **Step 2: Create JWT utility**

Create `lib/api/jwt.ts`:

```typescript
import { SignJWT, jwtVerify } from 'jose'

const secret = process.env.API_JWT_SECRET || process.env.AUTH_SECRET
if (!secret && process.env.NODE_ENV === 'production') {
  throw new Error('API_JWT_SECRET or AUTH_SECRET must be set in production')
}
const JWT_SECRET = new TextEncoder().encode(secret || 'dev-only-secret')

const ACCESS_TOKEN_EXPIRY = '1h'

export interface AccessTokenPayload {
  userId: string
  orgId: string
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET)
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET)
  return {
    userId: payload.userId as string,
    orgId: payload.orgId as string,
  }
}
```

- [ ] **Step 3: Create API auth middleware helper**

Create `lib/api/apiAuth.ts`:

```typescript
import { NextRequest } from 'next/server'
import { verifyAccessToken, AccessTokenPayload } from './jwt'

export async function authenticateRequest(
  request: NextRequest
): Promise<{ payload: AccessTokenPayload } | { error: string; status: number }> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 }
  }

  const token = authHeader.slice(7)
  try {
    const payload = await verifyAccessToken(token)
    return { payload }
  } catch {
    return { error: 'Invalid or expired token', status: 401 }
  }
}
```

- [ ] **Step 4: Create standard API response helpers**

Create `lib/api/apiResponse.ts`:

```typescript
import { NextResponse } from 'next/server'

export function apiSuccess(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function apiError(
  code: string,
  message: string,
  status: number
) {
  return NextResponse.json(
    { error: { code, message } },
    { status }
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/api/
git commit -m "feat: add JWT utilities and API auth helpers"
```

---

### Task 3: Auth endpoints — login, refresh, logout

**Files:**
- Create: `app/api/v1/auth/login/route.ts`
- Create: `app/api/v1/auth/refresh/route.ts`
- Create: `app/api/v1/auth/logout/route.ts`

- [ ] **Step 1: Create login endpoint**

Create `app/api/v1/auth/login/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { randomBytes, createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { signAccessToken } from '@/lib/api/jwt'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'

// In-memory rate limiting by IP (resets on server restart — adequate for small deployment)
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

function checkRateLimit(ip: string): { limited: boolean; retryAfter?: number } {
  const now = Date.now()
  const record = loginAttempts.get(ip)

  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { limited: false }
  }

  record.count++
  if (record.count > MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000)
    return { limited: true, retryAfter }
  }

  return { limited: false }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  deviceName: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const rateCheck = checkRateLimit(ip)
  if (rateCheck.limited) {
    return apiError('RATE_LIMITED', 'Too many login attempts', 429)
  }

  try {
    const body = await request.json()
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', 'Invalid email, password, or device name', 422)
    }

    const { email, password, deviceName } = parsed.data

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return apiError('UNAUTHORIZED', 'Invalid credentials', 401)
    }

    const passwordsMatch = await bcrypt.compare(password, user.password)
    if (!passwordsMatch) {
      return apiError('UNAUTHORIZED', 'Invalid credentials', 401)
    }

    const accessToken = await signAccessToken({
      userId: user.id,
      orgId: user.organizationId,
    })

    const rawRefreshToken = randomBytes(32).toString('hex')
    const hashedRefreshToken = createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex')

    await prisma.deviceSession.create({
      data: {
        userId: user.id,
        refreshToken: hashedRefreshToken,
        deviceName,
      },
    })

    return apiSuccess({
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 3600,
      user: { id: user.id, name: user.name, email: user.email },
    })
  } catch (error) {
    console.error('Login error:', error)
    return apiError('INTERNAL_ERROR', 'Login failed', 500)
  }
}
```

- [ ] **Step 2: Create refresh endpoint**

Create `app/api/v1/auth/refresh/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { randomBytes, createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { signAccessToken } from '@/lib/api/jwt'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = refreshSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', 'Refresh token required', 422)
    }

    const hashedToken = createHash('sha256')
      .update(parsed.data.refreshToken)
      .digest('hex')

    const session = await prisma.deviceSession.findUnique({
      where: { refreshToken: hashedToken },
      include: { user: true },
    })

    if (!session || session.revokedAt) {
      return apiError('UNAUTHORIZED', 'Invalid or revoked refresh token', 401)
    }

    // Check expiry (30 days from creation)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    if (session.createdAt < thirtyDaysAgo) {
      return apiError('UNAUTHORIZED', 'Refresh token expired', 401)
    }

    // Rotate refresh token
    const newRawRefreshToken = randomBytes(32).toString('hex')
    const newHashedRefreshToken = createHash('sha256')
      .update(newRawRefreshToken)
      .digest('hex')

    await prisma.deviceSession.update({
      where: { id: session.id },
      data: {
        refreshToken: newHashedRefreshToken,
        lastActiveAt: new Date(),
      },
    })

    const accessToken = await signAccessToken({
      userId: session.user.id,
      orgId: session.user.organizationId,
    })

    return apiSuccess({
      accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: 3600,
    })
  } catch (error) {
    console.error('Refresh error:', error)
    return apiError('INTERNAL_ERROR', 'Token refresh failed', 500)
  }
}
```

- [ ] **Step 3: Create logout endpoint**

Create `app/api/v1/auth/logout/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'

const logoutSchema = z.object({
  refreshToken: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = logoutSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', 'Refresh token required', 422)
    }

    const hashedToken = createHash('sha256')
      .update(parsed.data.refreshToken)
      .digest('hex')

    const session = await prisma.deviceSession.findUnique({
      where: { refreshToken: hashedToken },
    })

    if (session) {
      await prisma.deviceSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      })
    }

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    return apiError('INTERNAL_ERROR', 'Logout failed', 500)
  }
}
```

- [ ] **Step 4: Test auth flow manually**

Run the dev server and test with curl:
```bash
# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"password123","deviceName":"Test Device"}'

# Should return: { accessToken, refreshToken, expiresIn, user }
```

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/auth/
git commit -m "feat: add auth endpoints (login, refresh, logout)"
```

---

### Task 4: Prompts endpoints

**Files:**
- Create: `app/api/v1/prompts/today/route.ts`
- Create: `app/api/v1/prompts/all/route.ts`

- [ ] **Step 1: Create today's prompts endpoint**

Create `app/api/v1/prompts/today/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { getActivePrompts, getEffectiveProfileIds } from '@/app/lib/data'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId, orgId } = auth.payload
    const timezone = request.headers.get('x-timezone') || DEFAULT_TIMEZONE
    const profileIds = await getEffectiveProfileIds(userId)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
    const prompts = await getActivePrompts(userId, orgId, profileIds, today)

    // Resolve category names for the response
    const categoryIds = [...new Set(prompts.map((p) => p.categoryId).filter(Boolean))]
    const categories = categoryIds.length > 0
      ? await prisma.promptCategory.findMany({
          where: { id: { in: categoryIds as string[] } },
          select: { id: true, name: true },
        })
      : []
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

    return apiSuccess(
      prompts.map((p) => ({
        id: p.id,
        content: p.content,
        type: p.type,
        options: p.options,
        sortOrder: p.sortOrder,
        categoryId: p.categoryId,
        categoryName: p.categoryId ? categoryMap.get(p.categoryId) || null : null,
      }))
    )
  } catch (error) {
    console.error('Prompts today error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to fetch prompts', 500)
  }
}
```

- [ ] **Step 2: Create all-prompts endpoint (for offline cache)**

Create `app/api/v1/prompts/all/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { getEffectiveProfileIds } from '@/app/lib/data'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId, orgId } = auth.payload
    const effectiveProfileIds = await getEffectiveProfileIds(userId)

    const [prompts, categories, profileRules] = await Promise.all([
      prisma.prompt.findMany({
        where: { organizationId: orgId, isActive: true },
        select: {
          id: true,
          content: true,
          type: true,
          options: true,
          isGlobal: true,
          sortOrder: true,
          categoryId: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.promptCategory.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true },
      }),
      prisma.profileRule.findMany({
        where: { profileId: { in: effectiveProfileIds } },
        select: {
          id: true,
          profileId: true,
          categoryId: true,
          categoryString: true,
          minCount: true,
          maxCount: true,
          includeAll: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ])

    return apiSuccess({
      prompts,
      categories,
      profileRules,
      effectiveProfileIds,
    })
  } catch (error) {
    console.error('Prompts all error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to fetch prompts', 500)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/prompts/
git commit -m "feat: add prompt endpoints (today, all)"
```

---

### Task 5: Journal entry endpoints

**Files:**
- Create: `app/api/v1/entries/route.ts`
- Create: `app/api/v1/entries/batch/route.ts`

- [ ] **Step 1: Create entries GET and POST endpoint**

Create `app/api/v1/entries/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'

const entrySchema = z.object({
  promptId: z.string().uuid(),
  answer: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// Match existing saveJournalResponse() pattern: uses server-local day boundaries.
// This is consistent with how the web app stores and queries entries.
function dayBounds(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)
  return { startOfDay, endOfDay }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  const { userId } = auth.payload
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  try {
    let where: Record<string, unknown> = { userId }

    if (date) {
      const { startOfDay, endOfDay } = dayBounds(date)
      where.createdAt = { gte: startOfDay, lte: endOfDay }
    } else if (from && to) {
      const { startOfDay } = dayBounds(from)
      const { endOfDay } = dayBounds(to)
      where.createdAt = { gte: startOfDay, lte: endOfDay }
    }

    const entries = await prisma.journalEntry.findMany({
      where,
      include: {
        prompt: {
          select: { id: true, content: true, type: true, options: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return apiSuccess(
      entries.map((e) => ({
        id: e.id,
        promptId: e.promptId,
        prompt: e.prompt,
        answer: e.answer,
        isLiked: e.isLiked,
        date: e.createdAt.toISOString().split('T')[0],
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      }))
    )
  } catch (error) {
    console.error('Entries GET error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to fetch entries', 500)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const body = await request.json()
    const parsed = entrySchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', 'Invalid entry data', 422)
    }

    const { userId } = auth.payload
    const { promptId, answer, date } = parsed.data

    // Match existing saveJournalResponse() pattern: query by createdAt day range
    const { startOfDay, endOfDay } = dayBounds(date)

    const existing = await prisma.journalEntry.findFirst({
      where: {
        userId,
        promptId,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    })

    if (existing) {
      await prisma.journalEntry.update({
        where: { id: existing.id },
        data: { answer, updatedAt: new Date() },
      })
    } else {
      await prisma.journalEntry.create({
        data: { userId, promptId, answer },
      })
    }

    return apiSuccess({ success: true }, 200)
  } catch (error) {
    console.error('Entry POST error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to save entry', 500)
  }
}
```

- [ ] **Step 2: Create batch sync endpoint**

Create `app/api/v1/entries/batch/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'

const batchSchema = z.object({
  entries: z.array(
    z.object({
      promptId: z.string().uuid(),
      answer: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
  ),
})

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const body = await request.json()
    const parsed = batchSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', 'Invalid batch data', 422)
    }

    const { userId } = auth.payload
    const errors: { promptId: string; date: string; error: string }[] = []
    let synced = 0

    for (const entry of parsed.data.entries) {
      try {
        const [year, month, day] = entry.date.split('-').map(Number)
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)

        const existing = await prisma.journalEntry.findFirst({
          where: {
            userId,
            promptId: entry.promptId,
            createdAt: { gte: startOfDay, lte: endOfDay },
          },
        })

        if (existing) {
          await prisma.journalEntry.update({
            where: { id: existing.id },
            data: { answer: entry.answer, updatedAt: new Date() },
          })
        } else {
          await prisma.journalEntry.create({
            data: {
              userId,
              promptId: entry.promptId,
              answer: entry.answer,
            },
          })
        }
        synced++
      } catch (err) {
        errors.push({
          promptId: entry.promptId,
          date: entry.date,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return apiSuccess({ synced, errors })
  } catch (error) {
    console.error('Batch sync error:', error)
    return apiError('INTERNAL_ERROR', 'Batch sync failed', 500)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/entries/
git commit -m "feat: add journal entry endpoints (get, post, batch sync)"
```

---

### Task 6: Task endpoints

**Files:**
- Create: `app/api/v1/tasks/route.ts`
- Create: `app/api/v1/tasks/assignments/[assignmentId]/complete/route.ts`

- [ ] **Step 1: Create tasks list endpoint**

Create `app/api/v1/tasks/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload

    const assignments = await prisma.taskAssignment.findMany({
      where: { userId },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            priority: true,
            dueDate: true,
            archivedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const tasks = assignments
      .filter((a) => !a.task.archivedAt)
      .map((a) => ({
        taskId: a.task.id,
        assignmentId: a.id,
        title: a.task.title,
        description: a.task.description,
        priority: a.task.priority,
        dueDate: a.task.dueDate?.toISOString() || null,
        completedAt: a.completedAt?.toISOString() || null,
        notes: a.notes,
      }))

    return apiSuccess(tasks)
  } catch (error) {
    console.error('Tasks GET error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to fetch tasks', 500)
  }
}
```

- [ ] **Step 2: Create task completion endpoint**

Create `app/api/v1/tasks/assignments/[assignmentId]/complete/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'

const completeSchema = z.object({
  notes: z.string().optional(),
})

type RouteParams = { params: Promise<{ assignmentId: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { assignmentId } = await params
    const body = await request.json().catch(() => ({}))
    const parsed = completeSchema.safeParse(body)

    const { userId, orgId } = auth.payload

    const assignment = await prisma.taskAssignment.findUnique({
      where: { id: assignmentId },
      include: { task: true },
    })

    if (!assignment) {
      return apiError('NOT_FOUND', 'Assignment not found', 404)
    }

    if (assignment.task.organizationId !== orgId) {
      return apiError('UNAUTHORIZED', 'Access denied', 403)
    }

    if (assignment.userId !== userId) {
      return apiError('UNAUTHORIZED', 'Access denied', 403)
    }

    // Idempotent: if already completed, return success
    if (assignment.completedAt) {
      return apiSuccess({ success: true })
    }

    await prisma.taskAssignment.update({
      where: { id: assignmentId },
      data: {
        completedAt: new Date(),
        ...(parsed.success && parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      },
    })

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Task complete error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to complete task', 500)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/tasks/
git commit -m "feat: add task endpoints (list, complete assignment)"
```

---

### Task 7: Stats endpoint

**Files:**
- Create: `lib/streaks.ts` (extracted from `app/lib/analytics.ts`)
- Modify: `app/lib/analytics.ts` (import from shared utility)
- Create: `app/api/v1/stats/route.ts`

The existing `getUserStats()` in `app/lib/analytics.ts` uses React's `cache()` and reads timezone from a cookie via `getUserTimezone()`. For the API, we need the same computation but with timezone from the `X-Timezone` header. To avoid duplicating `calculateStreaks`, extract it to a shared utility first.

- [ ] **Step 1: Extract calculateStreaks to shared utility**

Create `lib/streaks.ts`:

```typescript
export function calculateStreaks(sortedDays: string[], todayStr: string) {
  if (sortedDays.length === 0) return { current: 0, max: 0 }

  let maxStreak = 0
  let tempStreak = 0

  for (let i = 0; i < sortedDays.length; i++) {
    if (i === 0) {
      tempStreak = 1
    } else {
      const current = new Date(sortedDays[i - 1])
      const prev = new Date(sortedDays[i])
      const diffDays = Math.round(
        Math.abs(current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (diffDays === 1) {
        tempStreak++
      } else {
        if (tempStreak > maxStreak) maxStreak = tempStreak
        tempStreak = 1
      }
    }
  }
  if (tempStreak > maxStreak) maxStreak = tempStreak

  // Current streak
  let cStreak = 0
  const t = new Date(todayStr)
  t.setUTCDate(t.getUTCDate() - 1)
  const yesterdayStr = t.toISOString().split('T')[0]

  if (sortedDays.includes(todayStr) || sortedDays.includes(yesterdayStr)) {
    cStreak = 1
    for (let i = 0; i < sortedDays.length - 1; i++) {
      const d1 = new Date(sortedDays[i])
      const d2 = new Date(sortedDays[i + 1])
      const diff = Math.round((d1.getTime() - d2.getTime()) / (1000 * 3600 * 24))
      if (diff === 1) cStreak++
      else break
    }
  }

  return { current: cStreak, max: maxStreak }
}
```

- [ ] **Step 2: Update analytics.ts to import from shared utility**

Modify `app/lib/analytics.ts`:
- Remove the local `calculateStreaks` function (lines 8-64)
- Add import: `import { calculateStreaks } from '@/lib/streaks'`

- [ ] **Step 3: Create stats endpoint**

Create `app/api/v1/stats/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'
import { calculateStreaks } from '@/lib/streaks'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload
    const timezone = request.headers.get('x-timezone') || DEFAULT_TIMEZONE

    const entries = await prisma.journalEntry.findMany({
      where: { userId },
      select: {
        createdAt: true,
        answer: true,
        prompt: { select: { id: true, type: true, content: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })

    // Day stats for heatmap
    const dayStats: Record<string, { words: number; entries: number }> = {}
    const hourCounts: number[] = new Array(24).fill(0)

    entries.forEach((e) => {
      const date = new Date(e.createdAt)
      const dayStr = date.toLocaleDateString('en-CA', { timeZone: timezone })
      const hourStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone,
      })
      const hour = parseInt(hourStr) % 24
      if (!isNaN(hour)) hourCounts[hour]++

      if (e.prompt.type === 'TEXT') {
        const words = e.answer
          .toLowerCase()
          .replace(/[\u2018\u2019]/g, "'")
          .split(/[^a-z0-9']+/)
          .filter((w) => w.length > 0)

        if (!dayStats[dayStr]) dayStats[dayStr] = { words: 0, entries: 0 }
        dayStats[dayStr].words += words.length
        dayStats[dayStr].entries += 1
      }
    })

    const heatmap: Record<string, number> = {}
    Object.entries(dayStats).forEach(([date, stats]) => {
      if (stats.entries > 0) {
        heatmap[date] = Math.round(stats.words / stats.entries)
      }
    })

    // Streaks
    const sortedDays = Object.keys(heatmap).sort().reverse()
    const { current, max } = calculateStreaks(sortedDays, todayStr)

    // Avg words
    const textEntries = entries.filter((e) => e.prompt.type === 'TEXT')
    let totalWords = 0
    textEntries.forEach((e) => (totalWords += e.answer.trim().split(/\s+/).length))
    const avgWords = textEntries.length > 0 ? Math.round(totalWords / textEntries.length) : 0

    // Badges
    const badges = [
      {
        id: 'early-bird',
        name: 'Early Bird',
        icon: '🌅',
        description: '5 entries logged between 4AM and 8AM',
        unlocked: hourCounts.slice(4, 9).reduce((a, b) => a + b, 0) >= 5,
      },
      {
        id: 'night-owl',
        name: 'Night Owl',
        icon: '🦉',
        description: '5 entries logged between 10PM and 4AM',
        unlocked:
          hourCounts[22] + hourCounts[23] + hourCounts[0] + hourCounts[1] + hourCounts[2] + hourCounts[3] >= 5,
      },
      {
        id: 'streak-week',
        name: 'On a Roll',
        icon: '🔥',
        description: 'Achieved a 7-day streak',
        unlocked: max >= 7,
      },
      {
        id: 'dedicated',
        name: 'Dedicated',
        icon: '✍️',
        description: 'Logged 100 total answers',
        unlocked: entries.length >= 100,
      },
      {
        id: 'wordsmith',
        name: 'Wordsmith',
        icon: '📚',
        description: 'Average word count over 50',
        unlocked: avgWords >= 50 && textEntries.length > 5,
      },
    ]

    // Habit stats (CHECKBOX/RADIO)
    const taskMap = new Map<string, { prompt: string; days: Set<string> }>()

    entries.forEach((e) => {
      if (['CHECKBOX', 'RADIO', 'Checkboxes', 'Radio'].includes(e.prompt.type)) {
        if (!taskMap.has(e.prompt.id)) {
          taskMap.set(e.prompt.id, { prompt: e.prompt.content, days: new Set() })
        }
        taskMap
          .get(e.prompt.id)!
          .days.add(new Date(e.createdAt).toLocaleDateString('en-CA', { timeZone: timezone }))
      }
    })

    const taskStats = []
    for (const [id, data] of taskMap.entries()) {
      const days = Array.from(data.days).sort().reverse()
      const streaks = calculateStreaks(days, todayStr)
      taskStats.push({
        id,
        content: data.prompt,
        currentStreak: streaks.current,
        maxStreak: streaks.max,
        count: days.length,
      })
    }

    return apiSuccess({
      currentStreak: current,
      maxStreak: max,
      totalEntries: entries.length,
      daysCompleted: new Set(Object.keys(heatmap)).size,
      avgWords,
      heatmap,
      badges,
      taskStats,
    })
  } catch (error) {
    console.error('Stats error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to compute stats', 500)
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/streaks.ts app/lib/analytics.ts app/api/v1/stats/
git commit -m "feat: extract calculateStreaks to shared utility, add stats endpoint"
```

---

### Task 8: Device management endpoints

**Files:**
- Create: `app/api/v1/devices/route.ts`
- Create: `app/api/v1/devices/[token]/route.ts`

- [ ] **Step 1: Create device registration endpoint**

Create `app/api/v1/devices/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'

const registerSchema = z.object({
  deviceToken: z.string().min(1),
  deviceName: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const body = await request.json()
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('VALIDATION_ERROR', 'Device token and name required', 422)
    }

    const { userId } = auth.payload
    const { deviceToken, deviceName } = parsed.data

    // Update existing sessions for this user that don't have a device token yet,
    // or update any session with the same device token
    const existingByToken = await prisma.deviceSession.findFirst({
      where: { userId, deviceToken, revokedAt: null },
    })

    if (existingByToken) {
      await prisma.deviceSession.update({
        where: { id: existingByToken.id },
        data: { deviceName, lastActiveAt: new Date() },
      })
    } else {
      // Find the most recent active session without a device token
      const session = await prisma.deviceSession.findFirst({
        where: { userId, deviceToken: null, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      })

      if (session) {
        await prisma.deviceSession.update({
          where: { id: session.id },
          data: { deviceToken, deviceName, lastActiveAt: new Date() },
        })
      }
    }

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Device register error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to register device', 500)
  }
}
```

- [ ] **Step 2: Create device unregister endpoint**

Create `app/api/v1/devices/[token]/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'

type RouteParams = { params: Promise<{ token: string }> }

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { token } = await params
    const { userId } = auth.payload

    await prisma.deviceSession.updateMany({
      where: { userId, deviceToken: token, revokedAt: null },
      data: { deviceToken: null },
    })

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Device unregister error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to unregister device', 500)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/devices/
git commit -m "feat: add device management endpoints (register, unregister)"
```

---

### Task 9: Admin device session management

**Files:**
- Create: `app/actions/deviceSessions.ts`
- Modify: `app/admin/users/[id]/page.tsx` (add device sessions section)
- Create: `components/admin/DeviceSessionsList.tsx`

- [ ] **Step 1: Create server actions for device session management**

Create `app/actions/deviceSessions.ts`:

```typescript
'use server'

import { prisma } from '@/lib/prisma'
import { ensureAdmin } from './helpers'
import { revalidatePath } from 'next/cache'

export async function revokeDeviceSession(sessionId: string) {
  await ensureAdmin()

  await prisma.deviceSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  })

  revalidatePath('/admin/users')
}

export async function revokeAllDeviceSessions(userId: string) {
  await ensureAdmin()

  await prisma.deviceSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  revalidatePath('/admin/users')
}
```

- [ ] **Step 2: Create DeviceSessionsList component**

Create `components/admin/DeviceSessionsList.tsx`:

```tsx
'use client'

import { revokeDeviceSession, revokeAllDeviceSessions } from '@/app/actions/deviceSessions'

interface DeviceSession {
  id: string
  deviceName: string
  lastActiveAt: Date
  createdAt: Date
}

export function DeviceSessionsList({
  sessions,
  userId,
}: {
  sessions: DeviceSession[]
  userId: string
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-gray-500">No active device sessions.</p>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
        >
          <div>
            <p className="text-sm font-medium text-white">
              {session.deviceName}
            </p>
            <p className="text-xs text-gray-400">
              Last active:{' '}
              {new Date(session.lastActiveAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          </div>
          <button
            onClick={() => revokeDeviceSession(session.id)}
            className="text-xs text-red-400 hover:text-red-300 px-3 py-1 rounded border border-red-400/30 hover:border-red-400/60 transition-colors"
          >
            Revoke
          </button>
        </div>
      ))}
      {sessions.length > 1 && (
        <button
          onClick={() => revokeAllDeviceSessions(userId)}
          className="text-xs text-red-400 hover:text-red-300 mt-2"
        >
          Revoke All Sessions
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add device sessions section to admin user detail page**

Modify `app/admin/users/[id]/page.tsx`:

Add to the imports:
```typescript
import { DeviceSessionsList } from "@/components/admin/DeviceSessionsList"
```

Add a query for device sessions after the existing `availableProfiles` query:
```typescript
const deviceSessions = await prisma.deviceSession.findMany({
    where: { userId: id, revokedAt: null },
    select: { id: true, deviceName: true, lastActiveAt: true, createdAt: true },
    orderBy: { lastActiveAt: 'desc' },
})
```

Add this section in the JSX, between the user details card and the Danger Zone:
```tsx
<div className="mt-8 glass-card p-8 rounded-xl border border-white/10">
    <h2 className="text-xl font-bold text-white mb-4">Device Sessions</h2>
    <DeviceSessionsList sessions={deviceSessions} userId={id} />
</div>
```

- [ ] **Step 4: Commit**

```bash
git add app/actions/deviceSessions.ts components/admin/DeviceSessionsList.tsx app/admin/users/\[id\]/page.tsx
git commit -m "feat: add admin device session management UI"
```

---

### Task 10: Push notification infrastructure

**Files:**
- Create: `lib/api/pushNotifications.ts`
- Modify: `app/actions/tasks.ts:12-85` (add push trigger to createTask)

- [ ] **Step 1: Install APNs library**

Run:
```bash
npm install @parse/node-apn
```

Note: Requires APNs key (.p8 file) from Apple Developer account. Environment variables needed:
- `APNS_KEY_ID` — Key ID from Apple
- `APNS_TEAM_ID` — Apple Developer Team ID
- `APNS_KEY_PATH` — Path to .p8 key file
- `APNS_BUNDLE_ID` — iOS app bundle identifier

- [ ] **Step 2: Create push notification utility**

Create `lib/api/pushNotifications.ts`:

```typescript
import apn from '@parse/node-apn'

let provider: apn.Provider | null = null

function getProvider(): apn.Provider | null {
  if (provider) return provider

  const keyPath = process.env.APNS_KEY_PATH
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID

  if (!keyPath || !keyId || !teamId) {
    console.warn('APNs not configured — push notifications disabled')
    return null
  }

  provider = new apn.Provider({
    token: { key: keyPath, keyId, teamId },
    production: process.env.NODE_ENV === 'production',
  })

  return provider
}

export async function sendPushNotification(
  deviceTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
) {
  const apnProvider = getProvider()
  if (!apnProvider || deviceTokens.length === 0) return

  const bundleId = process.env.APNS_BUNDLE_ID
  if (!bundleId) return

  const notification = new apn.Notification()
  notification.alert = { title, body }
  notification.sound = 'default'
  notification.badge = 1
  notification.topic = bundleId
  if (data) notification.payload = data

  try {
    await apnProvider.send(notification, deviceTokens)
  } catch (error) {
    console.error('Push notification error:', error)
  }
}
```

- [ ] **Step 3: Add push notification trigger to createTask**

Modify `app/actions/tasks.ts`. After the transaction succeeds (after line 76), add:

```typescript
// Send push notifications to assigned users
if (userIds.length > 0) {
    import('@/lib/api/pushNotifications').then(async ({ sendPushNotification }) => {
        const sessions = await prisma.deviceSession.findMany({
            where: {
                userId: { in: userIds },
                deviceToken: { not: null },
                revokedAt: null,
            },
            select: { deviceToken: true },
        })
        const tokens = sessions
            .map((s) => s.deviceToken)
            .filter((t): t is string => t !== null)
        if (tokens.length > 0) {
            sendPushNotification(
                tokens,
                'myJournal',
                `New task: ${title}`,
                { type: 'task_assigned' }
            )
        }
    })
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/api/pushNotifications.ts app/actions/tasks.ts package.json package-lock.json
git commit -m "feat: add push notification infrastructure and task assignment trigger"
```

---

### Task 11: Streak protection cron job

**Files:**
- Create: `lib/api/streakCron.ts`
- Modify: `app/api/v1/cron/streak/route.ts` (HTTP-triggered cron)

- [ ] **Step 1: Create streak check logic**

Rather than running a persistent cron inside the Next.js process, create an API route that can be triggered by PM2 cron, a system cron, or any external scheduler.

Create `app/api/v1/cron/streak/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPushNotification } from '@/lib/api/pushNotifications'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'

export async function POST(request: NextRequest) {
  // Simple shared secret auth for cron endpoints
  const cronSecret = request.headers.get('x-cron-secret')
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return apiError('UNAUTHORIZED', 'Invalid cron secret', 401)
  }

  try {
    // Get all users with active device sessions
    const usersWithDevices = await prisma.user.findMany({
      where: {
        deviceSessions: {
          some: {
            deviceToken: { not: null },
            revokedAt: null,
          },
        },
      },
      select: {
        id: true,
        deviceSessions: {
          where: { deviceToken: { not: null }, revokedAt: null },
          select: { deviceToken: true },
        },
      },
    })

    for (const user of usersWithDevices) {
      // Check if user has entries today
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)

      const todayEntries = await prisma.journalEntry.count({
        where: {
          userId: user.id,
          createdAt: { gte: startOfDay },
        },
      })

      if (todayEntries > 0) continue

      // Check if user has an active streak > 1
      const recentEntries = await prisma.journalEntry.findMany({
        where: { userId: user.id },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      })

      const uniqueDays = new Set(
        recentEntries.map((e) =>
          e.createdAt.toISOString().split('T')[0]
        )
      )
      const sortedDays = Array.from(uniqueDays).sort().reverse()

      // Check yesterday
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().split('T')[0]

      if (!sortedDays.includes(yesterdayStr)) continue

      // Count consecutive days ending yesterday
      let streak = 1
      for (let i = 0; i < sortedDays.length - 1; i++) {
        const d1 = new Date(sortedDays[i])
        const d2 = new Date(sortedDays[i + 1])
        const diff = Math.round(
          (d1.getTime() - d2.getTime()) / (1000 * 3600 * 24)
        )
        if (diff === 1) streak++
        else break
      }

      if (streak > 1) {
        const tokens = user.deviceSessions
          .map((s) => s.deviceToken)
          .filter((t): t is string => t !== null)

        await sendPushNotification(
          tokens,
          'myJournal',
          `Don't break your ${streak}-day streak — take a minute to journal today.`,
          { type: 'streak_reminder' }
        )
      }
    }

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Streak cron error:', error)
    return apiError('INTERNAL_ERROR', 'Streak check failed', 500)
  }
}
```

- [ ] **Step 2: Set up cron trigger**

Add to PM2 ecosystem or system crontab. Example with curl in crontab (runs at 8pm daily):

```bash
0 20 * * * curl -X POST http://localhost:3000/api/v1/cron/streak -H "x-cron-secret: $CRON_SECRET"
```

Add `CRON_SECRET` to `.env`:
```
CRON_SECRET=your-random-secret-here
```

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/cron/
git commit -m "feat: add streak protection cron endpoint"
```

---

### Task 12: Environment variables and final integration

**Files:**
- Modify: `.env.example` or `.env` (add new env vars)

- [ ] **Step 1: Document required environment variables**

Add to `.env` (or `.env.example` if it exists):

```bash
# iOS API Auth
API_JWT_SECRET=generate-a-strong-random-secret-here

# APNs Push Notifications (iOS)
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_KEY_PATH=
APNS_BUNDLE_ID=

# Cron endpoint auth
CRON_SECRET=generate-a-random-secret-here
```

- [ ] **Step 2: Test full flow end-to-end**

Run the dev server and verify the complete flow:

```bash
npm run dev

# 1. Login
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"your-email","password":"your-password","deviceName":"Test"}' | jq .

# 2. Use the accessToken from step 1
export TOKEN="paste-access-token-here"

# 3. Get today's prompts
curl -s http://localhost:3000/api/v1/prompts/today \
  -H "Authorization: Bearer $TOKEN" | jq .

# 4. Get all prompts (offline cache)
curl -s http://localhost:3000/api/v1/prompts/all \
  -H "Authorization: Bearer $TOKEN" | jq .

# 5. Get entries for today
curl -s "http://localhost:3000/api/v1/entries?date=$(date +%Y-%m-%d)" \
  -H "Authorization: Bearer $TOKEN" | jq .

# 6. Submit an entry
curl -s -X POST http://localhost:3000/api/v1/entries \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"promptId":"some-prompt-id","answer":"Test answer","date":"'$(date +%Y-%m-%d)'"}' | jq .

# 7. Get tasks
curl -s http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer $TOKEN" | jq .

# 8. Get stats
curl -s http://localhost:3000/api/v1/stats \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Timezone: America/Chicago" | jq .

# 9. Refresh token
curl -s -X POST http://localhost:3000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"paste-refresh-token"}' | jq .

# 10. Logout
curl -s -X POST http://localhost:3000/api/v1/auth/logout \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"paste-refresh-token"}' | jq .
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add environment variables for iOS API"
```
