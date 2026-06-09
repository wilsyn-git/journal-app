// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const toggleMock = vi.fn()
vi.mock('@/app/actions/rules', () => ({
  toggleRuleCompletion: (...args: unknown[]) => toggleMock(...args),
}))

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { DailyRulesCard } from '@/components/DailyRulesCard'

afterEach(() => {
  cleanup()
  toggleMock.mockReset()
  addToastMock.mockReset()
})

describe('DailyRulesCard optimistic toggle', () => {
  it('flips a row to completed immediately on tap', async () => {
    let resolve!: (v: unknown) => void
    toggleMock.mockReturnValue(new Promise((r) => { resolve = r }))

    render(<DailyRulesCard rules={[{ assignmentId: 'a1', title: 'Stretch', isCompleted: false }]} />)
    expect(screen.getByText('⬜')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Stretch/ }))

    await screen.findByText('✅')
    expect(toggleMock).toHaveBeenCalledWith('a1')
    resolve({ success: true })
  })
})
