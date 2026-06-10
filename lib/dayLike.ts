import type { PrismaClient } from '@prisma/client'

/**
 * Sets `isLiked` on every supplied JournalEntry that belongs to the given
 * organization — the "like" grain is one journal-day (all of that day's
 * entries share one like). Org-scoped in the WHERE clause: ids outside the
 * organization are silently skipped (no cross-org writes). Returns the number
 * of rows actually updated. Empty `entryIds` is a no-op (`{ count: 0 }`).
 */
export async function setDayLike(
  prisma: PrismaClient,
  entryIds: string[],
  organizationId: string,
  liked: boolean
): Promise<{ count: number }> {
  if (entryIds.length === 0) return { count: 0 }
  return prisma.journalEntry.updateMany({
    where: { id: { in: entryIds }, user: { organizationId } },
    data: { isLiked: liked },
  })
}
