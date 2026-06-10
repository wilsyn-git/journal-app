import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { evaluateAchievements, getAndMarkUnnotifiedAchievements } from '@/lib/achievementEvaluator'
import { ACHIEVEMENT_REGISTRY } from '@/lib/achievements'

// Build a metrics object that exactly crosses the first tier of the first achievement.
function metricsCrossing(ach: typeof ACHIEVEMENT_REGISTRY[number], threshold: number) {
  const m = { maxStreak: 0, totalDaysJournaled: 0, totalEntries: 0, lateNightEntries: 0 }
  ;(m as Record<string, number>)[ach.metric] = threshold
  return m
}

describe('evaluateAchievements', () => {
  let db: TestDb
  beforeAll(() => { db = createTestDb() })
  afterAll(async () => { await db.cleanup() })

  it('grants a newly-earned tier and persists the row', async () => {
    const { user } = await createUserFixture(db.prisma)
    const ach = ACHIEVEMENT_REGISTRY[0]
    const tier = ach.tiers[0]

    const earned = await evaluateAchievements(db.prisma, user.id, metricsCrossing(ach, tier.threshold))

    expect(earned.some((e) => e.achievementId === ach.id && e.tierLevel === tier.level)).toBe(true)
    const row = await db.prisma.userAchievement.findFirst({
      where: { userId: user.id, achievementId: ach.id, tierLevel: tier.level },
    })
    expect(row).not.toBeNull()
  })

  it('is idempotent — a second eval with the same metrics grants nothing new', async () => {
    const { user } = await createUserFixture(db.prisma)
    const ach = ACHIEVEMENT_REGISTRY[0]
    const tier = ach.tiers[0]
    const metrics = metricsCrossing(ach, tier.threshold)

    await evaluateAchievements(db.prisma, user.id, metrics)
    const second = await evaluateAchievements(db.prisma, user.id, metrics)

    expect(second).toEqual([])
    const count = await db.prisma.userAchievement.count({
      where: { userId: user.id, achievementId: ach.id, tierLevel: tier.level },
    })
    expect(count).toBe(1)
  })

  it('getAndMarkUnnotifiedAchievements returns then marks new tiers', async () => {
    const { user } = await createUserFixture(db.prisma)
    const ach = ACHIEVEMENT_REGISTRY[0]
    const tier = ach.tiers[0]
    await evaluateAchievements(db.prisma, user.id, metricsCrossing(ach, tier.threshold))

    const first = await getAndMarkUnnotifiedAchievements(db.prisma, user.id)
    expect(first.some((a) => a.achievementId === ach.id)).toBe(true)

    const second = await getAndMarkUnnotifiedAchievements(db.prisma, user.id)
    expect(second).toEqual([]) // already marked notifiedAt
  })
})
