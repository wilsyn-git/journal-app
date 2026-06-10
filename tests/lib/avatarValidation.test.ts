import { describe, it, expect } from 'vitest'
import { validateAvatarFile, AVATAR_MAX_BYTES } from '@/lib/avatarValidation'

describe('validateAvatarFile', () => {
  it('accepts a JPEG under the size limit', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: 1000 })).toBeNull()
  })

  it('accepts a JPEG exactly at the limit', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: AVATAR_MAX_BYTES })).toBeNull()
  })

  it('rejects non-JPEG images', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 1000 })).toBe('Only JPG images are allowed')
    expect(validateAvatarFile({ type: 'image/gif', size: 1000 })).toBe('Only JPG images are allowed')
  })

  it('rejects a JPEG over the size limit', () => {
    expect(validateAvatarFile({ type: 'image/jpeg', size: AVATAR_MAX_BYTES + 1 })).toBe('Image must be smaller than 2MB')
  })
})
