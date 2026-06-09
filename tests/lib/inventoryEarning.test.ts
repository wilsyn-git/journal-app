import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { processFirstEntryEarning } from '@/lib/inventoryEarning'
import { STREAK_FREEZE, STREAK_SHIELD } from '@/lib/inventory'

const TODAY = '2026-06-09'

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

    const earned = await processFirstEntryEarning(db.prisma, user.id, 1, dayRange(), TODAY)

    expect(earned).toBe(true)
    const freeze = await getInventory(db, user.id, STREAK_FREEZE.itemType)
    const shield = await getInventory(db, user.id, STREAK_SHIELD.itemType)
    expect(JSON.parse(freeze!.metadata!)).toEqual({ earningCounter: 1, lastEarnedDay: TODAY })
    expect(JSON.parse(shield!.metadata!)).toEqual({ earningCounter: 1, lastEarnedDay: TODAY })
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
    const earned = await processFirstEntryEarning(db.prisma, user.id, 1, dayRange(), TODAY)

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

    await processFirstEntryEarning(db.prisma, user.id, 1, dayRange(), TODAY)

    const freeze = await getInventory(db, user.id, STREAK_FREEZE.itemType)
    expect(freeze!.quantity).toBe(3)
    expect(JSON.parse(freeze!.metadata!)).toEqual({ earningCounter: 0, lastEarnedDay: TODAY })
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

    await processFirstEntryEarning(db.prisma, user.id, 1, dayRange(), TODAY)

    const shield = await getInventory(db, user.id, STREAK_SHIELD.itemType)
    expect(shield!.quantity).toBe(STREAK_SHIELD.maxQuantity)
    expect(JSON.parse(shield!.metadata!)).toEqual({ earningCounter: 0, lastEarnedDay: TODAY })
  })

  it('does not increment again on a second call after a successful earn the same day', async () => {
    const { user, prompt, secondPrompt } = await createUserFixture(db.prisma)
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: prompt.id, answer: 'first entry' },
    })
    const first = await processFirstEntryEarning(db.prisma, user.id, 1, dayRange(), TODAY)
    expect(first).toBe(true)

    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: secondPrompt.id, answer: 'second entry' },
    })
    const second = await processFirstEntryEarning(db.prisma, user.id, 1, dayRange(), TODAY)

    expect(second).toBe(false)
    const freeze = await getInventory(db, user.id, STREAK_FREEZE.itemType)
    expect(JSON.parse(freeze!.metadata!)).toEqual({ earningCounter: 1, lastEarnedDay: TODAY })
  })

  it('does not increment again on a second identical call (lastEarnedDay guard, not entry-count guard)', async () => {
    const { user, prompt } = await createUserFixture(db.prisma)
    // Exactly ONE entry exists. todayEntryCount(1) > entriesJustCreated(1) is
    // false on BOTH calls, so only the lastEarnedDay guard can stop the second.
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: prompt.id, answer: 'only entry' },
    })

    const first = await processFirstEntryEarning(db.prisma, user.id, 1, dayRange(), TODAY)
    const second = await processFirstEntryEarning(db.prisma, user.id, 1, dayRange(), TODAY)

    expect(first).toBe(true)
    expect(second).toBe(false)
    const freeze = await getInventory(db, user.id, STREAK_FREEZE.itemType)
    expect(JSON.parse(freeze!.metadata!).earningCounter).toBe(1)
  })

  it('never double-counts under concurrent invocation', async () => {
    const { user, prompt } = await createUserFixture(db.prisma)
    await db.prisma.journalEntry.create({
      data: { userId: user.id, promptId: prompt.id, answer: 'concurrent day' },
    })

    // Two racing earning attempts: SQLite/Prisma may fail one with a busy/timeout
    // error — that's acceptable. What must never happen is BOTH incrementing.
    const results = await Promise.allSettled([
      processFirstEntryEarning(db.prisma, user.id, 1, dayRange(), TODAY),
      processFirstEntryEarning(db.prisma, user.id, 1, dayRange(), TODAY),
    ])

    const earnedCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value === true
    ).length
    expect(earnedCount).toBeLessThanOrEqual(1)

    const freeze = await getInventory(db, user.id, STREAK_FREEZE.itemType)
    const counter = freeze ? JSON.parse(freeze.metadata!).earningCounter : 0
    expect(counter).toBeLessThanOrEqual(1)
  })
})
