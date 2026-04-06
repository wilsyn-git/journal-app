import { prisma } from '@/lib/prisma'
import { STREAK_FREEZE, parseStreakFreezeMetadata } from '@/lib/inventory'

export async function getInventory(userId: string) {
  const inventory = await prisma.userInventory.findUnique({
    where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
  })

  const metadata = parseStreakFreezeMetadata(inventory?.metadata ?? null)

  return {
    freezeCount: inventory?.quantity ?? 0,
    earningCounter: metadata.earningCounter,
    earningInterval: STREAK_FREEZE.earningInterval,
    maxQuantity: STREAK_FREEZE.maxQuantity,
  }
}

export async function getFrozenDates(userId: string): Promise<string[]> {
  const usages = await prisma.streakFreezeUsage.findMany({
    where: { userId },
    select: { frozenDate: true },
  })
  return usages.map((u) => u.frozenDate)
}
