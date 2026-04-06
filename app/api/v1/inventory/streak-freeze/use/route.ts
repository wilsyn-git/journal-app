import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { STREAK_FREEZE, STREAK_SHIELD } from '@/lib/inventory'

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

    const operations = []

    if (freezesCost > 0) {
      const inv = await prisma.userInventory.findUnique({
        where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
      })
      if (!inv || inv.quantity < freezesCost) {
        return apiError('BAD_REQUEST', 'Not enough streak freezes', 400)
      }
      operations.push(
        prisma.userInventory.update({
          where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
          data: { quantity: { decrement: freezesCost }, metadata: JSON.stringify({ earningCounter: 0 }) },
        })
      )
    }

    if (shieldsCost > 0) {
      const inv = await prisma.userInventory.findUnique({
        where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
      })
      if (!inv || inv.quantity < shieldsCost) {
        return apiError('BAD_REQUEST', 'Not enough streak shields', 400)
      }
      operations.push(
        prisma.userInventory.update({
          where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
          data: { quantity: { decrement: shieldsCost }, metadata: JSON.stringify({ earningCounter: 0 }) },
        })
      )
    }

    operations.push(
      ...missedDays.map((frozenDate) =>
        prisma.streakFreezeUsage.create({ data: { userId, frozenDate } })
      )
    )

    await prisma.$transaction(operations)

    return apiSuccess({ success: true, freezesUsed: freezesCost, shieldsUsed: shieldsCost })
  } catch (error) {
    console.error('Use streak recovery error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to apply streak recovery', 500)
  }
}
