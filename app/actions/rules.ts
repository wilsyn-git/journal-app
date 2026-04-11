'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { ensureAdmin } from '@/app/actions/helpers'
import { resolveUserId } from '@/lib/auth-helpers'
import { ASSIGNMENT_MODES } from '@/lib/taskConstants'
import { RESET_MODES } from '@/lib/ruleConstants'
import { getPeriodKey } from '@/lib/rules'
import { getUserTimezoneById } from '@/lib/timezone'

// ---------------------------------------------------------------------------
// Shared private helper
// ---------------------------------------------------------------------------

async function resolveAssignmentUserIds(
    assignmentMode: string,
    targetId: string | null,
    organizationId: string
): Promise<string[]> {
    if (assignmentMode === ASSIGNMENT_MODES.USER) {
        return targetId ? [targetId] : []
    }
    if (assignmentMode === ASSIGNMENT_MODES.GROUP) {
        if (!targetId) return []
        const group = await prisma.userGroup.findUnique({
            where: { id: targetId },
            include: { users: { select: { id: true } } },
        })
        return group ? group.users.map((u) => u.id) : []
    }
    if (assignmentMode === ASSIGNMENT_MODES.ALL) {
        const users = await prisma.user.findMany({
            where: { organizationId },
            select: { id: true },
        })
        return users.map((u) => u.id)
    }
    return []
}

// ---------------------------------------------------------------------------
// Rule Type CRUD (Admin)
// ---------------------------------------------------------------------------

export async function createRuleType(formData: FormData) {
    const session = await ensureAdmin()
    const organizationId = session.user.organizationId

    const name = (formData.get('name') as string)?.trim()
    const description = (formData.get('description') as string | null) || null
    const resetMode = (formData.get('resetMode') as string) || RESET_MODES.DAILY
    const resetDayRaw = formData.get('resetDay') as string | null
    const resetDay = resetMode === RESET_MODES.WEEKLY && resetDayRaw !== null
        ? parseInt(resetDayRaw)
        : null
    const resetIntervalDaysRaw = formData.get('resetIntervalDays') as string | null
    const resetIntervalDays = resetMode === RESET_MODES.INTERVAL && resetIntervalDaysRaw
        ? parseInt(resetIntervalDaysRaw)
        : null

    if (!name) return { error: 'Name required' }
    if (!Object.values(RESET_MODES).includes(resetMode as typeof RESET_MODES[keyof typeof RESET_MODES])) {
        return { error: 'Invalid reset mode' }
    }
    if (resetMode === RESET_MODES.INTERVAL && (!resetIntervalDays || resetIntervalDays < 1)) {
        return { error: 'Interval days must be at least 1' }
    }

    try {
        // Check name uniqueness
        const existing = await prisma.ruleType.findUnique({
            where: { organizationId_name: { organizationId, name } },
        })
        if (existing) return { error: 'A rule type with this name already exists' }

        // Auto-increment sortOrder
        const maxOrder = await prisma.ruleType.aggregate({
            where: { organizationId },
            _max: { sortOrder: true },
        })
        const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1

        await prisma.ruleType.create({
            data: {
                name,
                description,
                resetMode,
                resetDay,
                resetIntervalDays,
                resetIntervalStart: resetMode === RESET_MODES.INTERVAL ? new Date() : null,
                organizationId,
                sortOrder,
            },
        })

        revalidatePath('/admin/rules/types')
        return { success: true }
    } catch (e) {
        console.error('Create rule type error:', e)
        return { error: 'Failed to create rule type' }
    }
}

export async function updateRuleType(typeId: string, formData: FormData) {
    const session = await ensureAdmin()
    const organizationId = session.user.organizationId

    const name = (formData.get('name') as string)?.trim()
    const description = (formData.get('description') as string | null) || null
    const resetMode = (formData.get('resetMode') as string) || RESET_MODES.DAILY
    const resetDayRaw = formData.get('resetDay') as string | null
    const resetDay = resetMode === RESET_MODES.WEEKLY && resetDayRaw !== null
        ? parseInt(resetDayRaw)
        : null
    const resetIntervalDaysRaw = formData.get('resetIntervalDays') as string | null
    const resetIntervalDays = resetMode === RESET_MODES.INTERVAL && resetIntervalDaysRaw
        ? parseInt(resetIntervalDaysRaw)
        : null

    if (!name) return { error: 'Name required' }
    if (!Object.values(RESET_MODES).includes(resetMode as typeof RESET_MODES[keyof typeof RESET_MODES])) {
        return { error: 'Invalid reset mode' }
    }
    if (resetMode === RESET_MODES.INTERVAL && (!resetIntervalDays || resetIntervalDays < 1)) {
        return { error: 'Interval days must be at least 1' }
    }

    try {
        // Verify org ownership
        const ruleType = await prisma.ruleType.findUnique({ where: { id: typeId } })
        if (!ruleType || ruleType.organizationId !== organizationId) {
            return { error: 'Rule type not found' }
        }

        // Check name uniqueness (excluding self)
        const existing = await prisma.ruleType.findUnique({
            where: { organizationId_name: { organizationId, name } },
        })
        if (existing && existing.id !== typeId) {
            return { error: 'A rule type with this name already exists' }
        }

        // Keep existing resetIntervalStart if switching to INTERVAL
        const resetIntervalStart = resetMode === RESET_MODES.INTERVAL
            ? (ruleType.resetMode === RESET_MODES.INTERVAL ? ruleType.resetIntervalStart : new Date())
            : null

        await prisma.ruleType.update({
            where: { id: typeId },
            data: {
                name,
                description,
                resetMode,
                resetDay,
                resetIntervalDays,
                resetIntervalStart,
            },
        })

        revalidatePath('/admin/rules/types')
        return { success: true }
    } catch (e) {
        console.error('Update rule type error:', e)
        return { error: 'Failed to update rule type' }
    }
}

