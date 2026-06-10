// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const updateProfileMock = vi.fn()
vi.mock('@/app/actions/settings', () => ({
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
}))
const addToastMock = vi.fn()
vi.mock('@/components/providers/ToastProvider', () => ({
  useToast: () => ({ addToast: addToastMock }),
}))

import { ProfileForm } from '@/app/settings/ProfileForm'

afterEach(() => { cleanup(); updateProfileMock.mockReset(); addToastMock.mockReset() })

function renderForm() {
  return render(
    <ProfileForm userId="u1" activeAvatar={null} initialName="Sam" initialEmail="s@x.com" initialBio={null} />
  )
}

describe('ProfileForm error handling', () => {
  it('shows the specific error toast when updateProfile returns { error }', async () => {
    updateProfileMock.mockResolvedValue({ error: 'Only JPG images are allowed' })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith('error', 'Only JPG images are allowed'))
  })

  it('shows the success toast when updateProfile succeeds', async () => {
    updateProfileMock.mockResolvedValue({ success: true })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith('success', 'Profile updated successfully'))
  })
})
