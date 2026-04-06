import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { STREAK_FREEZE } from '@/lib/inventory'

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload
    const body = await request.json()
    const missedDays: string[] = body.missedDays

    if (!Array.isArray(missedDays) || missedDays.length === 0) {
      return apiError('BAD_REQUEST', 'missedDays must be a non-empty array of date strings', 400)
    }

    // Validate date format
    for (const day of missedDays) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return apiError('BAD_REQUEST', `Invalid date format: ${day}. Expected YYYY-MM-DD`, 400)
      }
    }

    const inventory = await prisma.userInventory.findUnique({
      where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
    })

    if (!inventory || inventory.quantity < missedDays.length) {
      return apiError('BAD_REQUEST', 'Not enough streak freezes', 400)
    }

    await prisma.$transaction([
      prisma.userInventory.update({
        where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
        data: {
          quantity: { decrement: missedDays.length },
          metadata: JSON.stringify({ earningCounter: 0 }),
        },
      }),
      ...missedDays.map((frozenDate) =>
        prisma.streakFreezeUsage.create({
          data: { userId, frozenDate },
        })
      ),
    ])

    return apiSuccess({ success: true, freezesUsed: missedDays.length })
  } catch (error) {
    console.error('Use streak freeze error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to apply streak freeze', 500)
  }
}
