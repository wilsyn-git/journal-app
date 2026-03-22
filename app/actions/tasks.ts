'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { ensureAdmin } from './helpers'
import { auth } from '@/auth'
import { resolveUserId } from '@/lib/auth-helpers'
import { ASSIGNMENT_MODES } from '@/lib/taskConstants'

// --- TASKS ---

export async function createTask(formData: FormData) {
    const session = await ensureAdmin()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string

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
        // Resolve user IDs for assignments
        let userIds: string[] = []

        if (assignmentMode === ASSIGNMENT_MODES.USER) {
            if (targetId) userIds = [targetId]
        } else if (assignmentMode === ASSIGNMENT_MODES.GROUP) {
            if (targetId) {
                const group = await prisma.userGroup.findUnique({
                    where: { id: targetId },
                    include: { users: { select: { id: true } } },
                })
                if (group) {
                    userIds = group.users.map((u) => u.id)
                }
            }
        } else if (assignmentMode === ASSIGNMENT_MODES.ALL) {
            const users = await prisma.user.findMany({
                where: { organizationId },
                select: { id: true },
            })
            userIds = users.map((u) => u.id)
        }

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
                await tx.taskAssignment.createMany({
                    data: userIds.map((userId) => ({
                        taskId: task.id,
                        userId,
                    })),
                })
            }
        })

        // Send push notifications to assigned users
        if (userIds.length > 0) {
            import('@/lib/api/pushNotifications').then(async ({ sendPushNotification }) => {
                const sessions = await prisma.deviceSession.findMany({
                    where: {
                        userId: { in: userIds },
                        deviceToken: { not: null },
                        revokedAt: null,
                    },
                    select: { deviceToken: true },
                })
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string

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

        // Resolve new user IDs if assignment info provided
        let newUserIds: string[] = []

        if (assignmentMode) {
            if (assignmentMode === ASSIGNMENT_MODES.USER) {
                if (targetId) newUserIds = [targetId]
            } else if (assignmentMode === ASSIGNMENT_MODES.GROUP) {
                if (targetId) {
                    const group = await prisma.userGroup.findUnique({
                        where: { id: targetId },
                        include: { users: { select: { id: true } } },
                    })
                    if (group) {
                        newUserIds = group.users.map((u) => u.id)
                    }
                }
            } else if (assignmentMode === ASSIGNMENT_MODES.ALL) {
                const users = await prisma.user.findMany({
                    where: { organizationId },
                    select: { id: true },
                })
                newUserIds = users.map((u) => u.id)
            }
        }

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
                    await tx.taskAssignment.createMany({
                        data: toCreate.map((userId) => ({
                            taskId,
                            userId,
                        })),
                    })
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string

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
        const assignment = await prisma.taskAssignment.findUnique({
            where: { id: assignmentId },
            include: { task: true },
        })

        if (!assignment) return { error: 'Assignment not found' }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orgId = (session.user as any)?.organizationId as string
        if (assignment.task.organizationId !== orgId) {
            return { error: 'Unauthorized' }
        }
        if (assignment.userId !== userId) {
            return { error: 'Unauthorized' }
        }

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
        const assignment = await prisma.taskAssignment.findUnique({
            where: { id: assignmentId },
            include: { task: true },
        })

        if (!assignment) return { error: 'Assignment not found' }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orgId = (session.user as any)?.organizationId as string
        if (assignment.task.organizationId !== orgId) {
            return { error: 'Unauthorized' }
        }
        if (assignment.userId !== userId) {
            return { error: 'Unauthorized' }
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
