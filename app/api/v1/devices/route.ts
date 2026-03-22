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

    const existingByToken = await prisma.deviceSession.findFirst({
      where: { userId, deviceToken, revokedAt: null },
    })

    if (existingByToken) {
      await prisma.deviceSession.update({
        where: { id: existingByToken.id },
        data: { deviceName, lastActiveAt: new Date() },
      })
    } else {
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
