import { prisma } from '@/lib/prisma'
import { RESET_MODES, DAY_LABELS } from '@/lib/ruleConstants'

type RuleTypeForPeriod = {
  resetMode: string
  resetDay: number | null
  resetIntervalDays: number | null
  resetIntervalStart: Date | null
}

/**
 * Get the current date string in a timezone (YYYY-MM-DD).
 */
function getDateInTimezone(timezone: string, date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone })
}

/**
 * Get the current day of week (0=Sunday) in a timezone.
 */
function getDayOfWeekInTimezone(timezone: string, date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).formatToParts(date)
  const weekday = parts.find(p => p.type === 'weekday')?.value
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  return dayMap[weekday || 'Sun'] ?? 0
}

/**
 * Compute the period key for a rule type given user timezone and optional date.
 *
 * - DAILY: "2026-04-11"
 * - WEEKLY: "week-2026-04-06-R0" (date of last reset day)
 * - INTERVAL: "interval-5" (period number from start date)
 */
export function getPeriodKey(
  ruleType: RuleTypeForPeriod,
  timezone: string,
  date: Date = new Date()
): string {
  if (ruleType.resetMode === RESET_MODES.DAILY) {
    return getDateInTimezone(timezone, date)
  }

  if (ruleType.resetMode === RESET_MODES.WEEKLY) {
    const resetDay = ruleType.resetDay ?? 0
    const localDate = getDateInTimezone(timezone, date)
    const localDow = getDayOfWeekInTimezone(timezone, date)

    // Calculate days since last reset day
    const daysSinceReset = (localDow - resetDay + 7) % 7
    const resetDate = new Date(localDate)
    resetDate.setDate(resetDate.getDate() - daysSinceReset)

    // Use the reset date as the period identifier
    const resetDateStr = resetDate.toISOString().split('T')[0]
    return `week-${resetDateStr}-R${resetDay}`
  }

  if (ruleType.resetMode === RESET_MODES.INTERVAL) {
    const intervalDays = ruleType.resetIntervalDays ?? 1
    const startDate = ruleType.resetIntervalStart ?? new Date()
    const localDateStr = getDateInTimezone(timezone, date)
    const localDate = new Date(localDateStr)
    const startStr = startDate.toISOString().split('T')[0]
    const start = new Date(startStr)
    const diffMs = localDate.getTime() - start.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const periodNum = Math.floor(diffDays / intervalDays)
    return `interval-${periodNum}`
  }

  return getDateInTimezone(timezone, date)
}

/**
 * Get milliseconds until the next reset for a rule type.
 */
export function getNextResetTime(
  ruleType: RuleTypeForPeriod,
  timezone: string
): number {
  const now = new Date()

  if (ruleType.resetMode === RESET_MODES.DAILY) {
    const tomorrowStr = getDateInTimezone(timezone, new Date(now.getTime() + 24 * 60 * 60 * 1000))
    const midnightUtc = new Date(`${tomorrowStr}T00:00:00`)
    const offsetMs = now.getTime() - new Date(getDateInTimezone(timezone, now) + 'T00:00:00').getTime()
    return midnightUtc.getTime() + (24 * 60 * 60 * 1000 - offsetMs) - now.getTime()
  }

  if (ruleType.resetMode === RESET_MODES.WEEKLY) {
    const resetDay = ruleType.resetDay ?? 0
    const localDow = getDayOfWeekInTimezone(timezone, now)
    const daysUntilReset = (resetDay - localDow + 7) % 7 || 7
    return daysUntilReset * 24 * 60 * 60 * 1000
  }

  if (ruleType.resetMode === RESET_MODES.INTERVAL) {
    const intervalDays = ruleType.resetIntervalDays ?? 1
    const startDate = ruleType.resetIntervalStart ?? new Date()
    const localDateStr = getDateInTimezone(timezone, now)
    const localDate = new Date(localDateStr)
    const startStr = startDate.toISOString().split('T')[0]
    const start = new Date(startStr)
    const diffMs = localDate.getTime() - start.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const currentPeriodStart = diffDays - (diffDays % intervalDays)
    const nextPeriodStartDay = currentPeriodStart + intervalDays
    const nextResetDate = new Date(start.getTime() + nextPeriodStartDay * 24 * 60 * 60 * 1000)
    return nextResetDate.getTime() - now.getTime()
  }

  return 24 * 60 * 60 * 1000
}

/**
 * Format a rule type's reset schedule as a human-readable description.
 */
export function formatResetSchedule(ruleType: { resetMode: string; resetDay: number | null; resetIntervalDays: number | null }): string {
  if (ruleType.resetMode === RESET_MODES.DAILY) return 'Resets daily at midnight'
  if (ruleType.resetMode === RESET_MODES.WEEKLY) {
    return `Resets weekly on ${DAY_LABELS[ruleType.resetDay ?? 0]} at midnight`
  }
  if (ruleType.resetMode === RESET_MODES.INTERVAL) {
    return `Resets every ${ruleType.resetIntervalDays} day${ruleType.resetIntervalDays === 1 ? '' : 's'}`
  }
  return 'Unknown schedule'
}

