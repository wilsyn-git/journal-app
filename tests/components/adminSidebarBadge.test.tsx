// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))
vi.mock('@/components/BrandingProvider', () => ({ useBranding: () => ({ siteName: 'X', logoUrl: null }) }))

import { AdminSidebar } from '@/components/admin/AdminSidebar'

afterEach(() => cleanup())

describe('AdminSidebar pending-acknowledgement badge', () => {
  it('shows the count badge when there are pending acknowledgements', () => {
    render(<AdminSidebar pendingAcknowledgements={3} />)
    expect(screen.getByTestId('tasks-ack-badge')).toHaveTextContent('3')
  })

  it('renders no badge when count is zero', () => {
    render(<AdminSidebar pendingAcknowledgements={0} />)
    expect(screen.queryByTestId('tasks-ack-badge')).toBeNull()
  })
})
