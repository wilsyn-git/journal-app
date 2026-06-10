import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { DUMMY_PASSWORD_HASH } from '@/lib/api/constantTimeAuth'

// --- Mocks shared across the login-path tests -------------------------------
// Both login paths import the same prisma client; mock findUnique so we can
// simulate "no such user" without a database.
const findUnique = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}))
vi.mock('./lib/prisma', () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}))

describe('DUMMY_PASSWORD_HASH', () => {
  it('is a valid cost-10 bcryptjs hash', () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$10\$/)
  })

  it('does not match plausible real-user passwords', async () => {
    // The hash is of the fixed seed 'not-a-real-password'; it must never match
    // anything a real user would actually type.
    expect(await bcrypt.compare('password123', DUMMY_PASSWORD_HASH)).toBe(false)
    expect(await bcrypt.compare('hunter2', DUMMY_PASSWORD_HASH)).toBe(false)
    expect(await bcrypt.compare('', DUMMY_PASSWORD_HASH)).toBe(false)
  })
})

describe('constant-time login: API route POST', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })
  afterEach(() => vi.restoreAllMocks())

  it('still runs bcrypt.compare when the user is not found and returns 401', async () => {
    findUnique.mockResolvedValue(null)
    const compareSpy = vi.spyOn(bcrypt, 'compare')

    const { POST } = await import('@/app/api/v1/auth/login/route')
    const req = new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ghost@example.com', password: 'whatever', deviceName: 'phone' }),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any)

    expect(compareSpy).toHaveBeenCalledTimes(1)
    expect(compareSpy).toHaveBeenCalledWith('whatever', DUMMY_PASSWORD_HASH)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.error.message).toBe('Invalid credentials')
  })

  it('produces the same 401 failure for an unknown user and a wrong password', async () => {
    const compareSpy = vi.spyOn(bcrypt, 'compare')
    const { POST } = await import('@/app/api/v1/auth/login/route')

    const makeReq = (email: string) =>
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrongpass', deviceName: 'phone' }),
      })

    // Unknown user
    findUnique.mockResolvedValueOnce(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resUnknown = await POST(makeReq('ghost@example.com') as any)

    // Known user, wrong password
    findUnique.mockResolvedValueOnce({
      id: 'u1', email: 'real@example.com', name: 'Real',
      organizationId: 'o1', password: DUMMY_PASSWORD_HASH,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resWrong = await POST(makeReq('real@example.com') as any)

    expect(resUnknown.status).toBe(resWrong.status)
    expect(await resUnknown.json()).toEqual(await resWrong.json())
    // bcrypt.compare ran for both attempts
    expect(compareSpy).toHaveBeenCalledTimes(2)
  })
})

describe('constant-time login: NextAuth authorize()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })
  afterEach(() => vi.restoreAllMocks())

  // Extract the authorize() function from the Credentials provider config.
  async function getAuthorize() {
    const credentialsSpy = vi.fn((cfg: { authorize: (c: unknown) => Promise<unknown> }) => cfg)
    vi.doMock('next-auth/providers/credentials', () => ({ default: credentialsSpy }))
    vi.doMock('next-auth', () => ({
      default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
    }))
    vi.doMock('./auth.config', () => ({ authConfig: {} }))
    await import('@/auth')
    return credentialsSpy.mock.calls[0][0].authorize
  }

  it('still runs bcrypt.compare when the user is not found and returns null', async () => {
    findUnique.mockResolvedValue(null)
    const compareSpy = vi.spyOn(bcrypt, 'compare')

    const authorize = await getAuthorize()
    const result = await authorize({ email: 'ghost@example.com', password: 'whatever' })

    expect(compareSpy).toHaveBeenCalledTimes(1)
    expect(compareSpy).toHaveBeenCalledWith('whatever', DUMMY_PASSWORD_HASH)
    expect(result).toBeNull()
  })

  it('returns null for both an unknown user and a wrong password', async () => {
    const compareSpy = vi.spyOn(bcrypt, 'compare')
    const authorize = await getAuthorize()

    findUnique.mockResolvedValueOnce(null)
    const resUnknown = await authorize({ email: 'ghost@example.com', password: 'wrongpass' })

    findUnique.mockResolvedValueOnce({
      id: 'u1', email: 'real@example.com', password: DUMMY_PASSWORD_HASH,
    })
    const resWrong = await authorize({ email: 'real@example.com', password: 'wrongpass' })

    expect(resUnknown).toBeNull()
    expect(resWrong).toBeNull()
    expect(compareSpy).toHaveBeenCalledTimes(2)
  })
})
