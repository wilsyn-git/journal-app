import { prisma } from '@/lib/prisma'
import { STREAK_FREEZE, STREAK_SHIELD, parseItemMetadata } from '@/lib/inventory'

export async function getInventory(userId: string) {
  const [freezeRow, shieldRow] = await Promise.all([
    prisma.userInventory.findUnique({
      where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
    }),
    prisma.userInventory.findUnique({
      where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
    }),
  ])

  const freezeMeta = parseItemMetadata(freezeRow?.metadata ?? null)
  const shieldMeta = parseItemMetadata(shieldRow?.metadata ?? null)

  return {
    freezeCount: freezeRow?.quantity ?? 0,
    earningCounter: freezeMeta.earningCounter,
    earningInterval: STREAK_FREEZE.earningInterval,
    maxQuantity: STREAK_FREEZE.maxQuantity,
    shieldCount: shieldRow?.quantity ?? 0,
    shieldEarningCounter: shieldMeta.earningCounter,
    shieldEarningInterval: STREAK_SHIELD.earningInterval,
    shieldMaxQuantity: STREAK_SHIELD.maxQuantity,
  }
}

export async function getFrozenDates(userId: string): Promise<string[]> {
  const usages = await prisma.streakFreezeUsage.findMany({
    where: { userId },
    select: { frozenDate: true },
  })
  return usages.map((u) => u.frozenDate)
}
