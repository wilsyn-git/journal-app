import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { spendStreakRecovery } from '@/lib/streakSpend'

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload
    const body = await request.json()
    const missedDays: string[] = body.missedDays
    const freezesCost: number = body.freezesCost ?? missedDays?.length ?? 0
    const shieldsCost: number = body.shieldsCost ?? 0

    if (!Array.isArray(missedDays) || missedDays.length === 0) {
      return apiError('BAD_REQUEST', 'missedDays must be a non-empty array of date strings', 400)
    }

    if (freezesCost + shieldsCost !== missedDays.length) {
      return apiError('BAD_REQUEST', 'freezesCost + shieldsCost must equal missedDays.length', 400)
    }

    for (const day of missedDays) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return apiError('BAD_REQUEST', `Invalid date format: ${day}. Expected YYYY-MM-DD`, 400)
      }
    }

    const result = await spendStreakRecovery(prisma, userId, missedDays, freezesCost, shieldsCost)

    if ('error' in result) {
      return apiError('BAD_REQUEST', result.error, 400)
    }

    return apiSuccess({ success: true, freezesUsed: result.freezesUsed, shieldsUsed: result.shieldsUsed })
  } catch (error) {
    console.error('Use streak recovery error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to apply streak recovery', 500)
  }
}
