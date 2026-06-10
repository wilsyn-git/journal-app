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
