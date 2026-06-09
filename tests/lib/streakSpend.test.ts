import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { spendStreakRecovery } from '@/lib/streakSpend'
import { STREAK_FREEZE, STREAK_SHIELD } from '@/lib/inventory'

async function seedInventory(db: TestDb, userId: string, itemType: string, quantity: number, metadata = JSON.stringify({ earningCounter: 5 })) {
  await db.prisma.userInventory.create({
    data: { userId, itemType, quantity, metadata },
  })
}

async function getInventory(db: TestDb, userId: string, itemType: string) {
  return db.prisma.userInventory.findUnique({
    where: { userId_itemType: { userId, itemType } },
  })
}

async function getQuantity(db: TestDb, userId: string, itemType: string) {
  const row = await getInventory(db, userId, itemType)
  return row?.quantity ?? null
}

describe('spendStreakRecovery', () => {
  let db: TestDb
  beforeAll(() => { db = createTestDb() })
  afterAll(async () => { await db.cleanup() })

  it('rejects when costs do not match the number of missed days', async () => {
    const { user } = await createUserFixture(db.prisma)
    const result = await spendStreakRecovery(db.prisma, user.id, ['2026-06-01'], 2, 0)
    expect(result).toEqual({ error: 'Cost mismatch' })
  })

  it('rejects malformed date keys', async () => {
    const { user } = await createUserFixture(db.prisma)
    const result = await spendStreakRecovery(db.prisma, user.id, ['06/01/2026'], 1, 0)
    expect(result).toEqual({ error: 'Invalid date format' })
  })

  it('decrements inventory and records frozen days on success', async () => {
    const { user } = await createUserFixture(db.prisma)
    await seedInventory(db, user.id, STREAK_FREEZE.itemType, 3)
    await seedInventory(db, user.id, STREAK_SHIELD.itemType, 2)

    const result = await spendStreakRecovery(
      db.prisma, user.id, ['2026-06-01', '2026-06-02', '2026-06-03'], 2, 1
    )

    expect(result).toEqual({ success: true, freezesUsed: 2, shieldsUsed: 1 })
    expect(await getQuantity(db, user.id, STREAK_FREEZE.itemType)).toBe(1)
    expect(await getQuantity(db, user.id, STREAK_SHIELD.itemType)).toBe(1)
    const usages = await db.prisma.streakFreezeUsage.findMany({ where: { userId: user.id } })
    expect(usages.map((u) => u.frozenDate).sort()).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })

  it('preserves inventory metadata (earningCounter and lastEarnedDay) across a spend', async () => {
    const { user } = await createUserFixture(db.prisma)
    await seedInventory(db, user.id, STREAK_FREEZE.itemType, 2, JSON.stringify({ earningCounter: 7, lastEarnedDay: '2026-06-09' }))

    const result = await spendStreakRecovery(db.prisma, user.id, ['2026-06-01'], 1, 0)

    expect(result).toEqual({ success: true, freezesUsed: 1, shieldsUsed: 0 })
    const freeze = await getInventory(db, user.id, STREAK_FREEZE.itemType)
    expect(freeze!.quantity).toBe(1)
    // Spend must NOT wipe earning metadata (would re-open the double-earn window)
    expect(JSON.parse(freeze!.metadata!)).toEqual({ earningCounter: 7, lastEarnedDay: '2026-06-09' })
  })

  it('rolls back the freeze decrement when shields are insufficient', async () => {
    const { user } = await createUserFixture(db.prisma)
    await seedInventory(db, user.id, STREAK_FREEZE.itemType, 2)
    // no shield inventory row at all
    const result = await spendStreakRecovery(
      db.prisma, user.id, ['2026-06-01', '2026-06-02', '2026-06-03'], 2, 1
    )
    expect(result).toEqual({ error: 'Not enough streak shields' })
    // Transaction rolled back: freezes untouched, no usage rows
    expect(await getQuantity(db, user.id, STREAK_FREEZE.itemType)).toBe(2)
    expect(await db.prisma.streakFreezeUsage.count({ where: { userId: user.id } })).toBe(0)
  })

  it('never overdrafts: a second spend against an emptied balance fails', async () => {
    const { user } = await createUserFixture(db.prisma)
    await seedInventory(db, user.id, STREAK_FREEZE.itemType, 1)
    const first = await spendStreakRecovery(db.prisma, user.id, ['2026-05-01'], 1, 0)
    const second = await spendStreakRecovery(db.prisma, user.id, ['2026-05-02'], 1, 0)
    expect(first).toEqual({ success: true, freezesUsed: 1, shieldsUsed: 0 })
    expect(second).toEqual({ error: 'Not enough streak freezes' })
    expect(await getQuantity(db, user.id, STREAK_FREEZE.itemType)).toBe(0)
  })
})
