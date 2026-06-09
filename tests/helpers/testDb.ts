import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

export type TestDb = {
  prisma: PrismaClient
  cleanup: () => Promise<void>
}

export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'journalAppTest-'))
  const url = `file:${join(dir, 'test.db')}`

  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })

  const prisma = new PrismaClient({ datasources: { db: { url } } })

  return {
    prisma,
    cleanup: async () => {
      await prisma.$disconnect()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
