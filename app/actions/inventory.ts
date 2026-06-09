'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { resolveUserId } from '@/lib/auth-helpers'
import { spendStreakRecovery } from '@/lib/streakSpend'
import { revalidatePath } from 'next/cache'

export async function useStreakRecovery(missedDays: string[], freezesCost: number, shieldsCost: number) {
  const session = await auth()
  if (!session?.user?.email) throw new Error('Unauthorized')

  const userId = await resolveUserId(session)
  if (!userId) throw new Error('User not found')

  try {
    const result = await spendStreakRecovery(prisma, userId, missedDays, freezesCost, shieldsCost)
    if ('success' in result) {
      revalidatePath('/dashboard')
    }
    return result
  } catch (e) {
    console.error('Streak recovery failed:', e)
    return { error: 'Failed to apply streak recovery' }
  }
}
