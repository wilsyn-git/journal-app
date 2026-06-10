import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { acknowledgeCompletion, canUncomplete } from '@/lib/taskAcknowledgements'

describe('acknowledgeCompletion', () => {
  let db: TestDb
  beforeAll(() => { db = createTestDb() })
  afterAll(async () => { await db.cleanup() })

  async function setup() {
    const { org, user } = await createUserFixture(db.prisma)
    const admin = await db.prisma.user.create({
      data: { email: `admin-${Date.now()}@test.local`, password: 'x', organizationId: org.id, name: 'Becca', role: 'ADMIN' },
    })
    const task = await db.prisma.task.create({ data: { title: 'Meds', organizationId: org.id, createdById: admin.id } })
    const assignment = await db.prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id, completedAt: new Date() },
    })
    return { org, user, admin, task, assignment }
  }

  it('sets acknowledgedAt, acknowledgedById and trimmed note', async () => {
    const { org, admin, assignment } = await setup()
    const res = await acknowledgeCompletion(db.prisma, {
      assignmentId: assignment.id, adminId: admin.id, orgId: org.id, note: '  Nice work!  ',
    })
    expect(res).toEqual({ success: true })
    const after = await db.prisma.taskAssignment.findUnique({ where: { id: assignment.id } })
    expect(after!.acknowledgedAt).not.toBeNull()
    expect(after!.acknowledgedById).toBe(admin.id)
    expect(after!.acknowledgementNote).toBe('Nice work!')
  })

  it('stores null note when note is empty/whitespace', async () => {
    const { org, admin, assignment } = await setup()
    await acknowledgeCompletion(db.prisma, { assignmentId: assignment.id, adminId: admin.id, orgId: org.id, note: '   ' })
    const after = await db.prisma.taskAssignment.findUnique({ where: { id: assignment.id } })
    expect(after!.acknowledgementNote).toBeNull()
  })

  it('caps the note at 280 characters', async () => {
    const { org, admin, assignment } = await setup()
    await acknowledgeCompletion(db.prisma, { assignmentId: assignment.id, adminId: admin.id, orgId: org.id, note: 'x'.repeat(500) })
    const after = await db.prisma.taskAssignment.findUnique({ where: { id: assignment.id } })
    expect(after!.acknowledgementNote!.length).toBe(280)
  })

  it('rejects when the assignment belongs to another org', async () => {
    const { admin, assignment } = await setup()
    const res = await acknowledgeCompletion(db.prisma, {
      assignmentId: assignment.id, adminId: admin.id, orgId: 'some-other-org', note: '',
    })
    expect(res).toEqual({ error: 'Unauthorized' })
  })

  it('rejects when the assignment is not completed', async () => {
    const { org, admin, user } = await setup()
    // Fresh task so the (taskId,userId) unique pair does not collide with setup()'s assignment.
    const t2 = await db.prisma.task.create({ data: { title: 'T2', organizationId: org.id, createdById: admin.id } })
    const incomplete = await db.prisma.taskAssignment.create({ data: { taskId: t2.id, userId: user.id } })
    const res = await acknowledgeCompletion(db.prisma, { assignmentId: incomplete.id, adminId: admin.id, orgId: org.id })
    expect(res).toEqual({ error: 'Task not completed' })
  })

  it('is a no-op success when already acknowledged', async () => {
    const { org, admin, assignment } = await setup()
    await acknowledgeCompletion(db.prisma, { assignmentId: assignment.id, adminId: admin.id, orgId: org.id, note: 'first' })
    const res = await acknowledgeCompletion(db.prisma, { assignmentId: assignment.id, adminId: admin.id, orgId: org.id, note: 'second' })
    expect(res).toEqual({ success: true })
    const after = await db.prisma.taskAssignment.findUnique({ where: { id: assignment.id } })
    expect(after!.acknowledgementNote).toBe('first') // unchanged
  })

  it('returns error for a missing assignment', async () => {
    const { org, admin } = await setup()
    const res = await acknowledgeCompletion(db.prisma, { assignmentId: 'nope', adminId: admin.id, orgId: org.id })
    expect(res).toEqual({ error: 'Assignment not found' })
  })
})

describe('canUncomplete', () => {
  it('allows uncomplete when not acknowledged', () => {
    expect(canUncomplete({ acknowledgedAt: null })).toBe(true)
  })
  it('blocks uncomplete once acknowledged', () => {
    expect(canUncomplete({ acknowledgedAt: new Date() })).toBe(false)
  })
})
