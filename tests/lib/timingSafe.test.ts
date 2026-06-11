import { describe, it, expect } from 'vitest'
import { safeSecretCompare } from '@/lib/api/timingSafe'

describe('safeSecretCompare', () => {
  it('returns true for equal non-empty strings', () => {
    expect(safeSecretCompare('s3cret-value', 's3cret-value')).toBe(true)
  })

  it('returns false for different values of equal length', () => {
    expect(safeSecretCompare('s3cret-value', 's3cret-VALUE')).toBe(false)
  })

  it('returns false for different-length values', () => {
    expect(safeSecretCompare('short', 'a-much-longer-secret')).toBe(false)
  })

  it('returns false when either side is null/undefined/empty', () => {
    expect(safeSecretCompare(null, 'x')).toBe(false)
    expect(safeSecretCompare('x', undefined)).toBe(false)
    expect(safeSecretCompare('', '')).toBe(false)
  })
})
