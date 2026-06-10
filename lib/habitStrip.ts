export type StripCellState = 'empty' | 'done' | 'streak'

/**
 * Subtract `days` whole days from a YYYY-MM-DD string, returning YYYY-MM-DD.
 * Uses UTC arithmetic so whole-day offsets are DST-safe.
 */
function shiftDay(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * Build consistency-strip cell states for the last `windowSize` days.
 * Index 0 = oldest (today − (windowSize − 1)); last index = today.
 *
 * - 'empty'  : that day was not completed
 * - 'done'   : completed, but not part of the current live streak
 * - 'streak' : completed AND within the current streak — the consecutive run of
 *              completed days ending *yesterday* (offsets 1..currentStreak).
 *              Today (offset 0) is the still-open period and is never 'streak',
 *              matching calculateRuleStreak.
 */
export function computeStripCells(
  completedDays: string[],
  currentStreak: number,
  todayStr: string,
  windowSize = 30
): StripCellState[] {
  const completed = new Set(completedDays)
  const cells: StripCellState[] = []
  for (let i = 0; i < windowSize; i++) {
    const offsetFromToday = windowSize - 1 - i
    const dateStr = shiftDay(todayStr, offsetFromToday)
    if (!completed.has(dateStr)) {
      cells.push('empty')
    } else if (offsetFromToday >= 1 && offsetFromToday <= currentStreak) {
      cells.push('streak')
    } else {
      cells.push('done')
    }
  }
  return cells
}
