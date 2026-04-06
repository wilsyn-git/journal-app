'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { resolveUserId } from '@/lib/auth-helpers'
import { STREAK_FREEZE } from '@/lib/inventory'
import { revalidatePath } from 'next/cache'

export async function useStreakFreeze(missedDays: string[]) {
  const session = await auth()
  if (!session?.user?.email) throw new Error('Unauthorized')

  const userId = await resolveUserId(session)
  if (!userId) throw new Error('User not found')

  // Get current inventory
  const inventory = await prisma.userInventory.findUnique({
    where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
  })

  if (!inventory || inventory.quantity < missedDays.length) {
    return { error: 'Not enough streak freezes' }
  }

  // Apply freezes in a transaction
  await prisma.$transaction([
    // Deduct quantity
    prisma.userInventory.update({
      where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
      data: {
        quantity: { decrement: missedDays.length },
        metadata: JSON.stringify({ earningCounter: 0 }),
      },
    }),
    // Record each frozen day
    ...missedDays.map((frozenDate) =>
      prisma.streakFreezeUsage.create({
        data: { userId, frozenDate },
      })
    ),
  ])

  revalidatePath('/dashboard')
  return { success: true, freezesUsed: missedDays.length }
}

