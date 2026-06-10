import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { applySqlitePragmas } from '@/lib/sqlitePragmas'

describe('applySqlitePragmas', () => {
  let db: TestDb
  beforeAll(() => { db = createTestDb() })
  afterAll(async () => { await db.cleanup() })

  it('switches the database into WAL journal mode', async () => {
    await applySqlitePragmas(db.prisma)
    const rows = await db.prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode;')
    expect(rows[0].journal_mode.toLowerCase()).toBe('wal')
  })

  it('sets a non-zero busy_timeout', async () => {
    await applySqlitePragmas(db.prisma)
    const rows = await db.prisma.$queryRawUnsafe<Array<{ timeout: number }>>('PRAGMA busy_timeout;')
    expect(Number(rows[0].timeout)).toBe(5000)
  })
})
