import { describe, it, expect } from 'vitest'
import { checkDatabaseHealth, type HealthCheckDb } from '@/lib/health'

describe('checkDatabaseHealth', () => {
  it('returns true when the query resolves', async () => {
    const db: HealthCheckDb = { $queryRaw: () => Promise.resolve([{ '1': 1 }]) }
    expect(await checkDatabaseHealth(db)).toBe(true)
  })

  it('returns false when the query rejects', async () => {
    const db: HealthCheckDb = { $queryRaw: () => Promise.reject(new Error('db down')) }
    expect(await checkDatabaseHealth(db)).toBe(false)
  })
})
