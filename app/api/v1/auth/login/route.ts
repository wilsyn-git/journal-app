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
