import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { acknowledgeCompletion, canUncomplete } from '@/lib/taskAcknowledgements'
import { getPendingAcknowledgements, countPendingAcknowledgements, getAndMarkAcknowledgements } from '@/lib/taskAcknowledgements'

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

describe('pending acknowledgement queries', () => {
  let db: TestDb
  beforeAll(() => { db = createTestDb() })
  afterAll(async () => { await db.cleanup() })

  async function seed() {
    const { org, user } = await createUserFixture(db.prisma)
    const admin = await db.prisma.user.create({
      data: { email: `adm-${Date.now()}@test.local`, password: 'x', organizationId: org.id, name: 'Becca', role: 'ADMIN' },
    })
    const t1 = await db.prisma.task.create({ data: { title: 'Completed-unacked', organizationId: org.id, createdById: admin.id } })
    const a1 = await db.prisma.taskAssignment.create({ data: { taskId: t1.id, userId: user.id, completedAt: new Date() } })
    const t2 = await db.prisma.task.create({ data: { title: 'Not-completed', organizationId: org.id, createdById: admin.id } })
    await db.prisma.taskAssignment.create({ data: { taskId: t2.id, userId: user.id } })
    return { org, user, admin, t1, a1 }
  }

  it('getPendingAcknowledgements returns only completed-and-unacknowledged items', async () => {
    const { org, t1 } = await seed()
    const pending = await getPendingAcknowledgements(db.prisma, org.id)
    expect(pending).toHaveLength(1)
    expect(pending[0].taskTitle).toBe('Completed-unacked')
    expect(pending[0].taskId).toBe(t1.id)
    expect(pending[0].userName).toBeTruthy()
  })

  it('countPendingAcknowledgements matches the queue length', async () => {
    const { org } = await seed()
    expect(await countPendingAcknowledgements(db.prisma, org.id)).toBe(1)
  })

  it('count excludes archived tasks', async () => {
    const { org, t1 } = await seed()
    await db.prisma.task.update({ where: { id: t1.id }, data: { archivedAt: new Date() } })
    expect(await countPendingAcknowledgements(db.prisma, org.id)).toBe(0)
  })

  it('getAndMarkAcknowledgements returns acknowledged-but-unnotified items and stamps userNotifiedAt', async () => {
    const { org, user, admin, a1 } = await seed()
    await acknowledgeCompletion(db.prisma, { assignmentId: a1.id, adminId: admin.id, orgId: org.id, note: 'Great job' })

    const first = await getAndMarkAcknowledgements(db.prisma, user.id)
    expect(first).toHaveLength(1)
    expect(first[0].taskTitle).toBe('Completed-unacked')
    expect(first[0].note).toBe('Great job')
    expect(first[0].acknowledgedByName).toBe('Becca')

    // Second call returns nothing — already notified
    const second = await getAndMarkAcknowledgements(db.prisma, user.id)
    expect(second).toHaveLength(0)
  })
})
