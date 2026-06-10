// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const setLikeMock = vi.fn()
vi.mock('@/app/actions/feedback', () => ({
  setJournalDayLike: (...args: unknown[]) => setLikeMock(...args),
}))

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { PastJournalView } from '@/components/PastJournalView'

type E = { id: string; answer: string; isLiked: boolean; prompt: { content: string; type: string } }
function entries(over: Partial<E>[] = []): E[] {
  const base: E[] = [
    { id: 'e1', answer: 'one', isLiked: false, prompt: { content: 'Q1', type: 'TEXT' } },
    { id: 'e2', answer: 'two', isLiked: false, prompt: { content: 'Q2', type: 'TEXT' } },
  ]
  return base.map((b, i) => ({ ...b, ...(over[i] ?? {}) }))
}

afterEach(() => { cleanup(); setLikeMock.mockReset(); addToastMock.mockReset() })

describe('PastJournalView day-like', () => {
  it('renders no per-entry heart and exactly one day-like control for an admin', () => {
    render(<PastJournalView entries={entries()} date="2026-06-09" isAdmin />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('admin: clicking flips optimistically and calls setJournalDayLike with the day ids + true', async () => {
    let resolve!: (v: unknown) => void
    setLikeMock.mockReturnValue(new Promise((r) => { resolve = r }))

    render(<PastJournalView entries={entries()} date="2026-06-09" isAdmin />)
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(setLikeMock).toHaveBeenCalledWith(['e1', 'e2'], true))
    resolve({ success: true })
  })

  it('admin: shows an error toast when the action fails', async () => {
    setLikeMock.mockResolvedValue({ error: 'nope' })
    render(<PastJournalView entries={entries()} date="2026-06-09" isAdmin />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith('error', expect.any(String)))
  })

  it('non-admin + liked day: shows a read-only indicator, not a button', () => {
    render(<PastJournalView entries={entries([{ isLiked: true }])} date="2026-06-09" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText(/liked by your admin/i)).toBeInTheDocument()
  })

  it('non-admin + unliked day: shows no like control at all', () => {
    render(<PastJournalView entries={entries()} date="2026-06-09" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/liked by your admin/i)).toBeNull()
  })
})
