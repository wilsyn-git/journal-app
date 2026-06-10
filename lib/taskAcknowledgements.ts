import type { PrismaClient } from '@prisma/client'

const NOTE_MAX = 280

type AcknowledgeResult = { success: true } | { error: string }

/**
 * Core acknowledgement logic. Org-scoped, idempotent. The server-action wrapper
 * supplies adminId/orgId from the authenticated session.
 */
export async function acknowledgeCompletion(
  prisma: PrismaClient,
  params: { assignmentId: string; adminId: string; orgId: string; note?: string }
): Promise<AcknowledgeResult> {
  const { assignmentId, adminId, orgId, note } = params

  const assignment = await prisma.taskAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, completedAt: true, acknowledgedAt: true, task: { select: { organizationId: true } } },
  })
  if (!assignment) return { error: 'Assignment not found' }
  if (assignment.task.organizationId !== orgId) return { error: 'Unauthorized' }
  if (!assignment.completedAt) return { error: 'Task not completed' }
  if (assignment.acknowledgedAt) return { success: true } // already acknowledged — no-op

  const trimmed = note?.trim()
  await prisma.taskAssignment.update({
    where: { id: assignmentId },
    data: {
      acknowledgedAt: new Date(),
      acknowledgedById: adminId,
      acknowledgementNote: trimmed ? trimmed.slice(0, NOTE_MAX) : null,
    },
  })
  return { success: true }
}

/** Whether a completed assignment may still be un-completed by the user. */
export function canUncomplete(assignment: { acknowledgedAt: Date | null }): boolean {
  return assignment.acknowledgedAt === null
}

/** Completed assignments awaiting admin acknowledgement, for the admin queue. */
export async function getPendingAcknowledgements(prisma: PrismaClient, orgId: string) {
  const pending = await prisma.taskAssignment.findMany({
    where: {
      completedAt: { not: null },
      acknowledgedAt: null,
      task: { organizationId: orgId, archivedAt: null },
    },
    select: {
      id: true,
      completedAt: true,
      task: { select: { id: true, title: true } },
      user: { select: { name: true, email: true } },
    },
    orderBy: { completedAt: 'asc' },
  })
  return pending.map((p) => ({
    assignmentId: p.id,
    taskId: p.task.id,
    taskTitle: p.task.title,
    userName: p.user.name || p.user.email,
    completedAt: p.completedAt as Date,
  }))
}

/** Count of completed-but-unacknowledged assignments, for the nav badge. */
export async function countPendingAcknowledgements(prisma: PrismaClient, orgId: string): Promise<number> {
  return prisma.taskAssignment.count({
    where: {
      completedAt: { not: null },
      acknowledgedAt: null,
      task: { organizationId: orgId, archivedAt: null },
    },
  })
}

export type AcknowledgementToast = {
  assignmentId: string
  taskTitle: string
  note: string | null
  acknowledgedByName: string
}

/**
 * Return this user's acknowledged-but-not-yet-shown confirmations, marking them
 * notified so each shows exactly once. Mirrors getAndMarkUnnotifiedAchievements.
 */
export async function getAndMarkAcknowledgements(
  prisma: PrismaClient,
  userId: string
): Promise<AcknowledgementToast[]> {
  const items = await prisma.taskAssignment.findMany({
    where: {
      userId,
      acknowledgedAt: { not: null },
      userNotifiedAt: null,
      task: { archivedAt: null },
    },
    select: {
      id: true,
      acknowledgementNote: true,
      acknowledgedById: true,
      task: { select: { title: true } },
    },
  })
  if (items.length === 0) return []

  await prisma.taskAssignment.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { userNotifiedAt: new Date() },
  })

  const adminIds = [...new Set(items.map((i) => i.acknowledgedById).filter((x): x is string => !!x))]
  const admins = adminIds.length
    ? await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true, email: true } })
    : []
  const nameById = new Map(admins.map((a) => [a.id, a.name || a.email]))

  return items.map((i) => ({
    assignmentId: i.id,
    taskTitle: i.task.title,
    note: i.acknowledgementNote,
    acknowledgedByName: i.acknowledgedById ? nameById.get(i.acknowledgedById) || 'An admin' : 'An admin',
  }))
}
