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
