import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { collectOrgBackup } from '@/lib/export/collectOrgBackup'

function makeDb() {
  const model = () => ({ findMany: vi.fn().mockResolvedValue([]) })
  return {
    organization: { findMany: vi.fn().mockResolvedValue([{ id: 'org1' }]) },
    user: model(),
    profile: model(),
    userGroup: model(),
    prompt: model(),
    promptCategory: model(),
    profileRule: model(),
    journalEntry: model(),
    userAvatar: model(),
    task: model(),
    taskAssignment: model(),
    userAchievement: model(),
    userInventory: model(),
    streakFreezeUsage: model(),
    ruleType: model(),
    rule: model(),
    ruleAssignment: model(),
    ruleCompletion: model(),
  }
}

describe('collectOrgBackup', () => {
  it('returns every expected collection key, including the nested ruleEngine', async () => {
    const db = makeDb()
    const result = await collectOrgBackup(db as unknown as PrismaClient, 'org1')

    for (const key of [
      'organizations', 'users', 'profiles', 'groups', 'prompts', 'categories',
      'rules', 'entries', 'avatars', 'tasks', 'taskAssignments', 'achievements',
      'inventory', 'streakFreezeUsage', 'ruleEngine',
    ]) {
      expect(result).toHaveProperty(key)
    }
    expect(result.ruleEngine).toHaveProperty('ruleTypes')
    expect(result.ruleEngine).toHaveProperty('rules')
    expect(result.ruleEngine).toHaveProperty('ruleAssignments')
    expect(result.ruleEngine).toHaveProperty('ruleCompletions')
  })

  it('scopes each collection to the organization', async () => {
    const db = makeDb()
    await collectOrgBackup(db as unknown as PrismaClient, 'org1')

    expect(db.task.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' } })
    expect(db.taskAssignment.findMany).toHaveBeenCalledWith({ where: { task: { organizationId: 'org1' } } })
    expect(db.userAchievement.findMany).toHaveBeenCalledWith({ where: { user: { organizationId: 'org1' } } })
    expect(db.userInventory.findMany).toHaveBeenCalledWith({ where: { user: { organizationId: 'org1' } } })
    expect(db.streakFreezeUsage.findMany).toHaveBeenCalledWith({ where: { user: { organizationId: 'org1' } } })
    expect(db.ruleType.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' } })
    expect(db.rule.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' } })
    expect(db.ruleAssignment.findMany).toHaveBeenCalledWith({ where: { rule: { organizationId: 'org1' } } })
    expect(db.ruleCompletion.findMany).toHaveBeenCalledWith({ where: { rule: { organizationId: 'org1' } } })
  })

  it('scopes the pre-existing collections to the organization', async () => {
    const db = makeDb()
    await collectOrgBackup(db as unknown as PrismaClient, 'org1')

    expect(db.organization.findMany).toHaveBeenCalledWith({ where: { id: 'org1' } })
    expect(db.profile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org1' } }),
    )
    expect(db.userGroup.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' } })
    expect(db.prompt.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' } })
    expect(db.promptCategory.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org1' } })
    expect(db.profileRule.findMany).toHaveBeenCalledWith({ where: { profile: { organizationId: 'org1' } } })
    expect(db.journalEntry.findMany).toHaveBeenCalledWith({ where: { user: { organizationId: 'org1' } } })
    expect(db.userAvatar.findMany).toHaveBeenCalledWith({ where: { user: { organizationId: 'org1' } } })
  })

  it('omits sensitive fields from the users query', async () => {
    const db = makeDb()
    await collectOrgBackup(db as unknown as PrismaClient, 'org1')

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org1' },
        omit: { password: true, resetToken: true, resetTokenExpiry: true },
      }),
    )
  })
})
