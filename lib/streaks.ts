export function calculateStreaks(
  sortedDays: string[],
  todayStr: string,
  frozenDates: Set<string> = new Set()
) {
  // Merge journal days and frozen dates into a single sorted set of "covered" dates
  const allCoveredDays = new Set([...sortedDays, ...frozenDates])
  const allSorted = Array.from(allCoveredDays).sort().reverse()

  if (allSorted.length === 0) return { current: 0, max: 0 }

  // Max streak
  let maxStreak = 0
  let tempStreak = 0

  for (let i = 0; i < allSorted.length; i++) {
    if (i === 0) {
      tempStreak = 1
    } else {
      const current = new Date(allSorted[i - 1])
      const prev = new Date(allSorted[i])
      const diffDays = Math.round(
        Math.abs(current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (diffDays === 1) {
        tempStreak++
      } else {
        if (tempStreak > maxStreak) maxStreak = tempStreak
        tempStreak = 1
      }
    }
  }
  if (tempStreak > maxStreak) maxStreak = tempStreak

  // Current streak
  let cStreak = 0
  const t = new Date(todayStr)
  t.setUTCDate(t.getUTCDate() - 1)
  const yesterdayStr = t.toISOString().split('T')[0]

  if (allSorted.includes(todayStr) || allSorted.includes(yesterdayStr)) {
    cStreak = 1
    for (let i = 0; i < allSorted.length - 1; i++) {
      const d1 = new Date(allSorted[i])
      const d2 = new Date(allSorted[i + 1])
      const diff = Math.round((d1.getTime() - d2.getTime()) / (1000 * 3600 * 24))
      if (diff === 1) cStreak++
      else break
    }
  }

  return { current: cStreak, max: maxStreak }
}
