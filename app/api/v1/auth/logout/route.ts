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
