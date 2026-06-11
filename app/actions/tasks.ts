'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { ensureAdmin } from './helpers'
import { auth } from '@/auth'
import { resolveUserId } from '@/lib/auth-helpers'
import { ASSIGNMENT_MODES } from '@/lib/taskConstants'
import { acknowledgeCompletion as ackCompletion, canUncomplete } from '@/lib/taskAcknowledgements'
import { resolveAssignmentUserIds, ASSIGNMENT_INSERT_CHUNK_SIZE } from '@/lib/assignmentTargets'
import { chunk } from '@/lib/chunk'

async function verifyAssignmentOwnership(assignmentId: string, userId: string, orgId: string) {
    const assignment = await prisma.taskAssignment.findUnique({
        where: { id: assignmentId },
        include: { task: true },
    })
    if (!assignment) return { error: 'Assignment not found' }
    if (assignment.task.organizationId !== orgId) return { error: 'Unauthorized' }
    if (assignment.userId !== userId) return { error: 'Unauthorized' }
    return { assignment }
}

// --- TASKS ---

export async function createTask(formData: FormData) {
    const session = await ensureAdmin()
    const organizationId = session.user.organizationId

    const title = formData.get('title') as string
    const description = formData.get('description') as string | null
    const priority = parseInt(formData.get('priority') as string) || 1
    const dueDateRaw = formData.get('dueDate') as string | null
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null
    const assignmentMode = (formData.get('assignmentMode') as string) || ASSIGNMENT_MODES.USER
    const targetId = formData.get('targetId') as string | null

    if (!title) return { error: 'Title required' }

    const createdById = session.user?.id
    if (!createdById) return { error: 'Could not resolve user' }

    try {
        const userIds = await resolveAssignmentUserIds(prisma, assignmentMode, targetId, organizationId)

        await prisma.$transaction(async (tx) => {
            const task = await tx.task.create({
                data: {
                    title,
                    description,
                    priority,
                    dueDate,
                    assignmentMode,
                    groupId: assignmentMode === ASSIGNMENT_MODES.GROUP ? targetId : null,
                    organizationId,
                    createdById,
                },
            })

            if (userIds.length > 0) {
                for (const batch of chunk(userIds, ASSIGNMENT_INSERT_CHUNK_SIZE)) {
                    await tx.taskAssignment.createMany({
                        data: batch.map((userId) => ({
                            taskId: task.id,
                            userId,
                        })),
                    })
                }
            }
        })

        // Send push notifications to assigned users
        if (userIds.length > 0) {
            import('@/lib/api/pushNotifications').then(async ({ sendPushNotification }) => {
                const sessions: { deviceToken: string | null }[] = []
                for (const batch of chunk(userIds, ASSIGNMENT_INSERT_CHUNK_SIZE)) {
                    const rows = await prisma.deviceSession.findMany({
                        where: {
                            userId: { in: batch },
                            deviceToken: { not: null },
                            revokedAt: null,
                        },
                        select: { deviceToken: true },
                    })
                    sessions.push(...rows)
                }
                const tokens = sessions
                    .map((s) => s.deviceToken)
                    .filter((t): t is string => t !== null)
                if (tokens.length > 0) {
                    sendPushNotification(
                        tokens,
                        'myJournal',
                        `New task: ${title}`,
                        { type: 'task_assigned' }
                    )
                }
            })
        }

        revalidatePath('/admin/tasks')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        console.error('Create task error:', e)
        return { error: 'Failed to create task' }
    }
}

