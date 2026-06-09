import type { PrismaClient } from '@prisma/client'
import { STREAK_FREEZE, STREAK_SHIELD } from './inventory'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type SpendResult =
  | { success: true; freezesUsed: number; shieldsUsed: number }
  | { error: string }

class InsufficientInventoryError extends Error {}

/**
 * Spends freezes/shields to recover missed streak days. The decrements use a
 * guarded updateMany (quantity >= cost in the WHERE) inside one transaction with
 * the usage-row inserts, so concurrent spends cannot overdraft and a partial
 * spend always rolls back. The decrement does NOT rewrite `metadata`, so the
 * earning counter and lastEarnedDay stamp are preserved (a spend must not reset
 * earning progress or re-open the same-day double-earn window).
 */
export async function spendStreakRecovery(
  client: PrismaClient,
  userId: string,
  missedDays: string[],
  freezesCost: number,
  shieldsCost: number
): Promise<SpendResult> {
  if (freezesCost < 0 || shieldsCost < 0 || freezesCost + shieldsCost !== missedDays.length) {
    return { error: 'Cost mismatch' }
  }
  if (missedDays.some((day) => !DATE_KEY_PATTERN.test(day))) {
    return { error: 'Invalid date format' }
  }

  try {
    await client.$transaction(async (tx) => {
      const spends: Array<{ itemType: string; cost: number; label: string }> = [
        { itemType: STREAK_FREEZE.itemType, cost: freezesCost, label: 'streak freezes' },
        { itemType: STREAK_SHIELD.itemType, cost: shieldsCost, label: 'streak shields' },
      ]

      for (const { itemType, cost, label } of spends) {
        if (cost === 0) continue
        const updated = await tx.userInventory.updateMany({
          where: { userId, itemType, quantity: { gte: cost } },
          data: { quantity: { decrement: cost } },
        })
        if (updated.count === 0) {
          throw new InsufficientInventoryError(`Not enough ${label}`)
        }
      }

      for (const frozenDate of missedDays) {
        await tx.streakFreezeUsage.create({ data: { userId, frozenDate } })
      }
    })
  } catch (e) {
    if (e instanceof InsufficientInventoryError) {
      return { error: e.message }
    }
    throw e
  }

  return { success: true, freezesUsed: freezesCost, shieldsUsed: shieldsCost }
}
