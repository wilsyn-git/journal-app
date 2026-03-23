'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { ensureAdmin } from './helpers'

export async function createProfile(formData: FormData) {
    const session = await ensureAdmin();
    const organizationId = session.user.organizationId;

    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    await prisma.profile.create({
        data: {
            name,
            description,
            organizationId
        }
    })

    revalidatePath('/admin/profiles');
    revalidatePath('/dashboard');
}

export async function updateProfile(id: string, formData: FormData) {
    await ensureAdmin();

    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    await prisma.profile.update({
        where: { id },
        data: {
            name,
            description
        }
    })

    revalidatePath(`/admin/profiles/${id}`);
    revalidatePath('/admin/profiles');
}

export async function deleteProfile(id: string) {
    await ensureAdmin();
    await prisma.profile.delete({ where: { id } });
    revalidatePath('/admin/profiles');
}

export async function addProfileRule(profileId: string, formData: FormData) {
    const session = await ensureAdmin();
    const organizationId = session.user.organizationId;

    const categoryId = formData.get('categoryId') as string;
    // Fallback or legacy support
    const categoryString = formData.get('categoryString') as string;

    const includeAll = formData.get('includeAll') === 'on';

    const minCount = parseInt(formData.get('minCount') as string) || 1;
    const maxCount = parseInt(formData.get('maxCount') as string) || 3;

    if (!includeAll && minCount > maxCount) {
        return { error: 'Min count cannot exceed Max count' };
    }

    let resolvedCategoryId = categoryId || null;
    let resolvedCategoryString = 'General';

    if (categoryId) {
        resolvedCategoryId = categoryId;
        const cat = await prisma.promptCategory.findUnique({ where: { id: categoryId } });
        if (cat) resolvedCategoryString = cat.name;
    } else if (categoryString) {
        resolvedCategoryString = categoryString;
        const cat = await prisma.promptCategory.findUnique({
            where: { organizationId_name: { organizationId, name: categoryString } }
        });
        if (cat) resolvedCategoryId = cat.id;
    }

    // Check for existing duplicates
    const existing = await prisma.profileRule.findFirst({
        where: {
            profileId,
            OR: [
                { categoryId: resolvedCategoryId },
                { categoryString: resolvedCategoryString }
            ]
        }
    });

    if (existing) {
        return { error: 'Rule for this category already exists' };
    }

    await prisma.profileRule.create({
        data: {
            profileId,
            categoryString: resolvedCategoryString,
            categoryId: resolvedCategoryId,
            minCount,
            maxCount,
            includeAll
        }
    })

    revalidatePath(`/admin/profiles/${profileId}`);
    return { success: true };
}

export async function updateProfileRule(ruleId: string, profileId: string, formData: FormData) {
    const session = await ensureAdmin();
    const organizationId = session.user.organizationId;

    const categoryId = formData.get('categoryId') as string;
    const categoryString = formData.get('categoryString') as string; // Legacy fallback

    const includeAll = formData.get('includeAll') === 'on';

    const minCount = parseInt(formData.get('minCount') as string) || 1;
    const maxCount = parseInt(formData.get('maxCount') as string) || 3;

    if (!includeAll && minCount > maxCount) {
        return { error: 'Min count cannot exceed Max count' };
    }

    let resolvedCategoryId = categoryId || null;
    let resolvedCategoryString = 'General';

    if (categoryId) {
        resolvedCategoryId = categoryId;
        const cat = await prisma.promptCategory.findUnique({ where: { id: categoryId } });
        if (cat) resolvedCategoryString = cat.name;
    } else if (categoryString) {
        resolvedCategoryString = categoryString;
        const cat = await prisma.promptCategory.findUnique({
            where: { organizationId_name: { organizationId, name: categoryString } }
        });
        if (cat) resolvedCategoryId = cat.id;
    }

    // Check for duplicates (excluding self)
    const existing = await prisma.profileRule.findFirst({
        where: {
            profileId,
            id: { not: ruleId },
            OR: [
                { categoryId: resolvedCategoryId },
                { categoryString: resolvedCategoryString }
            ]
        }
    });

    if (existing) {
        return { error: 'Rule for this category already exists' };
    }

    // Prepare update data
    // Prisma sometimes requires relation syntax for updates if implicit?
    // Actually, usually scalar writes work. The error suggests otherwise.
    // Let's safe-guard by using connect/disconnect if ID changes, or just setting scalar.
    // If 'Unknown argument categoryId', then maybe my local schema didn't generate correctly?
    // Or I should use `categoryPrompt: { connect: ... }`.

    // Let's try relation syntax which is always safer.
    const updateData: any = {
        categoryString: resolvedCategoryString,
        minCount,
        maxCount,
        includeAll
    };

    if (resolvedCategoryId) {
        updateData.categoryPrompt = { connect: { id: resolvedCategoryId } };
    } else {
        updateData.categoryPrompt = { disconnect: true };
    }

    await prisma.profileRule.update({
        where: { id: ruleId },
        data: updateData
    })

    revalidatePath(`/admin/profiles/${profileId}`);
    return { success: true };
}

export async function deleteProfileRule(ruleId: string, profileId: string) {
    await ensureAdmin();
    await prisma.profileRule.delete({ where: { id: ruleId } });
    revalidatePath(`/admin/profiles/${profileId}`);
}

// --- RULE REORDERING ---

export async function moveProfileRule(ruleId: string, profileId: string, direction: 'UP' | 'DOWN') {
    await ensureAdmin();

    // Fetch all rules with stable sorting (createdAt tie-breaker)
    // This ensures that even if all sortOrders are 0, we have a deterministic list logic.
    const rules = await prisma.profileRule.findMany({
        where: { profileId },
        orderBy: [
            { sortOrder: 'asc' },
            { createdAt: 'asc' }
        ]
    });

    const currentIndex = rules.findIndex(r => r.id === ruleId);
    if (currentIndex === -1) return;

    // Swap in memory
    const newRules = [...rules];
    if (direction === 'UP' && currentIndex > 0) {
        [newRules[currentIndex], newRules[currentIndex - 1]] = [newRules[currentIndex - 1], newRules[currentIndex]];
    } else if (direction === 'DOWN' && currentIndex < rules.length - 1) {
        [newRules[currentIndex], newRules[currentIndex + 1]] = [newRules[currentIndex + 1], newRules[currentIndex]];
    } else {
        return; // No move needed
    }

    // Persist new order for ALL rules to ensure normalization (0, 1, 2, 3...)
    // This fixes the "all are 0" issue.
    await prisma.$transaction(
        newRules.map((rule, index) =>
            prisma.profileRule.update({
                where: { id: rule.id },
                data: { sortOrder: index }
            })
        )
    );

    revalidatePath(`/admin/profiles/${profileId}`);
}

export async function updateUserProfiles(userId: string, formData: FormData) {
    await ensureAdmin();

    // We get profiles as strings
    const profileIds = formData.getAll('profiles') as string[];

    await prisma.user.update({
        where: { id: userId },
        data: {
            profiles: {
                set: profileIds.map(id => ({ id }))
            }
        }
    })

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath('/admin/users');
}
