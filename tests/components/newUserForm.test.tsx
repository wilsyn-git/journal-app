// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

vi.mock('@/app/actions/users', () => ({ createUser: vi.fn() }))
const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { NewUserForm } from '@/components/admin/NewUserForm'

afterEach(() => { cleanup(); addToastMock.mockReset() })

function openForm() {
  render(<NewUserForm />)
  fireEvent.click(screen.getByRole('button', { name: /create user/i }))
}

describe('NewUserForm password field', () => {
  it('renders the password field masked by default', () => {
    openForm()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('Show toggles the field to text and back', () => {
    openForm()
    const field = screen.getByLabelText('Password')
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    expect(field).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: /hide/i }))
    expect(field).toHaveAttribute('type', 'password')
  })

  it('Generate fills the field and reveals it', () => {
    openForm()
    const field = screen.getByLabelText('Password') as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: /generate/i }))
    expect(field).toHaveAttribute('type', 'text')
    expect(field.value.length).toBeGreaterThan(0)
  })
})
