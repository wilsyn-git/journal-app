import { describe, it, expect } from 'vitest'
import { computeDailyHabitStats } from '@/lib/rules'

// In-memory fixture builder — mirrors the Prisma include shape consumed by
// computeDailyHabitStats (assignment.createdAt, rule.{id,title,sortOrder,ruleType},
// completions[].periodKey).
function makeAssignment(opts: {
  id?: string
  title?: string
  sortOrder?: number
  resetMode?: 'DAILY' | 'WEEKLY' | 'INTERVAL'
  completions?: string[]
  createdAt?: Date
}) {
  return {
    createdAt: opts.createdAt ?? new Date('2026-06-01T00:00:00Z'),
    rule: {
      id: opts.id ?? 'r1',
      title: opts.title ?? 'Habit',
      sortOrder: opts.sortOrder ?? 0,
      ruleType: {
        resetMode: opts.resetMode ?? 'DAILY',
        resetDay: null,
        resetIntervalDays: null,
        resetIntervalStart: null,
      },
    },
    completions: (opts.completions ?? []).map(periodKey => ({ periodKey })),
  }
}

describe('computeDailyHabitStats', () => {
  it('includes only DAILY-reset rules', () => {
    const result = computeDailyHabitStats([
      makeAssignment({ id: 'd', resetMode: 'DAILY' }),
      makeAssignment({ id: 'w', resetMode: 'WEEKLY' }),
      makeAssignment({ id: 'i', resetMode: 'INTERVAL' }),
    ], 'UTC')
    expect(result.map(r => r.id)).toEqual(['d'])
  })

  it('sorts results by rule sortOrder ascending', () => {
    const result = computeDailyHabitStats([
      makeAssignment({ id: 'b', sortOrder: 2 }),
      makeAssignment({ id: 'a', sortOrder: 1 }),
      makeAssignment({ id: 'c', sortOrder: 3 }),
    ], 'UTC')
    expect(result.map(r => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('maps id from rule.id and content from rule.title', () => {
    const result = computeDailyHabitStats([
      makeAssignment({ id: 'rule-x', title: 'Drink water' }),
    ], 'UTC')
    expect(result[0].id).toBe('rule-x')
    expect(result[0].content).toBe('Drink water')
  })

  it('reports completion count and the completed-day keys', () => {
    const result = computeDailyHabitStats([
      makeAssignment({ completions: ['2026-06-01', '2026-06-02', '2026-06-03'] }),
    ], 'UTC')
    expect(result[0].count).toBe(3)
    expect(result[0].completedDays).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })

  it('computes max streak across the rule history', () => {
    // createdAt 2026-06-01; three consecutive completed days within range.
    // maxStreak walks all period keys (createdAt..now) counting consecutive hits.
    const result = computeDailyHabitStats([
      makeAssignment({ completions: ['2026-06-01', '2026-06-02', '2026-06-03'] }),
    ], 'UTC')
    expect(result[0].maxStreak).toBe(3)
  })

  it('returns an empty array when there are no daily rules', () => {
    expect(computeDailyHabitStats([], 'UTC')).toEqual([])
    expect(computeDailyHabitStats([makeAssignment({ resetMode: 'WEEKLY' })], 'UTC')).toEqual([])
  })

  it('reports currentStreak 0 when the latest completions are not recent', () => {
    // completions end 2026-06-03, far before today → the streak is broken,
    // so the current (live) streak is 0 even though maxStreak is 3.
    const result = computeDailyHabitStats([
      makeAssignment({ completions: ['2026-06-01', '2026-06-02', '2026-06-03'] }),
    ], 'UTC')
    expect(result[0].currentStreak).toBe(0)
  })
})
