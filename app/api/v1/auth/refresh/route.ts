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
