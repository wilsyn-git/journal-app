// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

vi.mock('@/app/actions/journal', () => ({
  getDailyJournalDetails: vi.fn(),
}))

import { ContributionHeatmap } from '@/components/ContributionHeatmap'

afterEach(() => cleanup())

// Build a data map: yesterday has activity, the day before has 0.
function ymd(d: Date) { return d.toLocaleDateString('en-CA') }

describe('ContributionHeatmap clickability', () => {
  it('renders activity cells as buttons only when userId is set', () => {
    const today = new Date()
    const y = new Date(today); y.setDate(today.getDate() - 1)
    const data = { [ymd(y)]: 12 }

    const { rerender } = render(<ContributionHeatmap data={data} weeksHistory={4} showLegend={false} />)
    // No userId → no buttons
    expect(screen.queryAllByRole('button')).toHaveLength(0)

    rerender(<ContributionHeatmap data={data} weeksHistory={4} showLegend={false} userId="u1" />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(1)
    // The activity cell is labeled with its date and is a button
    expect(buttons.some(b => (b.getAttribute('aria-label') || '').includes(ymd(y)))).toBe(true)
  })

  it('does not make zero-value days clickable', () => {
    const today = new Date()
    const y = new Date(today); y.setDate(today.getDate() - 1)
    const data = { [ymd(y)]: 0 }
    render(<ContributionHeatmap data={data} weeksHistory={4} showLegend={false} userId="u1" />)
    // Zero-value, no rule data → not a button
    const buttons = screen.queryAllByRole('button')
    expect(buttons.every(b => !(b.getAttribute('aria-label') || '').includes(ymd(y)))).toBe(true)
  })
})
