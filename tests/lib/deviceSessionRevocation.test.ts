import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signAccessToken } from '@/lib/api/jwt'

// All modules under test import the same prisma client; mock the bits each path
// touches so we can drive behavior without a database (mirrors the
// constantTimeAuth test pattern).
const deviceSessionFindUnique = vi.fn()
const deviceSessionCreate = vi.fn()
const deviceSessionUpdate = vi.fn()
const deviceSessionUpdateMany = vi.fn()
const userFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    deviceSession: {
      findUnique: (...args: unknown[]) => deviceSessionFindUnique(...args),
      create: (...args: unknown[]) => deviceSessionCreate(...args),
      update: (...args: unknown[]) => deviceSessionUpdate(...args),
      updateMany: (...args: unknown[]) => deviceSessionUpdateMany(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
    },
  },
}))

function bearerRequest(token: string) {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? `Bearer ${token}` : null) },
  }
}

describe('authenticateRequest: session revocation enforcement (#64)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('rejects a token whose session has been revoked (401)', async () => {
    deviceSessionFindUnique.mockResolvedValue({ revokedAt: new Date() })
    const token = await signAccessToken({ userId: 'u1', orgId: 'o1', sessionId: 's1' })

    const { authenticateRequest } = await import('@/lib/api/apiAuth')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await authenticateRequest(bearerRequest(token) as any)

    expect('error' in result && result.status).toBe(401)
    expect('error' in result && result.error).toBe('Session revoked')
    expect(deviceSessionFindUnique).toHaveBeenCalledWith({
      where: { id: 's1' },
      select: { revokedAt: true },
    })
  })

  it('rejects a token whose session no longer exists (401)', async () => {
    deviceSessionFindUnique.mockResolvedValue(null)
    const token = await signAccessToken({ userId: 'u1', orgId: 'o1', sessionId: 'gone' })

    const { authenticateRequest } = await import('@/lib/api/apiAuth')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await authenticateRequest(bearerRequest(token) as any)

    expect('error' in result && result.status).toBe(401)
    expect('error' in result && result.error).toBe('Session revoked')
  })

  it('passes a token whose session is active', async () => {
    deviceSessionFindUnique.mockResolvedValue({ revokedAt: null })
    const token = await signAccessToken({ userId: 'u1', orgId: 'o1', sessionId: 's1' })

    const { authenticateRequest } = await import('@/lib/api/apiAuth')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await authenticateRequest(bearerRequest(token) as any)

    expect('payload' in result).toBe(true)
    if ('payload' in result) {
      expect(result.payload.userId).toBe('u1')
      expect(result.payload.orgId).toBe('o1')
      expect(result.payload.sessionId).toBe('s1')
    }
  })

  it('passes a legacy token without a sessionId without hitting the DB', async () => {
    // Legacy token: no sessionId claim. Allowed during the one-time migration
    // window; it expires within the 1h TTL.
    const token = await signAccessToken({ userId: 'u1', orgId: 'o1' })

    const { authenticateRequest } = await import('@/lib/api/apiAuth')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await authenticateRequest(bearerRequest(token) as any)

    expect('payload' in result).toBe(true)
    expect(deviceSessionFindUnique).not.toHaveBeenCalled()
  })

  it('rejects a malformed/garbage token (401) without a DB lookup', async () => {
    const { authenticateRequest } = await import('@/lib/api/apiAuth')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await authenticateRequest(bearerRequest('not-a-jwt') as any)

    expect('error' in result && result.status).toBe(401)
    expect('error' in result && result.error).toBe('Invalid or expired token')
    expect(deviceSessionFindUnique).not.toHaveBeenCalled()
  })

  it('rejects a request with no Authorization header (401)', async () => {
    const { authenticateRequest } = await import('@/lib/api/apiAuth')
    const req = { headers: { get: () => null } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await authenticateRequest(req as any)
    expect('error' in result && result.status).toBe(401)
  })
})

describe('jwt: sessionId round-trips through sign/verify', () => {
  it('embeds and recovers sessionId', async () => {
    const { verifyAccessToken } = await import('@/lib/api/jwt')
    const token = await signAccessToken({ userId: 'u1', orgId: 'o1', sessionId: 'abc' })
    const payload = await verifyAccessToken(token)
    expect(payload.sessionId).toBe('abc')
  })

  it('leaves sessionId undefined when not provided', async () => {
    const { verifyAccessToken } = await import('@/lib/api/jwt')
    const token = await signAccessToken({ userId: 'u1', orgId: 'o1' })
    const payload = await verifyAccessToken(token)
    expect(payload.sessionId).toBeUndefined()
  })
})

describe('login route embeds sessionId from the created session (#64)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('creates the session, then signs a token bound to its id', async () => {
    userFindUnique.mockResolvedValue({
      id: 'u1',
      email: 'real@example.com',
      name: 'Real',
      organizationId: 'o1',
      // bcrypt hash of "correct-horse"; we only need compare to resolve true,
      // so we stub bcrypt below instead of relying on a real hash.
      password: 'hashed',
    })
    deviceSessionCreate.mockResolvedValue({ id: 'newsession123' })

    const bcrypt = (await import('bcryptjs')).default
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)

    const { POST } = await import('@/app/api/v1/auth/login/route')
    const req = new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'real@example.com', password: 'whatever', deviceName: 'phone' }),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)
    expect(res.status).toBe(200)

    // Session was created before the token was signed.
    expect(deviceSessionCreate).toHaveBeenCalledTimes(1)

    const body = await res.json()
    const { verifyAccessToken } = await import('@/lib/api/jwt')
    const payload = await verifyAccessToken(body.accessToken)
    expect(payload.sessionId).toBe('newsession123')
    expect(payload.userId).toBe('u1')
  })
})

describe('refresh route embeds sessionId on the rotated token (#64)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('binds the new access token to the existing session id', async () => {
    deviceSessionFindUnique.mockResolvedValue({
      id: 'sess-existing',
      revokedAt: null,
      createdAt: new Date(),
      user: { id: 'u1', organizationId: 'o1' },
    })
    deviceSessionUpdate.mockResolvedValue({})

    const { POST } = await import('@/app/api/v1/auth/refresh/route')
    const req = new Request('http://localhost/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'raw-refresh-token' }),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)
    expect(res.status).toBe(200)

    const body = await res.json()
    const { verifyAccessToken } = await import('@/lib/api/jwt')
    const payload = await verifyAccessToken(body.accessToken)
    expect(payload.sessionId).toBe('sess-existing')
  })
})

describe('device DELETE route revokes the session (#64)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('sets revokedAt (and clears the push token) for the matched device', async () => {
    deviceSessionFindUnique.mockResolvedValue({ revokedAt: null }) // for authenticateRequest
    deviceSessionUpdateMany.mockResolvedValue({ count: 1 })

    const token = await signAccessToken({ userId: 'u1', orgId: 'o1', sessionId: 's1' })

    const { DELETE } = await import('@/app/api/v1/devices/[token]/route')
    const req = bearerRequest(token)
    const res = await DELETE(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      req as any,
      { params: Promise.resolve({ token: 'push-token-xyz' }) }
    )
    expect(res.status).toBe(200)

    expect(deviceSessionUpdateMany).toHaveBeenCalledTimes(1)
    const call = deviceSessionUpdateMany.mock.calls[0][0]
    expect(call.where).toMatchObject({ userId: 'u1', deviceToken: 'push-token-xyz', revokedAt: null })
    expect(call.data.revokedAt).toBeInstanceOf(Date)
    expect(call.data.deviceToken).toBeNull()
  })
})
