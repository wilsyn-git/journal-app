import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { resolveApiTimezone } from '@/lib/timezone'
import { getInventory } from '@/app/lib/inventoryData'
import { getAchievementState } from '@/lib/achievementEvaluator'
import { getUserStats } from '@/app/lib/analytics'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload
    const timezone = await resolveApiTimezone(request, userId)

    const [stats, inventory] = await Promise.all([
      getUserStats(userId, timezone),
      getInventory(userId),
    ])

    const achievements = await getAchievementState(userId, stats.achievementMetrics)

    return apiSuccess({
      currentStreak: stats.currentStreak,
      maxStreak: stats.maxStreak,
      totalEntries: stats.totalEntries,
      daysCompleted: stats.daysCompleted,
      avgWords: stats.avgWords,
      heatmap: stats.heatmap,
      achievements,
      taskStats: stats.taskStats,
      freezes: {
        count: inventory.freezeCount,
        earningProgress: inventory.earningCounter,
        earningTarget: inventory.earningInterval,
      },
      shields: {
        count: inventory.shieldCount,
        earningProgress: inventory.shieldEarningCounter,
        earningTarget: inventory.shieldEarningInterval,
      },
    })
  } catch (error) {
    console.error('Stats error:', error)
    return apiError('INTERNAL_ERROR', 'Failed to compute stats', 500)
  }
}
