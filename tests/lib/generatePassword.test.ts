import { describe, it, expect } from 'vitest'
import { generatePassword, CHARSET } from '@/lib/generatePassword'

describe('generatePassword', () => {
  it('returns a string of the requested length', () => {
    expect(generatePassword(16, (n) => Array(n).fill(0))).toHaveLength(16)
    expect(generatePassword(24, (n) => Array(n).fill(0))).toHaveLength(24)
  })

  it('defaults to length 16', () => {
    expect(generatePassword(undefined, (n) => Array(n).fill(0))).toHaveLength(16)
  })

  it('maps each random int to charset[int % charset.length]', () => {
    const pw = generatePassword(3, () => [0, 1, 2])
    expect(pw).toBe(CHARSET.slice(0, 3))
  })

  it('only produces characters from the charset (real RNG)', () => {
    const pw = generatePassword(64)
    for (const ch of pw) expect(CHARSET).toContain(ch)
  })

  it('produces different output for different random inputs', () => {
    const a = generatePassword(8, () => [0, 0, 0, 0, 0, 0, 0, 0])
    const b = generatePassword(8, () => [1, 1, 1, 1, 1, 1, 1, 1])
    expect(a).not.toBe(b)
  })
})
