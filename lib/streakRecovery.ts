import { STREAK_FREEZE } from '@/lib/inventory'

export type RecoveryStatus = {
  needsRecovery: boolean
  missedDays: string[]
  freezesAvailable: number
  freezesCost: number
  streakAtRisk: number
}

/**
 * Determines if a user has a recoverable broken streak.
 *
 * @param sortedJournalDays - Descending sorted YYYY-MM-DD strings of days the user journaled
 * @param todayStr - Today's date as YYYY-MM-DD in the user's timezone
 * @param freezesAvailable - Number of streak freezes the user has
 * @param frozenDates - Set of already-frozen dates
 */
export function detectRecoverableStreak(
  sortedJournalDays: string[],
  todayStr: string,
  freezesAvailable: number,
  frozenDates: Set<string>
): RecoveryStatus {
  const noRecovery: RecoveryStatus = {
    needsRecovery: false,
    missedDays: [],
    freezesAvailable,
    freezesCost: 0,
    streakAtRisk: 0,
  }

  if (sortedJournalDays.length === 0 || freezesAvailable === 0) return noRecovery

  // Find the most recent journal day
  const allCovered = new Set([...sortedJournalDays, ...frozenDates])
  const allSorted = Array.from(allCovered).sort().reverse()
  const lastActiveDay = allSorted[0]

  // Calculate the gap between today and the last active day
  const today = new Date(todayStr + 'T12:00:00Z')
  const lastActive = new Date(lastActiveDay + 'T12:00:00Z')
  const gapDays = Math.round((today.getTime() - lastActive.getTime()) / (1000 * 3600 * 24))

  // No gap or already journaled today
  if (gapDays <= 0) return noRecovery

  // If today is a journal day, check for interior gaps
  const todayIsJournalDay = sortedJournalDays.includes(todayStr) || frozenDates.has(todayStr)

  // Collect missed days (the gap between last active day and today)
  const missedDays: string[] = []
  for (let i = 1; i < gapDays; i++) {
    const d = new Date(lastActive.getTime() + i * 24 * 3600 * 1000)
    const dStr = d.toISOString().split('T')[0]
    if (!allCovered.has(dStr)) {
      missedDays.push(dStr)
    }
  }

  // Also include today if it's not covered and the gap is within grace window
  if (!todayIsJournalDay && gapDays <= STREAK_FREEZE.graceWindowDays + 1) {
    // Today doesn't count as missed — the user is here now.
    // Only the days between last active and today are missed.
  }

  if (missedDays.length === 0) return noRecovery
  if (missedDays.length > STREAK_FREEZE.graceWindowDays) return noRecovery
  if (missedDays.length > freezesAvailable) {
    return { ...noRecovery, needsRecovery: true, missedDays, freezesCost: missedDays.length }
  }

  // Calculate the streak that would be preserved
  // Walk backwards from lastActiveDay counting consecutive covered days
  let streakAtRisk = 1
  for (let i = 0; i < allSorted.length - 1; i++) {
    const d1 = new Date(allSorted[i] + 'T12:00:00Z')
    const d2 = new Date(allSorted[i + 1] + 'T12:00:00Z')
    const diff = Math.round((d1.getTime() - d2.getTime()) / (1000 * 3600 * 24))
    if (diff === 1) streakAtRisk++
    else break
  }

  return {
    needsRecovery: true,
    missedDays,
    freezesAvailable,
    freezesCost: missedDays.length,
    streakAtRisk,
  }
}
