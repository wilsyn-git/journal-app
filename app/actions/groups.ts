'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { ensureAdmin } from './helpers'

// Enhanced createGroup to handle initial profile and users
export async function createGroup(formData: FormData) {
    const session = await ensureAdmin();
    const organizationId = session.user.organizationId;

    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const profileId = formData.get('profileId') as string;

    const initialEmails = formData.getAll('initialUsers') as string[];

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
    await ensureAdmin();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    await prisma.userGroup.update({
        where: { id },
        data: {
            name,
            description
        }
    })
    revalidatePath(`/admin/groups/${id}`);
    revalidatePath('/admin/groups');
}

export async function deleteGroup(id: string) {
    await ensureAdmin();
    await prisma.userGroup.delete({ where: { id } });
    revalidatePath('/admin/groups');
}

export async function updateGroupProfiles(groupId: string, formData: FormData) {
    await ensureAdmin();
    // The UI will likely now send a single 'profileId' or 'profiles' (HTML select sends one value by default unless multiple)
    // If we use <select name="profileId"> it sends 'profileId'.
    // If we use <select name="profiles"> it sends 'profiles' with one value.
    // Let's support both or just normalize to looking for 'profileId'.

    const profileId = formData.get('profileId') as string;
    // Fallback for legacy Checkbox UI if we haven't updated it yet?
    // Actually we are updating the UI too. Let's make it robust.

    const dataToUpdate: any = {};

    if (profileId) {
        dataToUpdate.profiles = {
            set: [{ id: profileId }] // Enforce 1-1 by replacing all with this one
        };
    } else {
        // If empty, disconnect all?
        // Or if 'profiles' checkbox array was sent (legacy), handle that?
        const profileIds = formData.getAll('profiles') as string[];
        if (profileIds.length > 0) {
            dataToUpdate.profiles = {
                set: profileIds.map(id => ({ id }))
            };
        } else {
            // Explicitly clearing
            dataToUpdate.profiles = { set: [] };
        }
    }

    await prisma.userGroup.update({
        where: { id: groupId },
        data: dataToUpdate
    })
    revalidatePath(`/admin/groups/${groupId}`);
}

export async function addUserToGroup(groupId: string, formData: FormData) {
    await ensureAdmin();
    const email = formData.get('email') as string;

    // Verify user exists and is in same org
    // For simplicity, just connect by email
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
    await ensureAdmin();
    await prisma.userGroup.update({
        where: { id: groupId },
        data: {
            users: {
                disconnect: { id: userId }
            }
        }
    })
    revalidatePath(`/admin/groups/${groupId}`);
}