export async function updateTask(taskId: string, formData: FormData) {
    const session = await ensureAdmin()
    const organizationId = session.user.organizationId

    const title = formData.get('title') as string
    const description = formData.get('description') as string | null
    const priority = parseInt(formData.get('priority') as string) || 1
    const dueDateRaw = formData.get('dueDate') as string | null
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null
    const assignmentMode = formData.get('assignmentMode') as string | null
    const targetId = formData.get('targetId') as string | null

    try {
        const task = await prisma.task.findUnique({ where: { id: taskId } })
        if (!task || task.organizationId !== organizationId) {
            return { error: 'Task not found' }
        }

        const newUserIds = assignmentMode
            ? await resolveAssignmentUserIds(prisma, assignmentMode, targetId, organizationId)
            : []

        await prisma.$transaction(async (tx) => {
            await tx.task.update({
                where: { id: taskId },
                data: {
                    title,
                    description,
                    priority,
                    dueDate,
                },
            })

            // Additive assignment: only add users who don't already have an assignment
            if (assignmentMode && newUserIds.length > 0) {
                const existing = await tx.taskAssignment.findMany({
                    where: { taskId },
                    select: { userId: true },
                })
                const existingUserIds = new Set(existing.map((a) => a.userId))
                const toCreate = newUserIds.filter((id) => !existingUserIds.has(id))

                if (toCreate.length > 0) {
                    for (const batch of chunk(toCreate, ASSIGNMENT_INSERT_CHUNK_SIZE)) {
                        await tx.taskAssignment.createMany({
                            data: batch.map((userId) => ({
                                taskId,
                                userId,
                            })),
                        })
                    }
                }
            }
        })

        revalidatePath('/admin/tasks')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        console.error('Update task error:', e)
        return { error: 'Failed to update task' }
    }
}

export async function archiveTask(taskId: string) {
    const session = await ensureAdmin()
    const organizationId = session.user.organizationId

    try {
        const task = await prisma.task.findUnique({ where: { id: taskId } })
        if (!task || task.organizationId !== organizationId) {
            return { error: 'Task not found' }
        }

        await prisma.task.update({
            where: { id: taskId },
            data: { archivedAt: new Date() },
        })

        revalidatePath('/admin/tasks')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        console.error('Archive task error:', e)
        return { error: 'Failed to archive task' }
    }
}

export async function unarchiveTask(taskId: string) {
    const session = await ensureAdmin()
    const organizationId = session.user.organizationId

    try {
        const task = await prisma.task.findUnique({ where: { id: taskId } })
        if (!task || task.organizationId !== organizationId) {
            return { error: 'Task not found' }
        }

        await prisma.task.update({
            where: { id: taskId },
            data: { archivedAt: null },
        })

        revalidatePath('/admin/tasks')
        return { success: true }
    } catch (e) {
        console.error('Unarchive task error:', e)
        return { error: 'Failed to unarchive task' }
    }
}

export async function completeTask(assignmentId: string, notes?: string) {
    const session = await auth()
    if (!session?.user) return { error: 'Unauthorized' }

    const userId = await resolveUserId(session)
    if (!userId) return { error: 'Could not resolve user' }

    try {
        const result = await verifyAssignmentOwnership(assignmentId, userId, session.user.organizationId)
        if ('error' in result) return result

        await prisma.taskAssignment.update({
            where: { id: assignmentId },
            data: {
                completedAt: new Date(),
                ...(notes !== undefined && { notes }),
            },
        })

        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        console.error('Complete task error:', e)
        return { error: 'Failed to complete task' }
    }
}

export async function uncompleteTask(assignmentId: string) {
    const session = await auth()
    if (!session?.user) return { error: 'Unauthorized' }

    const userId = await resolveUserId(session)
    if (!userId) return { error: 'Could not resolve user' }

    try {
        const result = await verifyAssignmentOwnership(assignmentId, userId, session.user.organizationId)
        if ('error' in result) return result

        if (!canUncomplete(result.assignment)) {
            return { error: 'This completion has been acknowledged and can no longer be undone' }
        }

        await prisma.taskAssignment.update({
            where: { id: assignmentId },
            data: { completedAt: null },
        })

        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        console.error('Uncomplete task error:', e)
        return { error: 'Failed to uncomplete task' }
    }
}

export async function acknowledgeCompletion(assignmentId: string, note?: string) {
    const session = await ensureAdmin()
    const adminId = session.user?.id
    if (!adminId) return { error: 'Could not resolve user' }

    const result = await ackCompletion(prisma, {
        assignmentId,
        adminId,
        orgId: session.user.organizationId,
        note,
    })
    if ('error' in result) return result

    revalidatePath('/admin')
    revalidatePath('/admin/tasks')
    return { success: true }
}
