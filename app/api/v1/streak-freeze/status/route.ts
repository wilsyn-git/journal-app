import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { resolveApiTimezone, getTodayForUser } from '@/lib/timezone'
import { getInventory, getFrozenDates } from '@/app/lib/inventoryData'
import { detectRecoverableStreak } from '@/lib/streakRecovery'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload
    const timezone = await resolveApiTimezone(request, userId)

    const [entries, inventory, frozenDates] = await Promise.all([
      prisma.journalEntry.findMany({
        where: { userId },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      getInventory(userId),
      getFrozenDates(userId),
    ])

    const uniqueDays = new Set(
      entries.map((e) =>
        new Date(e.createdAt).toLocaleDateString('en-CA', { timeZone: timezone })
      )
    )
    const sortedDays = Array.from(uniqueDays).sort().reverse()
    const todayStr = getTodayForUser(timezone)

    const status = detectRecoverableStreak(
      sortedDays,
      todayStr,
      inventory.freezeCount,
      inventory.shieldCount,
      new Set(frozenDates)
    )

    return apiSuccess(status)
  } catch (error) {
    console.error('Streak freeze status error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to check streak freeze status', 500)
  }
}
