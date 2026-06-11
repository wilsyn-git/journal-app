import { ASSIGNMENT_MODES } from '@/lib/taskConstants'

/** Batch size for assignment createMany inserts — keeps each statement safely
 *  under SQLite's per-statement variable limit (999 on builds before 3.32). */
export const ASSIGNMENT_INSERT_CHUNK_SIZE = 200

/** When an ALL-mode resolve exceeds this many users, log a warning. Advisory
 *  observability signal only — does not block the operation. */
export const LARGE_ASSIGNMENT_WARN_THRESHOLD = 1000

/** Minimal structural client so this is unit-testable with a mock
 *  (mirrors the HealthCheckDb pattern in lib/health.ts). */
export interface AssignmentTargetsDb {
  userGroup: {
    findUnique: (args: {
      where: { id: string }
      include: { users: { select: { id: true } } }
    }) => Promise<{ users: { id: string }[] } | null>
  }
  user: {
    findMany: (args: {
      where: { organizationId: string }
      select: { id: true }
    }) => Promise<{ id: string }[]>
  }
}

/**
 * Resolve the set of user IDs an assignment should target.
 * - USER  → [targetId] (or [])
 * - GROUP → the group's member IDs (org membership of the group is enforced by callers)
 * - ALL   → every user in the org; logs the count, warns past the threshold
 * - other → []
 */
export async function resolveAssignmentUserIds(
  db: AssignmentTargetsDb,
  assignmentMode: string,
  targetId: string | null,
  organizationId: string,
): Promise<string[]> {
  if (assignmentMode === ASSIGNMENT_MODES.USER) {
    return targetId ? [targetId] : []
  }
  if (assignmentMode === ASSIGNMENT_MODES.GROUP) {
    if (!targetId) return []
    const group = await db.userGroup.findUnique({
      where: { id: targetId },
      include: { users: { select: { id: true } } },
    })
    return group ? group.users.map((u) => u.id) : []
  }
  if (assignmentMode === ASSIGNMENT_MODES.ALL) {
    const users = await db.user.findMany({
      where: { organizationId },
      select: { id: true },
    })
    const ids = users.map((u) => u.id)
    if (ids.length > LARGE_ASSIGNMENT_WARN_THRESHOLD) {
      console.warn(
        `[assignmentTargets] ALL assignment resolved ${ids.length} users in org ${organizationId} (over ${LARGE_ASSIGNMENT_WARN_THRESHOLD})`,
      )
    } else {
      console.info(
        `[assignmentTargets] ALL assignment resolved ${ids.length} users in org ${organizationId}`,
      )
    }
    return ids
  }
  return []
}
