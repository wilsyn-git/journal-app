import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  resolveAssignmentUserIds,
  ASSIGNMENT_INSERT_CHUNK_SIZE,
  LARGE_ASSIGNMENT_WARN_THRESHOLD,
  type AssignmentTargetsDb,
} from '@/lib/assignmentTargets'
import { ASSIGNMENT_MODES } from '@/lib/taskConstants'

afterEach(() => {
  vi.restoreAllMocks()
})

// Build a mock db. `groupUsers` are returned by userGroup.findUnique (null if
// `groupExists` is false); `orgUsers` are returned by user.findMany.
function makeDb(opts: {
  groupExists?: boolean
  groupUsers?: string[]
  orgUsers?: string[]
}): AssignmentTargetsDb {
  return {
    userGroup: {
      findUnique: async () =>
        opts.groupExists === false
          ? null
          : { users: (opts.groupUsers ?? []).map((id) => ({ id })) },
    },
    user: {
      findMany: async () => (opts.orgUsers ?? []).map((id) => ({ id })),
    },
  }
}

describe('resolveAssignmentUserIds', () => {
  it('USER mode returns [targetId]', async () => {
    const ids = await resolveAssignmentUserIds(makeDb({}), ASSIGNMENT_MODES.USER, 'u1', 'org1')
    expect(ids).toEqual(['u1'])
  })

  it('USER mode with null targetId returns []', async () => {
    const ids = await resolveAssignmentUserIds(makeDb({}), ASSIGNMENT_MODES.USER, null, 'org1')
    expect(ids).toEqual([])
  })

  it('GROUP mode returns the group member ids', async () => {
    const db = makeDb({ groupExists: true, groupUsers: ['a', 'b', 'c'] })
    const ids = await resolveAssignmentUserIds(db, ASSIGNMENT_MODES.GROUP, 'g1', 'org1')
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('GROUP mode with null targetId returns []', async () => {
    const ids = await resolveAssignmentUserIds(makeDb({}), ASSIGNMENT_MODES.GROUP, null, 'org1')
    expect(ids).toEqual([])
  })

  it('GROUP mode returns [] when the group is not found', async () => {
    const db = makeDb({ groupExists: false })
    const ids = await resolveAssignmentUserIds(db, ASSIGNMENT_MODES.GROUP, 'missing', 'org1')
    expect(ids).toEqual([])
  })

  it('ALL mode returns all org user ids', async () => {
    const db = makeDb({ orgUsers: ['x', 'y'] })
    const ids = await resolveAssignmentUserIds(db, ASSIGNMENT_MODES.ALL, null, 'org1')
    expect(ids).toEqual(['x', 'y'])
  })

  it('ALL mode logs the count at info level when at/under threshold', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = makeDb({ orgUsers: ['x', 'y', 'z'] })
    await resolveAssignmentUserIds(db, ASSIGNMENT_MODES.ALL, null, 'org1')
    expect(info).toHaveBeenCalledTimes(1)
    expect(info.mock.calls[0][0]).toContain('3')
    expect(info.mock.calls[0][0]).toContain('org1')
    expect(warn).not.toHaveBeenCalled()
  })

  it('ALL mode warns (not info) when over threshold', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const orgUsers = Array.from({ length: LARGE_ASSIGNMENT_WARN_THRESHOLD + 1 }, (_, i) => `u${i}`)
    const db = makeDb({ orgUsers })
    const ids = await resolveAssignmentUserIds(db, ASSIGNMENT_MODES.ALL, null, 'org1')
    expect(ids).toHaveLength(LARGE_ASSIGNMENT_WARN_THRESHOLD + 1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(info).not.toHaveBeenCalled()
  })

  it('ALL mode at exactly the threshold logs info, not warn', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const orgUsers = Array.from({ length: LARGE_ASSIGNMENT_WARN_THRESHOLD }, (_, i) => `u${i}`)
    const db = makeDb({ orgUsers })
    const ids = await resolveAssignmentUserIds(db, ASSIGNMENT_MODES.ALL, null, 'org1')
    expect(ids).toHaveLength(LARGE_ASSIGNMENT_WARN_THRESHOLD)
    expect(info).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('unknown mode returns []', async () => {
    const ids = await resolveAssignmentUserIds(makeDb({}), 'BOGUS', 't', 'org1')
    expect(ids).toEqual([])
  })

  it('exposes sane constants', () => {
    expect(ASSIGNMENT_INSERT_CHUNK_SIZE).toBe(200)
    expect(LARGE_ASSIGNMENT_WARN_THRESHOLD).toBe(1000)
  })
})
