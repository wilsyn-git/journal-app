// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { MidnightRefreshNotice } from '@/components/MidnightRefreshNotice'

describe('MidnightRefreshNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    addToastMock.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows a persistent refresh toast after the TZ day rolls over', () => {
    vi.setSystemTime(new Date('2026-06-09T23:59:50Z'))
    render(<MidnightRefreshNotice timezone="UTC" renderedDay="2026-06-09" />)

    expect(addToastMock).not.toHaveBeenCalled()

    // Advance past midnight UTC (≈10s to midnight + 1s buffer).
    vi.advanceTimersByTime(12_000)

    expect(addToastMock).toHaveBeenCalledTimes(1)
    expect(addToastMock.mock.calls[0][0]).toBe('info')     // toast type
    expect(addToastMock.mock.calls[0][2]).toBe(0)          // persistent (duration 0)
  })

  it('does not toast while still on the rendered day', () => {
    vi.setSystemTime(new Date('2026-06-09T10:00:00Z'))
    render(<MidnightRefreshNotice timezone="UTC" renderedDay="2026-06-09" />)

    vi.advanceTimersByTime(60_000)

    expect(addToastMock).not.toHaveBeenCalled()
  })

  it('uses the target timezone midnight, not UTC (America/New_York)', () => {
    // 03:59:50Z is already 2026-06-10 in UTC, but still 2026-06-09 23:59:50 in New York (EDT, UTC-4).
    vi.setSystemTime(new Date('2026-06-10T03:59:50Z'))
    render(<MidnightRefreshNotice timezone="America/New_York" renderedDay="2026-06-09" />)

    // Nothing yet — it is still June 9 in New York even though it is June 10 in UTC.
    expect(addToastMock).not.toHaveBeenCalled()

    // Advance ~12s to cross local NY midnight (04:00:02Z = 00:00:02 EDT).
    vi.advanceTimersByTime(12_000)

    expect(addToastMock).toHaveBeenCalledTimes(1)
    expect(addToastMock.mock.calls[0][0]).toBe('info')
    expect(addToastMock.mock.calls[0][2]).toBe(0)
  })
})