/**
 * Format milliseconds until reset as a human-readable countdown.
 */
export function formatResetCountdown(ms: number): string {
  if (ms <= 0) return 'Resetting...'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `Resets in ${days}d`
  }
  if (hours > 0) return `Resets in ${hours}h`
  return `Resets in ${minutes}m`
}

/**
 * Calculate streak for a single rule assignment.
 * Returns consecutive completed periods working backwards from the previous period
 * (current period is still open, so we start from the one before).
 */
export function calculateRuleStreak(
  completedPeriodKeys: string[],
  allPeriodKeys: string[]
): { current: number; max: number } {
  if (completedPeriodKeys.length === 0) return { current: 0, max: 0 }

  const completedSet = new Set(completedPeriodKeys)

  // Max streak: walk through all period keys in order, count consecutive completions
  let maxStreak = 0
  let tempStreak = 0
  for (const key of allPeriodKeys) {
    if (completedSet.has(key)) {
      tempStreak++
      if (tempStreak > maxStreak) maxStreak = tempStreak
    } else {
      tempStreak = 0
    }
  }

  // Current streak: walk backwards from the most recent completed period
  // Skip the current (latest) period since it's still open
  let currentStreak = 0
  const keysWithoutCurrent = allPeriodKeys.slice(0, -1)
  for (let i = keysWithoutCurrent.length - 1; i >= 0; i--) {
    if (completedSet.has(keysWithoutCurrent[i])) {
      currentStreak++
    } else {
      break
    }
  }

  return { current: currentStreak, max: maxStreak }
}

/**
 * Generate period keys from a start date to today for a given rule type.
 * Used for streak calculation — produces the ordered list of all periods.
 */
export function generatePeriodKeys(
  ruleType: RuleTypeForPeriod,
  timezone: string,
  since: Date
): string[] {
  const keys: string[] = []
  const now = new Date()
  const current = new Date(since)

  while (current <= now) {
    keys.push(getPeriodKey(ruleType, timezone, current))

    if (ruleType.resetMode === RESET_MODES.DAILY) {
      current.setDate(current.getDate() + 1)
    } else if (ruleType.resetMode === RESET_MODES.WEEKLY) {
      current.setDate(current.getDate() + 7)
    } else if (ruleType.resetMode === RESET_MODES.INTERVAL) {
      current.setDate(current.getDate() + (ruleType.resetIntervalDays ?? 1))
    }
  }

  // Deduplicate (in case of timezone edge cases)
  return [...new Set(keys)]
}

/**
 * Get rule assignments for a user with current period completion status.
 * Groups by rule type for display.
 */
export async function getUserRulesWithStatus(userId: string, timezone: string) {
  const assignments = await prisma.ruleAssignment.findMany({
    where: {
      userId,
      rule: { isActive: true },
    },
    include: {
      rule: {
        include: { ruleType: true },
      },
      completions: true,
    },
  })

  // Build sortOrder lookup for O(1) access
  const sortOrderMap = new Map<string, number>()
  for (const a of assignments) {
    sortOrderMap.set(a.rule.id, a.rule.sortOrder)
  }

  // Group by rule type
  const byType = new Map<string, {
    ruleType: typeof assignments[0]['rule']['ruleType']
    rules: {
      assignmentId: string
      ruleId: string
      title: string
      description: string | null
      periodKey: string
      isCompleted: boolean
      completionId: string | null
      allCompletionKeys: string[]
      assignmentCreatedAt: Date
    }[]
  }>()

  for (const assignment of assignments) {
    const { rule } = assignment
    const { ruleType } = rule
    const periodKey = getPeriodKey(ruleType, timezone)

    const completion = assignment.completions.find(c => c.periodKey === periodKey)

    if (!byType.has(ruleType.id)) {
      byType.set(ruleType.id, { ruleType, rules: [] })
    }

    byType.get(ruleType.id)!.rules.push({
      assignmentId: assignment.id,
      ruleId: rule.id,
      title: rule.title,
      description: rule.description,
      periodKey,
      isCompleted: !!completion,
      completionId: completion?.id ?? null,
      allCompletionKeys: assignment.completions.map(c => c.periodKey),
      assignmentCreatedAt: assignment.createdAt,
    })
  }

  // Sort rules within each type by sort order
  for (const group of byType.values()) {
    group.rules.sort((a, b) =>
      (sortOrderMap.get(a.ruleId) ?? 0) - (sortOrderMap.get(b.ruleId) ?? 0)
    )
  }

  // Convert to sorted array by type sort order
  return Array.from(byType.values()).sort(
    (a, b) => a.ruleType.sortOrder - b.ruleType.sortOrder
  )
}

/**
 * Count total and completed rules for the current period (for sidebar badge).
 */
export async function getRuleProgress(userId: string, timezone: string) {
  const groups = await getUserRulesWithStatus(userId, timezone)
  let total = 0
  let completed = 0
  for (const group of groups) {
    for (const rule of group.rules) {
      total++
      if (rule.isCompleted) completed++
    }
  }
  return { total, completed }
}
