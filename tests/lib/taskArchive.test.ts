import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { isTaskArchivable } from '@/lib/taskArchive'
import { createTestDb, type TestDb } from '../helpers/testDb'
import { createUserFixture } from '../helpers/fixtures'
import { archiveAcknowledgedTasks } from '@/lib/taskArchive'

const start = new Date('2026-06-10T04:00:00.000Z') // midnight ET on 2026-06-10
const yesterday = new Date('2026-06-09T15:00:00.000Z')
const todayLater = new Date('2026-06-10T13:00:00.000Z')

describe('isTaskArchivable', () => {
  it('returns false for a task with no assignments', () => {
    expect(isTaskArchivable([])).toBe(false)
  })

  it('archives a single assignment acknowledged before today', () => {
    expect(isTaskArchivable([{ acknowledgedAt: yesterday, startOfTodayUtc: start }])).toBe(true)
  })

  it('does not archive an assignment acknowledged today', () => {
    expect(isTaskArchivable([{ acknowledgedAt: todayLater, startOfTodayUtc: start }])).toBe(false)
  })

  it('does not archive when acknowledgedAt equals start of today', () => {
    expect(isTaskArchivable([{ acknowledgedAt: start, startOfTodayUtc: start }])).toBe(false)
  })

  it('does not archive when any assignment is unacknowledged', () => {
    expect(isTaskArchivable([
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
      { acknowledgedAt: null, startOfTodayUtc: start },
    ])).toBe(false)
  })

  it('archives only when every assignment is acknowledged before its own today', () => {
    expect(isTaskArchivable([
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
    ])).toBe(true)
  })

  it('does not archive when one assignment was acknowledged today (different tz boundary)', () => {
    expect(isTaskArchivable([
      { acknowledgedAt: yesterday, startOfTodayUtc: start },
      { acknowledgedAt: todayLater, startOfTodayUtc: new Date('2026-06-10T07:00:00.000Z') },
    ])).toBe(false)
  })
})

describe('archiveAcknowledgedTasks', () => {
  let db: TestDb
  beforeAll(() => { db = createTestDb() })
  afterAll(async () => { await db.cleanup() })

  async function makeTask(prisma: TestDb['prisma'], orgId: string, createdById: string) {
    return prisma.task.create({ data: { title: 'T', organizationId: orgId, createdById } })
  }

  it('archives a task whose only assignment was acknowledged yesterday', async () => {
    const { org, user } = await createUserFixture(db.prisma)
    const task = await makeTask(db.prisma, org.id, user.id)
    await db.prisma.taskAssignment.create({
      data: {
        taskId: task.id, userId: user.id,
        completedAt: new Date('2026-06-09T15:00:00.000Z'),
        acknowledgedAt: new Date('2020-01-01T00:00:00.000Z'), // long ago → before today
      },
    })

    const count = await archiveAcknowledgedTasks(db.prisma, org.id)
    expect(count).toBe(1)
    const after = await db.prisma.task.findUnique({ where: { id: task.id } })
    expect(after!.archivedAt).not.toBeNull()
  })

  it('does not archive a task acknowledged just now (today)', async () => {
    const { org, user } = await createUserFixture(db.prisma)
    const task = await makeTask(db.prisma, org.id, user.id)
    await db.prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id, completedAt: new Date(), acknowledgedAt: new Date() },
    })

    const count = await archiveAcknowledgedTasks(db.prisma, org.id)
    expect(count).toBe(0)
    const after = await db.prisma.task.findUnique({ where: { id: task.id } })
    expect(after!.archivedAt).toBeNull()
  })

  it('does not archive a multi-assignee task until all are acknowledged', async () => {
    const { org, user } = await createUserFixture(db.prisma)
    const second = await db.prisma.user.create({
      data: { email: `u2-${Date.now()}@test.local`, password: 'x', organizationId: org.id },
    })
    const task = await makeTask(db.prisma, org.id, user.id)
    await db.prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id, completedAt: new Date(), acknowledgedAt: new Date('2020-01-01T00:00:00.000Z') },
    })
    await db.prisma.taskAssignment.create({
      data: { taskId: task.id, userId: second.id, completedAt: new Date() }, // not acknowledged
    })

    const count = await archiveAcknowledgedTasks(db.prisma, org.id)
    expect(count).toBe(0)
  })

  it('ignores already-archived tasks and tasks with no acknowledgements', async () => {
    const { org, user } = await createUserFixture(db.prisma)
    const task = await makeTask(db.prisma, org.id, user.id)
    await db.prisma.taskAssignment.create({
      data: { taskId: task.id, userId: user.id, completedAt: new Date() }, // completed, not acknowledged
    })
    const count = await archiveAcknowledgedTasks(db.prisma, org.id)
    expect(count).toBe(0)
  })
})
