// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const saveMock = vi.fn()

vi.mock('@/app/actions/journal', () => ({
  saveJournalResponse: (...args: unknown[]) => saveMock(...args),
}))

// PromptCard pulls in app styling concerns; stub it with a labeled textarea.
vi.mock('@/components/PromptCard', () => ({
  PromptCard: ({ prompt, value, onChange }: {
    prompt: { id: string; content: string }
    value?: string
    onChange: (v: string) => void
  }) => (
    <textarea
      aria-label={prompt.content}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

import { JournalEditor } from '@/components/JournalEditor'

const prompts = [
  { id: 'p1', content: 'How was your day?' },
] as never

function typeIntoPrompt(text: string) {
  fireEvent.change(screen.getByLabelText('How was your day?'), { target: { value: text } })
}

describe('JournalEditor save feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    saveMock.mockReset()
  })

  afterEach(() => {
    // Auto-cleanup is not registered (vitest `globals` is off in this project),
    // so unmount the previous render manually to avoid duplicate DOM nodes.
    cleanup()
    vi.useRealTimers()
  })

  it('shows a persistent error with a Retry button when autosave fails', async () => {
    saveMock.mockResolvedValue({ error: 'Failed to auto-save' })
    render(<JournalEditor prompts={prompts} />)

    typeIntoPrompt('my precious entry')
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

    expect(screen.getByText(/save failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()

    // Error must persist, not auto-dismiss after 2 seconds like the old code
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByText(/save failed/i)).toBeInTheDocument()
  })

  it('retries all unsaved prompts when Retry is clicked and shows Saved on success', async () => {
    saveMock.mockResolvedValueOnce({ error: 'Failed to auto-save' })
    saveMock.mockResolvedValue({ success: true, timestamp: new Date().toISOString() })
    render(<JournalEditor prompts={prompts} />)

    typeIntoPrompt('my precious entry')
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(screen.getByText(/save failed/i)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(saveMock).toHaveBeenCalledTimes(2)
    expect(saveMock).toHaveBeenLastCalledWith('p1', 'my precious entry')
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
  })

  it('shows Saved after a successful autosave and keeps it visible', async () => {
    saveMock.mockResolvedValue({ success: true, timestamp: new Date().toISOString() })
    render(<JournalEditor prompts={prompts} />)

    typeIntoPrompt('hello')
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

    expect(screen.getByText(/saved/i)).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
  })

  it('blocks beforeunload while changes are unsaved, allows it once saved', async () => {
    saveMock.mockResolvedValue({ success: true, timestamp: new Date().toISOString() })
    render(<JournalEditor prompts={prompts} />)

    typeIntoPrompt('unsaved text')

    // Debounce still pending -> dirty -> unload must be prevented
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })

    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)
  })

  it('flushes pending debounced saves when the tab becomes hidden', async () => {
    saveMock.mockResolvedValue({ success: true, timestamp: new Date().toISOString() })
    render(<JournalEditor prompts={prompts} />)

    typeIntoPrompt('quick note before switching tabs')
    expect(saveMock).not.toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(10)
    })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

    expect(saveMock).toHaveBeenCalledWith('p1', 'quick note before switching tabs')
  })
})
