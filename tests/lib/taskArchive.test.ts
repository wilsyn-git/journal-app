import { describe, it, expect } from 'vitest'
import { isTaskArchivable } from '@/lib/taskArchive'

const start = new Date('2026-06-10T04:00:00.000Z') // midnight ET on 2026-06-10
const yesterday = new Date('2026-06-09T15:00:00.000Z')
const todayLater = new Date('2026-06-10T13:00:00.000Z')

describe('isTaskArchivable', () => {
  it('returns false for a task with no assignments', () => {
    expect(isTaskArchivable([])).toBe(false)
  })

  it('archives a single assignment acknowledged before today', () => {
    expect(isTaskArchivable([{ acknowledgedAt: yesterday, startOfTodayUtc: start }])).toBe(true)
  })

  it('does not archive an assignment acknowledged today', () => {
    expect(isTaskArchivable([{ acknowledgedAt: todayLater, startOfTodayUtc: start }])).toBe(false)
  })

  it('does not archive when acknowledgedAt equals start of today', () => {
    expect(isTaskArchivable([{ acknowledgedAt: start, startOfTodayUtc: start }])).toBe(false)
  })

  it('does not archive when any assignment is unacknowledged', () => {
    expect(isTaskArchivable([
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
      { acknowledgedAt: null, startOfTodayUtc: start },
    ])).toBe(false)
  })

  it('archives only when every assignment is acknowledged before its own today', () => {
    expect(isTaskArchivable([
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
    ])).toBe(true)
  })

  it('does not archive when one assignment was acknowledged today (different tz boundary)', () => {
    expect(isTaskArchivable([
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
      { acknowledgedAt: todayLater, startOfTodayUtc: new Date('2026-06-10T07:00:00.000Z') },
    ])).toBe(false)
  })
})
