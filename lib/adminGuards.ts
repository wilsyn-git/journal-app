import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import type { Session } from 'next-auth'

/** Throws unless the session belongs to an ADMIN. */
export async function requireAdminSession(): Promise<Session> {
    const session = await auth()
    if (session?.user?.role !== 'ADMIN') {
        throw new Error('Unauthorized: Admin access required')
    }
    return session
}

/** Throws unless the admin and the target user share an organization. */
export async function requireAdminForUser(targetUserId: string): Promise<Session> {
    const session = await requireAdminSession()
    const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { organizationId: true },
    })
    if (!target || target.organizationId !== session.user.organizationId) {
        throw new Error('Unauthorized: User not found in your organization')
    }
    return session
}

/** Throws unless the admin and the target group share an organization. */
export async function requireAdminForGroup(groupId: string): Promise<Session> {
    const session = await requireAdminSession()
    const target = await prisma.userGroup.findUnique({
        where: { id: groupId },
        select: { organizationId: true },
    })
    if (!target || target.organizationId !== session.user.organizationId) {
        throw new Error('Unauthorized: Group not found in your organization')
    }
    return session
}

/** Throws unless ALL given prompts belong to the admin's organization. */
export async function requireAdminForPrompts(promptIds: string[]): Promise<Session> {
    const session = await requireAdminSession()
    // Dedupe so repeated IDs don't deflate the count below the distinct-rows the
    // DB returns (which would falsely reject an otherwise-valid request).
    const uniqueIds = [...new Set(promptIds)]
    const count = await prisma.prompt.count({
        where: { id: { in: uniqueIds }, organizationId: session.user.organizationId },
    })
    if (count !== uniqueIds.length) {
        throw new Error('Unauthorized: Prompt not found in your organization')
    }
    return session
}

/** Throws unless the admin and the target prompt category share an organization. */
export async function requireAdminForCategory(categoryId: string): Promise<Session> {
    const session = await requireAdminSession()
    const target = await prisma.promptCategory.findUnique({
        where: { id: categoryId },
        select: { organizationId: true },
    })
    if (!target || target.organizationId !== session.user.organizationId) {
        throw new Error('Unauthorized: Category not found in your organization')
    }
    return session
}