export async function deleteRuleType(typeId: string) {
    const session = await ensureAdmin()
    const organizationId = session.user.organizationId

    try {
        // Verify org ownership
        const ruleType = await prisma.ruleType.findUnique({ where: { id: typeId } })
        if (!ruleType || ruleType.organizationId !== organizationId) {
            return { error: 'Rule type not found' }
        }

        // Block if rules exist under this type
        const ruleCount = await prisma.rule.count({ where: { ruleTypeId: typeId } })
        if (ruleCount > 0) {
            return { error: 'Cannot delete a rule type that has rules. Delete the rules first.' }
        }

        await prisma.ruleType.delete({ where: { id: typeId } })

        revalidatePath('/admin/rules/types')
        return { success: true }
    } catch (e) {
        console.error('Delete rule type error:', e)
        return { error: 'Failed to delete rule type' }
    }
}

// ---------------------------------------------------------------------------
// Rule CRUD (Admin)
// ---------------------------------------------------------------------------

export async function createRule(ruleTypeId: string, formData: FormData) {
    const session = await ensureAdmin()
    const organizationId = session.user.organizationId

    const title = (formData.get('title') as string)?.trim()
    const description = (formData.get('description') as string | null) || null
    const assignmentMode = (formData.get('assignmentMode') as string) || ASSIGNMENT_MODES.USER
    const targetId = formData.get('targetId') as string | null

    if (!title) return { error: 'Title required' }

    const createdById = session.user?.id
    if (!createdById) return { error: 'Could not resolve user' }

    try {
        // Verify ruleType belongs to org
        const ruleType = await prisma.ruleType.findUnique({ where: { id: ruleTypeId } })
        if (!ruleType || ruleType.organizationId !== organizationId) {
            return { error: 'Rule type not found' }
        }

        const userIds = await resolveAssignmentUserIds(assignmentMode, targetId, organizationId)

        // Auto-increment sortOrder within type
        const maxOrder = await prisma.rule.aggregate({
            where: { ruleTypeId },
            _max: { sortOrder: true },
        })
        const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1

        await prisma.$transaction(async (tx) => {
            const rule = await tx.rule.create({
                data: {
                    title,
                    description,
                    ruleTypeId,
                    assignmentMode,
                    groupId: assignmentMode === ASSIGNMENT_MODES.GROUP ? targetId : null,
                    organizationId,
                    createdById,
                    sortOrder,
                },
            })

            if (userIds.length > 0) {
                await tx.ruleAssignment.createMany({
                    data: userIds.map((userId) => ({
                        ruleId: rule.id,
                        userId,
                    })),
                })
            }
        })

        revalidatePath(`/admin/rules/types/${ruleTypeId}`)
        revalidatePath('/dashboard')
        revalidatePath('/rules')
        return { success: true }
    } catch (e) {
        console.error('Create rule error:', e)
        return { error: 'Failed to create rule' }
    }
}

