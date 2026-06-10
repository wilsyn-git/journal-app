import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { setDayLike } from '@/lib/dayLike'

async function makeEntry(db: TestDb, userId: string, promptId: string, isLiked = false) {
  return db.prisma.journalEntry.create({
    data: { userId, promptId, answer: 'a', isLiked },
  })
}

describe('setDayLike', () => {
  let db: TestDb
  beforeAll(() => { db = createTestDb() })
  afterAll(async () => { await db.cleanup() })

  it('sets every supplied entry to liked, then unliked', async () => {
    const { org, user, prompt, secondPrompt } = await createUserFixture(db.prisma)
    const e1 = await makeEntry(db, user.id, prompt.id)
    const e2 = await makeEntry(db, user.id, secondPrompt.id)

    const onResult = await setDayLike(db.prisma, [e1.id, e2.id], org.id, true)
    expect(onResult.count).toBe(2)
    expect((await db.prisma.journalEntry.findUnique({ where: { id: e1.id } }))!.isLiked).toBe(true)
    expect((await db.prisma.journalEntry.findUnique({ where: { id: e2.id } }))!.isLiked).toBe(true)

    const offResult = await setDayLike(db.prisma, [e1.id, e2.id], org.id, false)
    expect(offResult.count).toBe(2)
    expect((await db.prisma.journalEntry.findUnique({ where: { id: e1.id } }))!.isLiked).toBe(false)
  })

  it('normalizes a mixed-state day to all-liked', async () => {
    const { org, user, prompt, secondPrompt } = await createUserFixture(db.prisma)
    const e1 = await makeEntry(db, user.id, prompt.id, true)
    const e2 = await makeEntry(db, user.id, secondPrompt.id, false)

    await setDayLike(db.prisma, [e1.id, e2.id], org.id, true)
    expect((await db.prisma.journalEntry.findUnique({ where: { id: e2.id } }))!.isLiked).toBe(true)
  })

  it('does not touch entries belonging to another organization', async () => {
    const a = await createUserFixture(db.prisma)
    const b = await createUserFixture(db.prisma) // different org
    const bEntry = await makeEntry(db, b.user.id, b.prompt.id, false)

    // Caller is org A, but passes org B's entry id — must be a no-op.
    const result = await setDayLike(db.prisma, [bEntry.id], a.org.id, true)
    expect(result.count).toBe(0)
    expect((await db.prisma.journalEntry.findUnique({ where: { id: bEntry.id } }))!.isLiked).toBe(false)
  })

  it('is a no-op for an empty entryIds list', async () => {
    const { org } = await createUserFixture(db.prisma)
    const result = await setDayLike(db.prisma, [], org.id, true)
    expect(result.count).toBe(0)
  })
})
