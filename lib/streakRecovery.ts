import { STREAK_FREEZE } from '@/lib/inventory'

export type RecoveryStatus = {
  needsRecovery: boolean
  missedDays: string[]
  freezesCost: number
  shieldsCost: number
  freezesAvailable: number
  shieldsAvailable: number
  streakAtRisk: number
}

/**
 * Determines if a user has a recoverable broken streak.
 * Uses tiered recovery: freezes first (within grace window), shields for the rest.
 */
export function detectRecoverableStreak(
  sortedJournalDays: string[],
  todayStr: string,
  freezesAvailable: number,
  shieldsAvailable: number,
  frozenDates: Set<string>
): RecoveryStatus {
  const noRecovery: RecoveryStatus = {
    needsRecovery: false,
    missedDays: [],
    freezesCost: 0,
    shieldsCost: 0,
    freezesAvailable,
    shieldsAvailable,
    streakAtRisk: 0,
  }

  if (sortedJournalDays.length === 0) return noRecovery

  // Find the most recent covered day
  const allCovered = new Set([...sortedJournalDays, ...frozenDates])
  const allSorted = Array.from(allCovered).sort().reverse()
  const lastActiveDay = allSorted[0]

  // Calculate the gap between today and the last active day
  const today = new Date(todayStr + 'T12:00:00Z')
  const lastActive = new Date(lastActiveDay + 'T12:00:00Z')
  const gapDays = Math.round((today.getTime() - lastActive.getTime()) / (1000 * 3600 * 24))

  if (gapDays <= 0) return noRecovery

  // Collect missed days
  const missedDays: string[] = []
  for (let i = 1; i < gapDays; i++) {
    const d = new Date(lastActive.getTime() + i * 24 * 3600 * 1000)
    const dStr = d.toISOString().split('T')[0]
    if (!allCovered.has(dStr)) {
      missedDays.push(dStr)
    }
  }

  if (missedDays.length === 0) return noRecovery

  // Tiered cost calculation
  const withinGrace = missedDays.length <= STREAK_FREEZE.graceWindowDays
  let freezesCost = 0
  let shieldsCost = 0

  if (withinGrace) {
    // Prefer freezes, shields cover remainder
    freezesCost = Math.min(missedDays.length, freezesAvailable)
    shieldsCost = missedDays.length - freezesCost
  } else {
    // Beyond grace window — only shields can help
    freezesCost = 0
    shieldsCost = missedDays.length
  }

  // Check if we can afford it
  if (shieldsCost > shieldsAvailable) return noRecovery

  // Calculate the streak at risk
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
    freezesCost,
    shieldsCost,
    freezesAvailable,
    shieldsAvailable,
    streakAtRisk,
  }
}
