import { describe, it, expect } from 'vitest'
import { validateAvatarFile, validateAvatarBytes, AVATAR_MAX_BYTES } from '@/lib/avatarValidation'

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

describe('validateAvatarBytes', () => {
  it('accepts a buffer with the JPEG SOI marker', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(validateAvatarBytes(buf)).toBeNull()
  })

  it('rejects a PNG buffer', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    expect(validateAvatarBytes(buf)).toBe('File is not a valid JPEG image')
  })

  it('rejects an SVG/HTML buffer', () => {
    const buf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">', 'utf-8')
    expect(validateAvatarBytes(buf)).toBe('File is not a valid JPEG image')
  })

  it('rejects an empty/too-short buffer', () => {
    expect(validateAvatarBytes(Buffer.from([]))).toBe('File is not a valid JPEG image')
    expect(validateAvatarBytes(Buffer.from([0xff, 0xd8]))).toBe('File is not a valid JPEG image')
  })
})
