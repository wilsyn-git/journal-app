import { describe, it, expect } from 'vitest'
import { chunk } from '@/lib/chunk'

describe('chunk', () => {
  it('returns an empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([])
  })

  it('splits into groups of the given size with a remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('covers every element exactly once', () => {
    const items = Array.from({ length: 47 }, (_, i) => i)
    const out = chunk(items, 20)
    expect(out.flat()).toEqual(items)
    expect(out.length).toBe(3)
  })

  it('throws on a non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow()
  })
})
