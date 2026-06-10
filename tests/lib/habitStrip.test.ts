import { describe, it, expect } from 'vitest'
import { computeStripCells } from '@/lib/habitStrip'

describe('computeStripCells', () => {
  it('returns windowSize cells (default 30)', () => {
    expect(computeStripCells([], 0, '2026-06-10')).toHaveLength(30)
    expect(computeStripCells([], 0, '2026-06-10', 7)).toHaveLength(7)
  })

  it('all cells empty when nothing is completed', () => {
    expect(computeStripCells([], 0, '2026-06-10', 5)).toEqual(
      ['empty', 'empty', 'empty', 'empty', 'empty']
    )
  })

  it('marks current-streak days "streak" and older completions "done"', () => {
    // today = 2026-06-10, window 5 → index0=06-06 ... index4=06-10 (today).
    // completed 06-06..06-09; currentStreak 3 → offsets 1..3 (06-09,06-08,06-07).
    const cells = computeStripCells(
      ['2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09'],
      3,
      '2026-06-10',
      5
    )
    expect(cells).toEqual(['done', 'streak', 'streak', 'streak', 'empty'])
  })

  it('treats a completed today as "done" (open period excluded from streak)', () => {
    // window 3 → index0=06-08, index1=06-09, index2=06-10 (today, completed).
    expect(computeStripCells(['2026-06-10'], 0, '2026-06-10', 3)).toEqual(
      ['empty', 'empty', 'done']
    )
  })

  it('ignores completions outside the window', () => {
    expect(computeStripCells(['2026-05-01'], 0, '2026-06-10', 5)).toEqual(
      ['empty', 'empty', 'empty', 'empty', 'empty']
    )
  })

  it('marks all completed cells as streak (except today) when streak exceeds the window', () => {
    const cells = computeStripCells(
      ['2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09'],
      50,
      '2026-06-10',
      5
    )
    expect(cells).toEqual(['streak', 'streak', 'streak', 'streak', 'empty'])
  })

  it('renders completed-but-lapsed days as done when currentStreak is 0', () => {
    // user completed 06-09 but missed today → streak broken (0), so the
    // completed day shows as done, not streak.
    const cells = computeStripCells(['2026-06-09'], 0, '2026-06-10', 3)
    expect(cells).toEqual(['empty', 'done', 'empty'])
  })
})
