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
  item: EarnableItem,
  today: string
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
        metadata: JSON.stringify({ earningCounter: 0, lastEarnedDay: today }),
      },
    })
  } else {
    await tx.userInventory.update({
      where: { userId_itemType: { userId, itemType: item.itemType } },
      data: { metadata: JSON.stringify({ earningCounter: newCounter, lastEarnedDay: today }) },
    })
  }
}

/**
 * Increments freeze and shield earning counters if the entries just created are
 * the user's first of the day. The day-check, idempotency guard, and both
 * counter updates run in a single transaction.
 *
 * Idempotency: each earn stamps `lastEarnedDay` (the user's timezone day) into
 * the persisted inventory metadata and the transaction guards on that stamp.
 * Prisma serializes interactive transactions over a single connection, so a
 * second double or retried call sharing the same PrismaClient runs after the
 * first commits, reads its `lastEarnedDay === today`, and returns false WITHOUT
 * incrementing. The counter can never reach 2 for a single day from a single
 * earning batch. (This guarantee relies on calls sharing one connection; it
 * does NOT defend against two separate connections/processes racing, since the
 * guard is a plain read with no unique constraint to force a write-write abort.)
 *
 * `today` must be the same timezone day that `dayRange` spans — the caller is
 * responsible for deriving both from the user's timezone.
 * Returns true only if counters were actually incremented.
 */
export async function processFirstEntryEarning(
  client: PrismaClient,
  userId: string,
  entriesJustCreated: number,
  dayRange: { start: Date; end: Date },
  today: string
): Promise<boolean> {
  if (entriesJustCreated <= 0) {
    return false
  }

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

    // Idempotency guard: read the current persisted freeze metadata (creating
    // the row if absent). If a prior committed transaction already earned today,
    // its lastEarnedDay is visible here and we must not increment again.
    const freezeRow = await tx.userInventory.upsert({
      where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
      create: {
        userId,
        itemType: STREAK_FREEZE.itemType,
        quantity: 0,
        metadata: JSON.stringify({ earningCounter: 0 }),
      },
      update: {},
      select: { metadata: true },
    })

    if (parseItemMetadata(freezeRow.metadata).lastEarnedDay === today) {
      return false
    }

    // Freeze is the canonical guard row: both are stamped together in this
    // transaction, and the guard above reads freeze's lastEarnedDay — keep them
    // written as a pair so the guard never desyncs from the shield counter.
    await incrementEarningCounter(tx, userId, STREAK_FREEZE, today)
    await incrementEarningCounter(tx, userId, STREAK_SHIELD, today)
    return true
  })
}
