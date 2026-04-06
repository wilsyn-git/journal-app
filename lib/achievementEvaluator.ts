import { prisma } from '@/lib/prisma'
import { ACHIEVEMENT_REGISTRY, AchievementReward } from '@/lib/achievements'

export type AchievementMetrics = {
  maxStreak: number
  totalDaysJournaled: number
  totalEntries: number
  lateNightEntries: number
}

export type NewlyEarnedAchievement = {
  achievementId: string
  name: string
  icon: string
  tierLevel: number
  label: string
  reward: AchievementReward | null
}

/**
 * Evaluates all achievements for a user. Grants new tiers and rewards.
 * Returns list of newly earned achievements (for toast notifications).
 */
export async function evaluateAchievements(
  userId: string,
  metrics: AchievementMetrics
): Promise<NewlyEarnedAchievement[]> {
  // Load existing achievements for this user
  const existing = await prisma.userAchievement.findMany({
    where: { userId },
    select: { achievementId: true, tierLevel: true },
  })

  const earnedSet = new Set(
    existing.map((a) => `${a.achievementId}:${a.tierLevel}`)
  )

  const newlyEarned: NewlyEarnedAchievement[] = []

  for (const achievement of ACHIEVEMENT_REGISTRY) {
    const metricValue = metrics[achievement.metric as keyof AchievementMetrics]
    if (metricValue === undefined) continue

    for (const tier of achievement.tiers) {
      const key = `${achievement.id}:${tier.level}`
      if (earnedSet.has(key)) continue
      if (metricValue < tier.threshold) break // Tiers are ordered — if this one fails, higher ones will too

      // Earn this tier
      const rewardSnapshot = tier.reward ? JSON.stringify(tier.reward) : null

      await prisma.userAchievement.create({
        data: {
          userId,
          achievementId: achievement.id,
          tierLevel: tier.level,
          rewardGranted: rewardSnapshot,
        },
      })

      // Grant inventory reward
      if (tier.reward) {
        await prisma.userInventory.upsert({
          where: {
            userId_itemType: { userId, itemType: tier.reward.itemType },
          },
          create: {
            userId,
            itemType: tier.reward.itemType,
            quantity: tier.reward.quantity,
            metadata: JSON.stringify({ earningCounter: 0 }),
          },
          update: {
            quantity: { increment: tier.reward.quantity },
          },
        })
      }

      newlyEarned.push({
        achievementId: achievement.id,
        name: achievement.name,
        icon: achievement.icon,
        tierLevel: tier.level,
        label: tier.label,
        reward: tier.reward,
      })
    }
  }

  return newlyEarned
}

/**
 * Returns the user's achievement state for display: current tier, next tier, metric value.
 */
export async function getAchievementState(userId: string, metrics: AchievementMetrics) {
  const existing = await prisma.userAchievement.findMany({
    where: { userId },
    select: { achievementId: true, tierLevel: true },
  })

  const earnedMap = new Map<string, number>() // achievementId -> highest tier earned
  for (const a of existing) {
    const current = earnedMap.get(a.achievementId) ?? 0
    if (a.tierLevel > current) earnedMap.set(a.achievementId, a.tierLevel)
  }

  return ACHIEVEMENT_REGISTRY.map((achievement) => {
    const metricValue = metrics[achievement.metric as keyof AchievementMetrics] ?? 0
    const highestTier = earnedMap.get(achievement.id) ?? 0
    const currentTier = achievement.tiers.find((t) => t.level === highestTier) ?? null
    const nextTier = achievement.tiers.find((t) => t.level === highestTier + 1) ?? null
    const maxTier = achievement.tiers[achievement.tiers.length - 1]
    const isMaxed = highestTier >= maxTier.level

    return {
      id: achievement.id,
      name: achievement.name,
      icon: achievement.icon,
      currentTier: highestTier,
      currentLabel: currentTier?.label ?? null,
      nextTier: nextTier
        ? { level: nextTier.level, threshold: nextTier.threshold, label: nextTier.label }
        : null,
      metricValue,
      isMaxed,
    }
  })
}

/**
 * Returns unnotified achievements and marks them as notified.
 */
export async function getAndMarkUnnotifiedAchievements(userId: string) {
  const unnotified = await prisma.userAchievement.findMany({
    where: { userId, notifiedAt: null },
    select: { id: true, achievementId: true, tierLevel: true },
  })

  if (unnotified.length > 0) {
    await prisma.userAchievement.updateMany({
      where: { id: { in: unnotified.map((a) => a.id) } },
      data: { notifiedAt: new Date() },
    })
  }

  // Enrich with registry data for display
  return unnotified.map((a) => {
    const def = ACHIEVEMENT_REGISTRY.find((d) => d.id === a.achievementId)
    const tier = def?.tiers.find((t) => t.level === a.tierLevel)
    return {
      achievementId: a.achievementId,
      name: def?.name ?? a.achievementId,
      icon: def?.icon ?? '🏆',
      tierLevel: a.tierLevel,
      label: tier?.label ?? `Tier ${a.tierLevel}`,
    }
  })
}
