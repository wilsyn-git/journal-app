import type { PrismaClient } from '@prisma/client'

/**
 * Enables WAL journal mode (concurrent readers during a write) and a 5s
 * busy_timeout (wait instead of throwing SQLITE_BUSY under write contention).
 * WAL is a persistent, file-level property; busy_timeout is per-connection.
 * Failures are logged, not thrown — the app must still boot on a fresh DB.
 */
export async function applySqlitePragmas(client: PrismaClient): Promise<void> {
  try {
    await client.$queryRawUnsafe('PRAGMA journal_mode=WAL;')
    await client.$queryRawUnsafe('PRAGMA busy_timeout=5000;')
  } catch (e) {
    console.error('Failed to apply SQLite pragmas:', e)
  }
}
