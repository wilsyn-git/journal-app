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
