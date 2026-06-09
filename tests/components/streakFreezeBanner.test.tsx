// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const recoveryMock = vi.fn()
vi.mock('@/app/actions/inventory', () => ({
  useStreakRecovery: (...args: unknown[]) => recoveryMock(...args),
}))

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { StreakFreezeBanner } from '@/components/StreakFreezeBanner'

afterEach(() => {
  cleanup()
  recoveryMock.mockReset()
  addToastMock.mockReset()
  refreshMock.mockReset()
})

function renderBanner() {
  return render(
    <StreakFreezeBanner
      missedDays={['2026-06-08']}
      freezesCost={1}
      shieldsCost={0}
      streakAtRisk={12}
    />,
  )
}

describe('StreakFreezeBanner confirm + retry', () => {
  it('first tap asks for confirmation and does not spend', () => {
    renderBanner()
    fireEvent.click(screen.getByText('Recover'))

    expect(screen.getByText(/Confirm: 1 freeze/)).toBeInTheDocument()
    expect(recoveryMock).not.toHaveBeenCalled()
  })

  it('Cancel returns to the Recover button without spending', () => {
    renderBanner()
    fireEvent.click(screen.getByText('Recover'))
    fireEvent.click(screen.getByText('Cancel'))

    expect(screen.getByText('Recover')).toBeInTheDocument()
    expect(recoveryMock).not.toHaveBeenCalled()
  })

  it('Confirm spends and refreshes on success', async () => {
    recoveryMock.mockResolvedValue({ success: true })
    renderBanner()

    fireEvent.click(screen.getByText('Recover'))
    fireEvent.click(screen.getByText(/Confirm: 1 freeze/))

    await waitFor(() => expect(recoveryMock).toHaveBeenCalledWith(['2026-06-08'], 1, 0))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('shows an error toast and restores Recover on failure', async () => {
    recoveryMock.mockResolvedValue({ error: 'Not enough freezes' })
    renderBanner()

    fireEvent.click(screen.getByText('Recover'))
    fireEvent.click(screen.getByText(/Confirm: 1 freeze/))

    await waitFor(() =>
      expect(addToastMock).toHaveBeenCalledWith('error', 'Not enough freezes'),
    )
    expect(refreshMock).not.toHaveBeenCalled()
    expect(screen.getByText('Recover')).toBeInTheDocument()
  })
})
