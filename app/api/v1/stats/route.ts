import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/apiAuth'
import { apiSuccess, apiError } from '@/lib/api/apiResponse'
import { prisma } from '@/lib/prisma'
import { getUserTimezoneById } from '@/lib/timezone'
import { calculateStreaks } from '@/lib/streaks'
import { getInventory, getFrozenDates } from '@/app/lib/inventoryData'
import { getAchievementState, AchievementMetrics } from '@/lib/achievementEvaluator'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if ('error' in auth) return apiError('UNAUTHORIZED', auth.error, auth.status)

  try {
    const { userId } = auth.payload
    const [inventory, frozenDates] = await Promise.all([
      getInventory(userId),
      getFrozenDates(userId),
    ])
    const frozenSet = new Set(frozenDates)

    const timezone = request.headers.get('x-timezone')
      || await getUserTimezoneById(userId)

    const entries = await prisma.journalEntry.findMany({
      where: { userId },
      select: {
        createdAt: true,
        answer: true,
        prompt: { select: { id: true, type: true, content: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })

    // Day stats for heatmap
    const dayStats: Record<string, { words: number; entries: number }> = {}
    const hourCounts: number[] = new Array(24).fill(0)

    entries.forEach((e) => {
      const date = new Date(e.createdAt)
      const dayStr = date.toLocaleDateString('en-CA', { timeZone: timezone })
      const hourStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone,
      })
      const hour = parseInt(hourStr) % 24
      if (!isNaN(hour)) hourCounts[hour]++

      if (e.prompt.type === 'TEXT') {
        const words = e.answer
          .toLowerCase()
          .replace(/[\u2018\u2019]/g, "'")
          .split(/[^a-z0-9']+/)
          .filter((w) => w.length > 0)

        if (!dayStats[dayStr]) dayStats[dayStr] = { words: 0, entries: 0 }
        dayStats[dayStr].words += words.length
        dayStats[dayStr].entries += 1
      }
    })

    const heatmap: Record<string, number> = {}
    Object.entries(dayStats).forEach(([date, stats]) => {
      if (stats.entries > 0) {
        heatmap[date] = Math.round(stats.words / stats.entries)
      }
    })

    // Streaks
    const sortedDays = Object.keys(heatmap).sort().reverse()
    const { current, max } = calculateStreaks(sortedDays, todayStr, frozenSet)

    // Avg words
    const textEntries = entries.filter((e) => e.prompt.type === 'TEXT')
    let totalWords = 0
    textEntries.forEach((e) => (totalWords += e.answer.trim().split(/\s+/).length))
    const avgWords = textEntries.length > 0 ? Math.round(totalWords / textEntries.length) : 0

    // Achievement metrics
    const lateNightEntries = hourCounts[22] + hourCounts[23]
    const achievementMetrics: AchievementMetrics = {
      maxStreak: current,
      totalDaysJournaled: new Set(Object.keys(heatmap)).size,
      totalEntries: entries.length,
      lateNightEntries,
    }

    const achievements = await getAchievementState(userId, achievementMetrics)

    // Habit stats (CHECKBOX/RADIO)
    const taskMap = new Map<string, { prompt: string; days: Set<string> }>()

    entries.forEach((e) => {
      if (['CHECKBOX', 'RADIO'].includes(e.prompt.type)) {
        if (!taskMap.has(e.prompt.id)) {
          taskMap.set(e.prompt.id, { prompt: e.prompt.content, days: new Set() })
        }
        taskMap
          .get(e.prompt.id)!
          .days.add(new Date(e.createdAt).toLocaleDateString('en-CA', { timeZone: timezone }))
      }
    })

    const taskStats = []
    for (const [id, data] of taskMap.entries()) {
      const days = Array.from(data.days).sort().reverse()
      const streaks = calculateStreaks(days, todayStr)
      taskStats.push({
        id,
        content: data.prompt,
        currentStreak: streaks.current,
        maxStreak: streaks.max,
        count: days.length,
      })
    }

    return apiSuccess({
      currentStreak: current,
      maxStreak: max,
      totalEntries: entries.length,
      daysCompleted: new Set(Object.keys(heatmap)).size,
      avgWords,
      heatmap,
      achievements,
      taskStats,
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
