/**
 * Characterization tests for getRuleCalendarData / computeRuleCalendarStatus.
 *
 * Approach chosen: pure in-memory unit tests against the extracted
 * `computeRuleCalendarStatus` helper (exported @internal from lib/rules.ts).
 *
 * Rationale: `getRuleCalendarData` uses the global Prisma singleton rather than
 * accepting a client parameter (unlike streakSpend), making full DB-harness
 * integration tests disproportionately heavy for this pure transform. The
 * public behaviour of `getRuleCalendarData` is identical — it calls
 * `computeRuleCalendarStatus` directly with the Prisma results.
 *
 * The schema constraint `@@unique([ruleAssignmentId, periodKey])` on
 * RuleCompletion guarantees at most one completion per (assignment, periodKey)
 * pair, so incrementing once per completion row is exactly equivalent to the
 * previous `.some()` scan.
 */

import { describe, it, expect } from 'vitest'
import { computeRuleCalendarStatus } from '@/lib/rules'

// ---------------------------------------------------------------------------
// In-memory fixture builder helpers
// ---------------------------------------------------------------------------

function makeAssignment(
  resetMode: 'DAILY' | 'WEEKLY',
  periodKeys: string[],
  resetDay: number | null = null,
) {
  return {
    rule: { ruleType: { resetMode, resetDay } },
    completions: periodKeys.map(periodKey => ({ periodKey })),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeRuleCalendarStatus', () => {
  // 1. Daily — all assignments completed on a date → 'all'
  it('daily: all assignments completed on a date → "all"', () => {
    const assignments = [
      makeAssignment('DAILY', ['2026-06-01']),
      makeAssignment('DAILY', ['2026-06-01']),
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect(result.dailyStatus['2026-06-01']).toBe('all')
  })

  // 2. Daily — some but not all → 'partial'
  it('daily: some but not all assignments completed → "partial"', () => {
    const assignments = [
      makeAssignment('DAILY', ['2026-06-02']), // completed
      makeAssignment('DAILY', []),             // not completed
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect(result.dailyStatus['2026-06-02']).toBe('partial')
  })

  // 3. Daily — a date with zero completions does not appear in the map
  it('daily: date with zero completions is absent from dailyStatus', () => {
    const assignments = [
      makeAssignment('DAILY', []),
      makeAssignment('DAILY', []),
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect(Object.keys(result.dailyStatus)).toHaveLength(0)
  })

  // 4. Weekly — periodKey maps to Sunday date with correct 'all' / 'partial'
  it('weekly: all completed → "all" keyed by sunday date', () => {
    const assignments = [
      makeAssignment('WEEKLY', ['week-2026-06-01-R0']),
      makeAssignment('WEEKLY', ['week-2026-06-01-R0']),
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect(result.weeklyStatus['2026-06-01']).toBe('all')
  })

  it('weekly: partial completion → "partial" keyed by sunday date', () => {
    const assignments = [
      makeAssignment('WEEKLY', ['week-2026-06-08-R0']), // completed
      makeAssignment('WEEKLY', []),                     // not completed
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect(result.weeklyStatus['2026-06-08']).toBe('partial')
  })

  // 5. Malformed daily periodKey (not YYYY-MM-DD) is ignored
  it('daily: malformed periodKey is ignored', () => {
    const assignments = [
      makeAssignment('DAILY', ['not-a-date']),
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect('not-a-date' in result.dailyStatus).toBe(false)
    expect(Object.keys(result.dailyStatus)).toHaveLength(0)
  })

  // 6. No assignments → { dailyStatus: {}, weeklyStatus: {} }
  it('no assignments → empty maps', () => {
    const result = computeRuleCalendarStatus([])
    expect(result).toEqual({ dailyStatus: {}, weeklyStatus: {} })
  })

  // 7. Mixed DAILY and WEEKLY assignments — each goes to the right bucket
  it('mixed: daily and weekly assignments are bucketed independently', () => {
    const assignments = [
      makeAssignment('DAILY', ['2026-06-01']),
      makeAssignment('WEEKLY', ['week-2026-06-01-R0']),
    ]
    const result = computeRuleCalendarStatus(assignments)
    // 1 daily assignment, 1 completion → 'all'
    expect(result.dailyStatus['2026-06-01']).toBe('all')
    // 1 weekly assignment, 1 completion → 'all'
    expect(result.weeklyStatus['2026-06-01']).toBe('all')
  })

  // 8. Malformed weekly periodKey is skipped
  it('weekly: malformed periodKey is skipped', () => {
    const assignments = [
      makeAssignment('WEEKLY', ['bad-week-key']),
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect(Object.keys(result.weeklyStatus)).toHaveLength(0)
  })

  // 9. n=1 boundary: single assignment with one completion → 'all' (guards count >= length)
  it('daily: single assignment with one completion on a date → "all"', () => {
    const assignments = [
      makeAssignment('DAILY', ['2026-06-10']),
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect(result.dailyStatus['2026-06-10']).toBe('all')
  })

  // 10. Multi-date: single assignment with completions on multiple distinct dates
  it('daily: completions on multiple distinct dates all appear with correct status', () => {
    const assignments = [
      makeAssignment('DAILY', ['2026-06-10', '2026-06-11', '2026-06-12']),
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect(result.dailyStatus['2026-06-10']).toBe('all')
    expect(result.dailyStatus['2026-06-11']).toBe('all')
    expect(result.dailyStatus['2026-06-12']).toBe('all')
    expect(Object.keys(result.dailyStatus)).toHaveLength(3)
  })

  // 11. N1.9 regression: mixed reset days, each group fully completed → each 'all'.
  it('weekly: mixed reset days, each group complete → each bucket "all"', () => {
    const assignments = [
      makeAssignment('WEEKLY', ['week-2026-06-07-R0'], 0), // Sunday-reset, done
      makeAssignment('WEEKLY', ['week-2026-06-03-R3'], 3), // Wednesday-reset, done
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect(result.weeklyStatus['2026-06-07']).toBe('all')
    expect(result.weeklyStatus['2026-06-03']).toBe('all')
  })

  // 12. N1.9: per-group independence — one group complete, another partial.
  it('weekly: mixed reset days, one group complete one partial → independent status', () => {
    const assignments = [
      makeAssignment('WEEKLY', ['week-2026-06-07-R0'], 0), // R0 group (size 1), done → 'all'
      makeAssignment('WEEKLY', ['week-2026-06-03-R3'], 3), // R3 group (size 2), 1 done
      makeAssignment('WEEKLY', [], 3),                     // R3 group, not done
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect(result.weeklyStatus['2026-06-07']).toBe('all')
    expect(result.weeklyStatus['2026-06-03']).toBe('partial')
  })

  // 13. N1.9: null resetDay normalizes to R0 and groups with explicit R0 rules.
  it('weekly: null resetDay groups with R0 → "all" when both complete', () => {
    const assignments = [
      makeAssignment('WEEKLY', ['week-2026-06-07-R0']),    // resetDay omitted → null → 0
      makeAssignment('WEEKLY', ['week-2026-06-07-R0'], 0), // explicit 0
    ]
    const result = computeRuleCalendarStatus(assignments)
    expect(result.weeklyStatus['2026-06-07']).toBe('all')
  })
})
