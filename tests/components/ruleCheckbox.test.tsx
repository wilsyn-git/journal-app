// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const toggleMock = vi.fn()
vi.mock('@/app/actions/rules', () => ({
  toggleRuleCompletion: (...args: unknown[]) => toggleMock(...args),
}))

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { RuleCheckbox } from '@/components/RuleCheckbox'

afterEach(() => {
  cleanup()
  toggleMock.mockReset()
  addToastMock.mockReset()
})

function renderBox(isCompleted = false) {
  return render(
    <RuleCheckbox
      assignmentId="a1"
      title="Meditate"
      description={null}
      isCompleted={isCompleted}
      streakCurrent={0}
    />,
  )
}

describe('RuleCheckbox optimistic toggle', () => {
  it('flips to completed immediately, before the server resolves', async () => {
    let resolve!: (v: unknown) => void
    toggleMock.mockReturnValue(new Promise((r) => { resolve = r }))

    renderBox(false)
    expect(screen.getByText('⬜')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button'))

    // Optimistic: the check appears while the action promise is still pending.
    await screen.findByText('✅')
    expect(toggleMock).toHaveBeenCalledWith('a1')

    resolve({ success: true })
  })

  it('reverts and shows an error toast when the action fails', async () => {
    toggleMock.mockResolvedValue({ error: 'nope' })

    renderBox(false)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() =>
      expect(addToastMock).toHaveBeenCalledWith('error', expect.any(String)),
    )
    // Reverted back to the unchecked base state.
    expect(screen.getByText('⬜')).toBeInTheDocument()
  })
})
