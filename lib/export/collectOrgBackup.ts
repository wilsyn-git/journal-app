import type { PrismaClient } from '@prisma/client'

/**
 * Gathers a complete, organization-scoped backup of all persistent, non-sensitive
 * models (#79a). Returns the plain `data` object only — no `meta`, and no
 * filesystem/base64 work (logo/avatar enrichment stays in the route). Pure DB
 * access so it can be unit-tested with a mocked Prisma client.
 *
 * `rules` is the legacy `ProfileRule` model (kept for backward compatibility);
 * the newer rule engine is nested under `ruleEngine` to avoid the name clash.
 * DeviceSession is intentionally excluded (ephemeral push tokens + secrets).
 */
export async function collectOrgBackup(db: PrismaClient, organizationId: string) {
    const organizations = await db.organization.findMany({ where: { id: organizationId } })

    const users = await db.user.findMany({
        where: { organizationId },
        omit: { password: true, resetToken: true, resetTokenExpiry: true },
        include: { profiles: { select: { id: true } }, groups: { select: { id: true } } },
    })

    const profiles = await db.profile.findMany({
        where: { organizationId },
        include: { groups: { select: { id: true } } },
    })

    const groups = await db.userGroup.findMany({ where: { organizationId } })
    const prompts = await db.prompt.findMany({ where: { organizationId } })
    const categories = await db.promptCategory.findMany({ where: { organizationId } })
    const rules = await db.profileRule.findMany({ where: { profile: { organizationId } } })
    const entries = await db.journalEntry.findMany({ where: { user: { organizationId } } })
    const avatars = await db.userAvatar.findMany({ where: { user: { organizationId } } })

    const tasks = await db.task.findMany({ where: { organizationId } })
    const taskAssignments = await db.taskAssignment.findMany({ where: { task: { organizationId } } })
    const achievements = await db.userAchievement.findMany({ where: { user: { organizationId } } })
    const inventory = await db.userInventory.findMany({ where: { user: { organizationId } } })
    const streakFreezeUsage = await db.streakFreezeUsage.findMany({ where: { user: { organizationId } } })

    const ruleTypes = await db.ruleType.findMany({ where: { organizationId } })
    const engineRules = await db.rule.findMany({ where: { organizationId } })
    const ruleAssignments = await db.ruleAssignment.findMany({ where: { rule: { organizationId } } })
    const ruleCompletions = await db.ruleCompletion.findMany({ where: { rule: { organizationId } } })

    return {
        organizations,
        users,
        profiles,
        groups,
        prompts,
        categories,
        rules,
        entries,
        avatars,
        tasks,
        taskAssignments,
        achievements,
        inventory,
        streakFreezeUsage,
        ruleEngine: {
            ruleTypes,
            rules: engineRules,
            ruleAssignments,
            ruleCompletions,
        },
    }
}

/** Shape of the export `data` object. Inferred so it always matches the query selections (used by #79b restore). */
export type OrgBackupData = Awaited<ReturnType<typeof collectOrgBackup>>
