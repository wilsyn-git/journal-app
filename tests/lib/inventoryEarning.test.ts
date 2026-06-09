import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { processFirstEntryEarning } from '@/lib/inventoryEarning'
import { STREAK_FREEZE, STREAK_SHIELD } from '@/lib/inventory'

function dayRange() {
  return {
    start: new Date(Date.now() - 60 * 60 * 1000),
    end: new Date(Date.now() + 60 * 60 * 1000),
  }
}

async function getInventory(db: TestDb, userId: string, itemType: string) {
  return db.prisma.userInventory.findUnique({
    where: { userId_itemType: { userId, itemType } },
  })
}

describe('processFirstEntryEarning', () => {
  let db: TestDb

  beforeAll(() => {
    db = createTestDb()
  })

  afterAll(async () => {
    await db.cleanup()
  })

  it('increments both counters to 1 on the first entry of the day', async () => {
    const { user, prompt } = await createUserFixture(db.prisma)
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: prompt.id, answer: 'hello' },
    })

    const earned = await processFirstEntryEarning(db.prisma, user.id, 1, dayRange())

    expect(earned).toBe(true)
    const freeze = await getInventory(db, user.id, STREAK_FREEZE.itemType)
    const shield = await getInventory(db, user.id, STREAK_SHIELD.itemType)
    expect(JSON.parse(freeze!.metadata!)).toEqual({ earningCounter: 1 })
    expect(JSON.parse(shield!.metadata!)).toEqual({ earningCounter: 1 })
    expect(freeze!.quantity).toBe(0)
  })

  it('returns false and leaves counters untouched when entries already existed today', async () => {
    const { user, prompt, secondPrompt } = await createUserFixture(db.prisma)
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: prompt.id, answer: 'earlier entry' },
    })
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: secondPrompt.id, answer: 'the new entry' },
    })

    // 2 entries exist today but only 1 was just created -> not the first batch
    const earned = await processFirstEntryEarning(db.prisma, user.id, 1, dayRange())

    expect(earned).toBe(false)
    expect(await getInventory(db, user.id, STREAK_FREEZE.itemType)).toBeNull()
  })

  it('awards a freeze and resets the counter when the interval is reached', async () => {
    const { user, prompt } = await createUserFixture(db.prisma)
    await db.prisma.userInventory.create({
      data: {
        userId: user.id,
        itemType: STREAK_FREEZE.itemType,
        quantity: 2,
        metadata: JSON.stringify({ earningCounter: STREAK_FREEZE.earningInterval - 1 }),
      },
    })
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: prompt.id, answer: 'interval day' },
    })

    await processFirstEntryEarning(db.prisma, user.id, 1, dayRange())

    const freeze = await getInventory(db, user.id, STREAK_FREEZE.itemType)
    expect(freeze!.quantity).toBe(3)
    expect(JSON.parse(freeze!.metadata!)).toEqual({ earningCounter: 0 })
  })

  it('caps quantity at maxQuantity when awarding', async () => {
    const { user, prompt } = await createUserFixture(db.prisma)
    await db.prisma.userInventory.create({
      data: {
        userId: user.id,
        itemType: STREAK_SHIELD.itemType,
        quantity: STREAK_SHIELD.maxQuantity,
        metadata: JSON.stringify({ earningCounter: STREAK_SHIELD.earningInterval - 1 }),
      },
    })
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: prompt.id, answer: 'capped day' },
    })

    await processFirstEntryEarning(db.prisma, user.id, 1, dayRange())

    const shield = await getInventory(db, user.id, STREAK_SHIELD.itemType)
    expect(shield!.quantity).toBe(STREAK_SHIELD.maxQuantity)
    expect(JSON.parse(shield!.metadata!)).toEqual({ earningCounter: 0 })
  })
})
