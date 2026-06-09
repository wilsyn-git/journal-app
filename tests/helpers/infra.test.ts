import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from './testDb'
import { createUserFixture } from './fixtures'

describe('test infrastructure', () => {
  let db: TestDb

  beforeAll(() => {
    db = createTestDb()
  })

  afterAll(async () => {
    await db.cleanup()
  })

  it('creates an isolated database with the app schema and fixtures', async () => {
    const { user, prompt } = await createUserFixture(db.prisma)
    const found = await db.prisma.user.findUnique({ where: { id: user.id } })
    expect(found?.email).toBe(user.email)
    expect(prompt.organizationId).toBe(found?.organizationId)
  })
})
