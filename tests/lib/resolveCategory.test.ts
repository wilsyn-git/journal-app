import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { resolveCategory } from '@/lib/categoryUtils'

describe('resolveCategory', () => {
  let db: TestDb
  let orgAId: string
  let orgBId: string
  let orgACategoryId: string
  let orgACategoryName: string
  let orgBCategoryId: string

  beforeAll(async () => {
    db = createTestDb()

    const orgA = await db.prisma.organization.create({
      data: { name: 'Org A', code: `orgA-${randomUUID()}` },
    })
    orgAId = orgA.id

    const orgB = await db.prisma.organization.create({
      data: { name: 'Org B', code: `orgB-${randomUUID()}` },
    })
    orgBId = orgB.id

    orgACategoryName = `Category-A-${randomUUID()}`
    const catA = await db.prisma.promptCategory.create({
      data: { name: orgACategoryName, organizationId: orgAId },
    })
    orgACategoryId = catA.id

    const catB = await db.prisma.promptCategory.create({
      data: { name: `Category-B-${randomUUID()}`, organizationId: orgBId },
    })
    orgBCategoryId = catB.id
  })

  afterAll(async () => {
    await db.cleanup()
  })

  it('same-org categoryId attaches and returns correct name', async () => {
    const result = await resolveCategory(orgAId, orgACategoryId, null, db.prisma)
    expect(result).toEqual({ categoryId: orgACategoryId, categoryString: orgACategoryName })
  })

  it('foreign-org categoryId is NOT attached (security assertion)', async () => {
    const result = await resolveCategory(orgAId, orgBCategoryId, null, db.prisma)
    expect(result).toEqual({ categoryId: null, categoryString: 'General' })
  })

  it('non-existent categoryId returns null and General', async () => {
    const result = await resolveCategory(orgAId, 'non-existent-id', null, db.prisma)
    expect(result).toEqual({ categoryId: null, categoryString: 'General' })
  })

  it('categoryString branch resolves to org-scoped category id', async () => {
    const result = await resolveCategory(orgAId, null, orgACategoryName, db.prisma)
    expect(result).toEqual({ categoryId: orgACategoryId, categoryString: orgACategoryName })
  })
})
