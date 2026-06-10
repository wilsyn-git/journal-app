// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { AcknowledgementToasts } from '@/components/AcknowledgementToasts'

afterEach(() => { cleanup(); addToastMock.mockReset(); vi.useRealTimers() })

describe('AcknowledgementToasts', () => {
  it('fires one toast per item', () => {
    vi.useFakeTimers()
    render(<AcknowledgementToasts items={[
      { assignmentId: 'a1', taskTitle: 'Meds', note: 'Nice', acknowledgedByName: 'Becca' },
      { assignmentId: 'a2', taskTitle: 'Water', note: null, acknowledgedByName: 'Becca' },
    ]} />)
    vi.runAllTimers()
    expect(addToastMock).toHaveBeenCalledTimes(2)
  })

  it('fires nothing for an empty list', () => {
    vi.useFakeTimers()
    render(<AcknowledgementToasts items={[]} />)
    vi.runAllTimers()
    expect(addToastMock).not.toHaveBeenCalled()
  })
})
