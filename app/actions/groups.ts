'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { ensureAdmin } from './helpers'
import { requireAdminForGroup, requireAdminForProfiles } from '@/lib/adminGuards'

// Enhanced createGroup to handle initial profile and users
export async function createGroup(formData: FormData) {
    const session = await ensureAdmin();
    const organizationId = session.user.organizationId;

    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const profileId = formData.get('profileId') as string;

    const initialEmails = formData.getAll('initialUsers') as string[];

    if (profileId) {
        await requireAdminForProfiles([profileId]);
    }

    try {
        await prisma.userGroup.create({
            data: {
                name,
                description,
                organizationId,
                profiles: profileId ? {
                    connect: { id: profileId }
                } : undefined,
                users: initialEmails.length > 0 ? {
                    connect: initialEmails.map(email => ({ email }))
                } : undefined
            }
        });
        revalidatePath('/admin/groups');
        return { success: true }
    } catch (e) {
        console.error("Create Group Error:", e);
        return { error: 'Failed' }
    }
}

export async function updateUserGroup(id: string, formData: FormData) {
    await requireAdminForGroup(id);
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    try {
        await prisma.userGroup.update({
            where: { id },
            data: {
                name,
                description
            }
        })
        revalidatePath(`/admin/groups/${id}`);
        revalidatePath('/admin/groups');
        return { success: true }
    } catch (e) {
        console.error("Update Group Error:", e);
        return { error: 'Failed to update group' }
    }
}

export async function deleteGroup(id: string) {
    await requireAdminForGroup(id);
    try {
        await prisma.userGroup.delete({ where: { id } });
        revalidatePath('/admin/groups');
    } catch (e) {
        console.error("Delete Group Error:", e);
    }
}

export async function updateGroupProfiles(groupId: string, formData: FormData) {
    await requireAdminForGroup(groupId);
    const profileId = formData.get('profileId') as string;

    const dataToUpdate: any = {};

    if (profileId) {
        await requireAdminForProfiles([profileId]);
        dataToUpdate.profiles = {
            set: [{ id: profileId }] // Enforce 1-1 by replacing all with this one
        };
    } else {
        // If empty, disconnect all?
        // Or if 'profiles' checkbox array was sent (legacy), handle that?
        const profileIds = formData.getAll('profiles') as string[];
        if (profileIds.length > 0) {
            await requireAdminForProfiles(profileIds);
            dataToUpdate.profiles = {
                set: profileIds.map(id => ({ id }))
            };
        } else {
            // Explicitly clearing — no profile IDs to check
            dataToUpdate.profiles = { set: [] };
        }
    }

    try {
        await prisma.userGroup.update({
            where: { id: groupId },
            data: dataToUpdate
        })
        revalidatePath(`/admin/groups/${groupId}`);
        return { success: true }
    } catch (e) {
        console.error("Update Group Profiles Error:", e);
        return { error: 'Failed to update group profiles' }
    }
}

export async function addUserToGroup(groupId: string, formData: FormData) {
    const session = await requireAdminForGroup(groupId);
    const email = formData.get('email') as string;

    const targetUser = await prisma.user.findUnique({
        where: { email },
        select: { organizationId: true }
    });
    if (!targetUser || targetUser.organizationId !== session.user.organizationId) {
        return { error: 'User not found' }
    }

    try {
        await prisma.userGroup.update({
            where: { id: groupId },
            data: {
                users: {
                    connect: { email }
                }
            }
        })
        revalidatePath(`/admin/groups/${groupId}`);
        return { success: true }
    } catch (e) {
        return { error: 'User not found or failed' }
    }
}

export async function removeUserFromGroup(groupId: string, userId: string) {
    await requireAdminForGroup(groupId);
    try {
        await prisma.userGroup.update({
            where: { id: groupId },
            data: {
                users: {
                    disconnect: { id: userId }
                }
            }
        })
        revalidatePath(`/admin/groups/${groupId}`);
        return { success: true }
    } catch (e) {
        console.error("Remove User From Group Error:", e);
        return { error: 'Failed to remove user from group' }
    }
}