export async function updateRule(ruleId: string, ruleTypeId: string, formData: FormData) {
    const session = await ensureAdmin()
    const organizationId = session.user.organizationId

    const title = (formData.get('title') as string)?.trim()
    const description = (formData.get('description') as string | null) || null
    const isActive = formData.get('isActive') === 'true'
    const assignmentMode = formData.get('assignmentMode') as string | null
    const targetId = formData.get('targetId') as string | null

    if (!title) return { error: 'Title required' }

    try {
        // Verify org ownership
        const rule = await prisma.rule.findUnique({ where: { id: ruleId } })
        if (!rule || rule.organizationId !== organizationId) {
            return { error: 'Rule not found' }
        }

        const newUserIds = assignmentMode
            ? await resolveAssignmentUserIds(assignmentMode, targetId, organizationId)
            : []

        await prisma.$transaction(async (tx) => {
            await tx.rule.update({
                where: { id: ruleId },
                data: {
                    title,
                    description,
                    isActive,
                    ...(assignmentMode && {
                        assignmentMode,
                        groupId: assignmentMode === ASSIGNMENT_MODES.GROUP ? targetId : null,
                    }),
                },
            })

            // Additive-only assignments (never remove existing)
            if (assignmentMode && newUserIds.length > 0) {
                const existing = await tx.ruleAssignment.findMany({
                    where: { ruleId },
                    select: { userId: true },
                })
                const existingUserIds = new Set(existing.map((a) => a.userId))
                const toCreate = newUserIds.filter((id) => !existingUserIds.has(id))

                if (toCreate.length > 0) {
                    await tx.ruleAssignment.createMany({
                        data: toCreate.map((userId) => ({
                            ruleId,
                            userId,
                        })),
                    })
                }
            }
        })

        revalidatePath(`/admin/rules/types/${ruleTypeId}`)
        revalidatePath('/dashboard')
        revalidatePath('/rules')
        return { success: true }
    } catch (e) {
        console.error('Update rule error:', e)
        return { error: 'Failed to update rule' }
    }
}

export async function deleteRule(ruleId: string, ruleTypeId: string) {
    const session = await ensureAdmin()
    const organizationId = session.user.organizationId

    try {
        // Verify org ownership
        const rule = await prisma.rule.findUnique({ where: { id: ruleId } })
        if (!rule || rule.organizationId !== organizationId) {
            return { error: 'Rule not found' }
        }

        // Delete — cascade handles assignments/completions
        await prisma.rule.delete({ where: { id: ruleId } })

        revalidatePath(`/admin/rules/types/${ruleTypeId}`)
        revalidatePath('/dashboard')
        revalidatePath('/rules')
        return { success: true }
    } catch (e) {
        console.error('Delete rule error:', e)
        return { error: 'Failed to delete rule' }
    }
}

// ---------------------------------------------------------------------------
// User Completion Toggle
// ---------------------------------------------------------------------------

export async function toggleRuleCompletion(assignmentId: string) {
    const session = await auth()
    if (!session?.user) return { error: 'Unauthorized' }

    const userId = await resolveUserId(session)
    if (!userId) return { error: 'Could not resolve user' }

    try {
        // Verify user owns the assignment
        const assignment = await prisma.ruleAssignment.findUnique({
            where: { id: assignmentId },
            include: {
                rule: {
                    include: { ruleType: true },
                },
            },
        })
        if (!assignment) return { error: 'Assignment not found' }
        if (assignment.userId !== userId) return { error: 'Unauthorized' }

        // Compute periodKey from rule type + user timezone
        const timezone = await getUserTimezoneById(userId)
        const periodKey = getPeriodKey(assignment.rule.ruleType, timezone)

        // Check for existing completion for this period
        const existing = await prisma.ruleCompletion.findUnique({
            where: { ruleAssignmentId_periodKey: { ruleAssignmentId: assignmentId, periodKey } },
        })

        if (existing) {
            // Uncheck: delete the completion
            await prisma.ruleCompletion.delete({ where: { id: existing.id } })
        } else {
            // Check: create the completion
            await prisma.ruleCompletion.create({
                data: {
                    ruleAssignmentId: assignmentId,
                    userId,
                    ruleId: assignment.ruleId,
                    periodKey,
                },
            })
        }

        revalidatePath('/rules')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        console.error('Toggle rule completion error:', e)
        return { error: 'Failed to toggle completion' }
    }
}

// ---------------------------------------------------------------------------
// Pre-seed helper
// ---------------------------------------------------------------------------

export async function ensureDefaultRuleTypes(organizationId: string) {
    try {
        const existing = await prisma.ruleType.findMany({
            where: {
                organizationId,
                name: { in: ['Daily', 'Weekly'] },
            },
            select: { name: true },
        })
        const existingNames = new Set(existing.map((t) => t.name))

        const toCreate: {
            name: string
            resetMode: string
            resetDay: number | null
            sortOrder: number
        }[] = []

        if (!existingNames.has('Daily')) {
            toCreate.push({ name: 'Daily', resetMode: RESET_MODES.DAILY, resetDay: null, sortOrder: 0 })
        }
        if (!existingNames.has('Weekly')) {
            toCreate.push({ name: 'Weekly', resetMode: RESET_MODES.WEEKLY, resetDay: 0, sortOrder: 1 })
        }

        if (toCreate.length > 0) {
            await prisma.ruleType.createMany({
                data: toCreate.map((t) => ({
                    name: t.name,
                    resetMode: t.resetMode,
                    resetDay: t.resetDay,
                    organizationId,
                    sortOrder: t.sortOrder,
                })),
            })
        }

        return { success: true }
    } catch (e) {
        console.error('Ensure default rule types error:', e)
        return { error: 'Failed to ensure default rule types' }
    }
}
