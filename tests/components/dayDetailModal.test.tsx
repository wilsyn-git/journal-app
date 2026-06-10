// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { DayDetailModal } from '@/components/stats/DayDetailModal'
import type { DayDetails } from '@/lib/dayDetails'

const details: DayDetails = {
  date: '2026-04-14',
  entries: [{ id: 'e1', answer: 'slept well', isLiked: false, prompt: { content: 'How are you?', type: 'TEXT' } }],
  rules: ['Morning workout'],
  summary: { entryCount: 1, wordCount: 2 },
}

afterEach(() => cleanup())

describe('DayDetailModal', () => {
  it('shows a loading state', () => {
    render(<DayDetailModal date="2026-04-14" details={null} loading onClose={() => {}} />)
    expect(screen.getByTestId('day-modal-loading')).toBeInTheDocument()
  })

  it('renders entries, habits, and summary when loaded', () => {
    render(<DayDetailModal date="2026-04-14" details={details} loading={false} onClose={() => {}} />)
    expect(screen.getByText('How are you?')).toBeInTheDocument()
    expect(screen.getByText('slept well')).toBeInTheDocument()
    expect(screen.getByText('Morning workout')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<DayDetailModal date="2026-04-14" details={details} loading={false} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<DayDetailModal date="2026-04-14" details={details} loading={false} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the modal on open', () => {
    render(<DayDetailModal date="2026-04-14" details={details} loading={false} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveFocus()
  })

  it('restores focus to the previously focused element on close', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'trigger'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(trigger).toHaveFocus()

    const { unmount } = render(<DayDetailModal date="2026-04-14" details={details} loading={false} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toHaveFocus()

    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
