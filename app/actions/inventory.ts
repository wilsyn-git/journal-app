'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { resolveUserId } from '@/lib/auth-helpers'
import { STREAK_FREEZE, STREAK_SHIELD } from '@/lib/inventory'
import { revalidatePath } from 'next/cache'

export async function useStreakRecovery(missedDays: string[], freezesCost: number, shieldsCost: number) {
  const session = await auth()
  if (!session?.user?.email) throw new Error('Unauthorized')

  const userId = await resolveUserId(session)
  if (!userId) throw new Error('User not found')

  // Validate costs add up
  if (freezesCost + shieldsCost !== missedDays.length) {
    return { error: 'Cost mismatch' }
  }

  // Build transaction operations
  const operations = []

  if (freezesCost > 0) {
    const freezeInv = await prisma.userInventory.findUnique({
      where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
    })
    if (!freezeInv || freezeInv.quantity < freezesCost) {
      return { error: 'Not enough streak freezes' }
    }
    operations.push(
      prisma.userInventory.update({
        where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
        data: {
          quantity: { decrement: freezesCost },
          metadata: JSON.stringify({ earningCounter: 0 }),
        },
      })
    )
  }

  if (shieldsCost > 0) {
    const shieldInv = await prisma.userInventory.findUnique({
      where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
    })
    if (!shieldInv || shieldInv.quantity < shieldsCost) {
      return { error: 'Not enough streak shields' }
    }
    operations.push(
      prisma.userInventory.update({
        where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
        data: {
          quantity: { decrement: shieldsCost },
          metadata: JSON.stringify({ earningCounter: 0 }),
        },
      })
    )
  }

  // Record each frozen day
  operations.push(
    ...missedDays.map((frozenDate) =>
      prisma.streakFreezeUsage.create({
        data: { userId, frozenDate },
      })
    )
  )

  await prisma.$transaction(operations)

  revalidatePath('/dashboard')
  return { success: true, freezesUsed: freezesCost, shieldsUsed: shieldsCost }
}
