// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const setTzMock = vi.fn()
vi.mock('@/app/actions/settings', () => ({
  setUserTimezone: (...args: unknown[]) => setTzMock(...args),
}))
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

import { TimezonePicker } from '@/app/settings/TimezonePicker'

afterEach(() => { cleanup(); setTzMock.mockReset() })

function openAndPickLA() {
  fireEvent.click(screen.getByText(/New.York/))
  fireEvent.click(screen.getByRole('button', { name: /Los.Angeles/ }))
}

describe('TimezonePicker preview + confirm (N3.8)', () => {
  it('selecting a timezone shows the confirm bar and does NOT save yet', () => {
    render(<TimezonePicker currentTimezone="America/New_York" />)
    openAndPickLA()
    expect(screen.getByText(/roll over at midnight/i)).toBeInTheDocument()
    expect(setTzMock).not.toHaveBeenCalled()
  })

  it('Confirm saves the pending timezone', async () => {
    setTzMock.mockResolvedValue({ success: true })
    render(<TimezonePicker currentTimezone="America/New_York" />)
    openAndPickLA()
    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }))
    await waitFor(() => expect(setTzMock).toHaveBeenCalledWith('America/Los_Angeles'))
  })

  it('Cancel discards the pending change without saving', () => {
    render(<TimezonePicker currentTimezone="America/New_York" />)
    openAndPickLA()
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }))
    expect(screen.queryByText(/roll over at midnight/i)).not.toBeInTheDocument()
    expect(setTzMock).not.toHaveBeenCalled()
  })
})
