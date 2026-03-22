'use server'

import { prisma } from '@/lib/prisma'
import { ensureAdmin } from './helpers'
import { revalidatePath } from 'next/cache'

export async function revokeDeviceSession(sessionId: string) {
  await ensureAdmin()

  await prisma.deviceSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  })

  revalidatePath('/admin/users')
}

export async function revokeAllDeviceSessions(userId: string) {
  await ensureAdmin()

  await prisma.deviceSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })

  revalidatePath('/admin/users')
}
