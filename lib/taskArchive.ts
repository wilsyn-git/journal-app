import type { PrismaClient } from '@prisma/client'
import { DEFAULT_TIMEZONE, getTodayForUser, startOfDayInTimezone } from '@/lib/timezone'

export type ArchivableAssignment = {
  acknowledgedAt: Date | null
  startOfTodayUtc: Date
}

/**
 * A task is archivable when it has at least one assignment and EVERY assignment
 * has been acknowledged strictly before the start of its assignee's current local day.
 */
export function isTaskArchivable(assignments: ArchivableAssignment[]): boolean {
  if (assignments.length === 0) return false
  return assignments.every(
    (a) => a.acknowledgedAt !== null && a.acknowledgedAt.getTime() < a.startOfTodayUtc.getTime()
  )
}

/**
 * Lazily archive tasks in an org whose assignments are all acknowledged before
 * the start of each assignee's current local day. Returns the number archived.
 * Uses the passed-in prisma so it is testable against an isolated test DB.
 */
export async function archiveAcknowledgedTasks(prisma: PrismaClient, orgId: string): Promise<number> {
  const candidates = await prisma.task.findMany({
    where: {
      organizationId: orgId,
      archivedAt: null,
      assignments: { some: { acknowledgedAt: { not: null } } },
    },
    select: {
      id: true,
      assignments: { select: { acknowledgedAt: true, userId: true } },
    },
  })
  if (candidates.length === 0) return 0

  const userIds = [...new Set(candidates.flatMap((t) => t.assignments.map((a) => a.userId)))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, timezone: true },
  })
  const tzByUser = new Map(users.map((u) => [u.id, u.timezone || DEFAULT_TIMEZONE]))

  const startCache = new Map<string, Date>()
  const startFor = (tz: string): Date => {
    let s = startCache.get(tz)
    if (!s) {
      s = startOfDayInTimezone(getTodayForUser(tz), tz)
      startCache.set(tz, s)
    }
    return s
  }

  const toArchive = candidates
    .filter((t) =>
      isTaskArchivable(
        t.assignments.map((a) => ({
          acknowledgedAt: a.acknowledgedAt,
          startOfTodayUtc: startFor(tzByUser.get(a.userId) || DEFAULT_TIMEZONE),
        }))
      )
    )
    .map((t) => t.id)

  if (toArchive.length === 0) return 0
  const res = await prisma.task.updateMany({
    where: { id: { in: toArchive } },
    data: { archivedAt: new Date() },
  })
  return res.count
}
