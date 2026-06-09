import type { PrismaClient, Prisma } from '@prisma/client'
import { STREAK_FREEZE, STREAK_SHIELD, parseItemMetadata } from './inventory'

type EarnableItem = {
  itemType: string
  earningInterval: number
  maxQuantity: number
}

async function incrementEarningCounter(
  tx: Prisma.TransactionClient,
  userId: string,
  item: EarnableItem
): Promise<void> {
  const inventory = await tx.userInventory.upsert({
    where: { userId_itemType: { userId, itemType: item.itemType } },
    create: {
      userId,
      itemType: item.itemType,
      quantity: 0,
      metadata: JSON.stringify({ earningCounter: 0 }),
    },
    update: {},
    select: { quantity: true, metadata: true },
  })

  const newCounter = parseItemMetadata(inventory.metadata).earningCounter + 1

  if (newCounter >= item.earningInterval) {
    await tx.userInventory.update({
      where: { userId_itemType: { userId, itemType: item.itemType } },
      data: {
        quantity: Math.min(inventory.quantity + 1, item.maxQuantity),
        metadata: JSON.stringify({ earningCounter: 0 }),
      },
    })
  } else {
    await tx.userInventory.update({
      where: { userId_itemType: { userId, itemType: item.itemType } },
      data: { metadata: JSON.stringify({ earningCounter: newCounter }) },
    })
  }
}

/**
 * Increments freeze and shield earning counters if the entries just created are
 * the user's first of the day. The day-check and both counter updates run in a
 * single transaction: a concurrent submit or spend either serializes behind it
 * or fails the whole unit, so counters can no longer lose updates.
 * Returns true if counters were incremented.
 */
export async function processFirstEntryEarning(
  client: PrismaClient,
  userId: string,
  entriesJustCreated: number,
  dayRange: { start: Date; end: Date }
): Promise<boolean> {
  return client.$transaction(async (tx) => {
    const todayEntryCount = await tx.journalEntry.count({
      where: {
        userId,
        createdAt: { gte: dayRange.start, lte: dayRange.end },
      },
    })

    if (todayEntryCount > entriesJustCreated) {
      return false
    }

    await incrementEarningCounter(tx, userId, STREAK_FREEZE)
    await incrementEarningCounter(tx, userId, STREAK_SHIELD)
    return true
  })
}
