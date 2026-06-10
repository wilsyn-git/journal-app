import { describe, it, expect } from 'vitest'
import { buildDayDetails, type DayEntry } from '@/lib/dayDetails'

function entry(over: Partial<DayEntry> = {}): DayEntry {
  return { id: 'e1', answer: 'hello world', isLiked: false, prompt: { content: 'Q', type: 'TEXT' }, ...over }
}

describe('buildDayDetails', () => {
  it('passes entries through and carries the date', () => {
    const e = entry()
    const result = buildDayDetails([e], [], '2026-04-14')
    expect(result.date).toBe('2026-04-14')
    expect(result.entries).toEqual([e])
  })

  it('maps rule titles into rules and counts habits', () => {
    const result = buildDayDetails([], ['Morning workout', 'No phone before noon'], '2026-04-14')
    expect(result.rules).toEqual(['Morning workout', 'No phone before noon'])
  })

  it('summary counts entries and total words across answers', () => {
    const result = buildDayDetails(
      [entry({ id: 'a', answer: 'one two three' }), entry({ id: 'b', answer: 'four' })],
      [],
      '2026-04-14',
    )
    expect(result.summary.entryCount).toBe(2)
    expect(result.summary.wordCount).toBe(4)
  })

  it('ignores empty/whitespace answers in the word count', () => {
    const result = buildDayDetails(
      [entry({ id: 'a', answer: '   ' }), entry({ id: 'b', answer: 'solo' })],
      [],
      '2026-04-14',
    )
    expect(result.summary.entryCount).toBe(2)
    expect(result.summary.wordCount).toBe(1)
  })
})
