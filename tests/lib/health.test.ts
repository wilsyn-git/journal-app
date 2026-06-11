import { describe, it, expect } from 'vitest'
import { checkDatabaseHealth } from '@/lib/health'

describe('checkDatabaseHealth', () => {
  it('returns true when the query resolves', async () => {
    const db = { $queryRaw: () => Promise.resolve([{ '1': 1 }]) }
    expect(await checkDatabaseHealth(db)).toBe(true)
  })

  it('returns false when the query rejects', async () => {
    const db = { $queryRaw: () => Promise.reject(new Error('db down')) }
    expect(await checkDatabaseHealth(db)).toBe(false)
  })
})
