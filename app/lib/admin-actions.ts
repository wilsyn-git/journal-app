'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email'
import { welcomeEmail } from '@/lib/email/templates'

// Helper to ensure admin
async function ensureAdmin() {
    const session = await auth()
    if (session?.user?.role !== 'ADMIN') {
        throw new Error("Unauthorized: Admin access required")
    }
}

export async function createProfile(formData: FormData) {
    await ensureAdmin();
    const session = await auth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string;

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
    await ensureAdmin();
    const session = await auth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string;

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
    await ensureAdmin();
    const session = await auth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string;

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

// --- USER GROUPS ---

export async function createGroup(formData: FormData) {
    await ensureAdmin();
    const session = await auth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string;

    const name = formData.get('name') as string;
    const description = formData.get('description') as string;

    try {
        await prisma.userGroup.create({
            data: {
                name,
                description,
                organizationId
            }
        });
        revalidatePath('/admin/groups');
        return { success: true }
    } catch (e) {
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
    const profileIds = formData.getAll('profiles') as string[];

    await prisma.userGroup.update({
        where: { id: groupId },
        data: {
            profiles: {
                set: profileIds.map(id => ({ id }))
            }
        }
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

// --- PROMPT CATEGORIES ---

export async function createPromptCategory(formData: FormData) {
    await ensureAdmin();
    const session = await auth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string;
    const name = formData.get('name') as string;

    if (!name) return { error: 'Name required' };

    try {
        await prisma.promptCategory.create({
            data: {
                name,
                organizationId
            }
        })
        revalidatePath('/admin/prompts');
        return { success: true }
    } catch (e) {
        return { error: 'Failed' }
    }
}

export async function deletePromptCategory(id: string) {
    await ensureAdmin();
    try {
        const [prompts, rules, cat] = await prisma.$transaction([
            // 1. Delete Prompts
            prisma.prompt.deleteMany({ where: { categoryId: id } }),

            // 2. Delete Rules
            prisma.profileRule.deleteMany({ where: { categoryId: id } }),

            // 3. Delete Category
            prisma.promptCategory.delete({ where: { id } })
        ]);

        revalidatePath('/admin/prompts');
        revalidatePath('/dashboard');

        return {
            success: true,
            details: {
                promptsDeleted: prompts.count,
                rulesDeleted: rules.count,
                categoryName: cat.name
            }
        }
    } catch (e) {
        console.error("Delete Category Error:", e)
        return { error: 'Failed to delete category' }
    }
}


export async function createPrompt(formData: FormData) {
    await ensureAdmin();
    const session = await auth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string;

    const content = formData.get('content') as string;
    const type = formData.get('type') as string; // 'TEXT', 'RADIO', 'CHECKBOX'
    const optionsRaw = formData.get('options') as string;
    const isGlobal = formData.get('isGlobal') === 'on';

    const categoryId = formData.get('categoryId') as string;
    const categoryString = formData.get('categoryString') as string;

    let options = null;
    if (type === 'RANGE') {
        // Range options are sent as JSON string ["Min", "Max"] from client
        options = optionsRaw;
        if (!options) options = JSON.stringify(["Low", "High"]);
    } else if ((type === 'RADIO' || type === 'CHECKBOX')) {
        if (optionsRaw) {
            const arr = optionsRaw.split(',').map(s => s.trim()).filter(Boolean);
            options = JSON.stringify(arr);
        } else {
            // Default options
            options = JSON.stringify(["Yes", "No"]);
        }
    }

    // Resolve Category
    let resolvedCategoryId = categoryId || null;
    let resolvedCategoryString = 'General';

    if (categoryId) {
        resolvedCategoryId = categoryId;
        const cat = await prisma.promptCategory.findUnique({ where: { id: categoryId } });
        if (cat) resolvedCategoryString = cat.name;
    } else if (categoryString) {
        // Fallback legacy behavior
        resolvedCategoryString = categoryString;
        const cat = await prisma.promptCategory.findUnique({
            where: { organizationId_name: { organizationId, name: categoryString } }
        });
        if (cat) resolvedCategoryId = cat.id;
    }

    try {
        await prisma.prompt.create({
            data: {
                content,
                type,
                options,
                organizationId,
                isGlobal,
                categoryString: resolvedCategoryString,
                categoryId: resolvedCategoryId,
                isActive: true
            }
        });
        revalidatePath('/admin/prompts')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error(error)
        return { error: 'Failed to create prompt' }
    }
}

export async function updatePrompt(id: string, formData: FormData) {
    await ensureAdmin();
    const session = await auth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string;

    const content = formData.get('content') as string;
    const type = formData.get('type') as string;
    const optionsRaw = formData.get('options') as string;

    // We might not allow changing category here easily without UI support, 
    // but if we do...
    const categoryId = formData.get('categoryId') as string;

    let options = null;
    if (type === 'RANGE') {
        options = optionsRaw;
        if (!options) options = JSON.stringify(["Low", "High"]);
    } else if ((type === 'RADIO' || type === 'CHECKBOX')) {
        if (optionsRaw) {
            const arr = optionsRaw.split(',').map(s => s.trim()).filter(Boolean);
            options = JSON.stringify(arr);
        } else {
            options = JSON.stringify(["Yes", "No"]);
        }
    }

    // Resolve Category (optional update)
    // If categoryId is provided, we update it.
    let updateData: any = {
        content,
        type,
        options
    };

    if (categoryId) {
        const cat = await prisma.promptCategory.findUnique({ where: { id: categoryId } });
        if (cat) {
            updateData.categoryId = categoryId;
            updateData.categoryString = cat.name;
        }
    }

    try {
        await prisma.prompt.update({
            where: { id },
            data: updateData
        });
        revalidatePath('/admin/prompts');
        revalidatePath('/dashboard');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to update prompt' };
    }
}

export async function togglePrompt(id: string, currentState: boolean) {
    await ensureAdmin()
    try {
        await prisma.prompt.update({
            where: { id },
            data: { isActive: !currentState }
        })
        revalidatePath('/admin/prompts')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error(error)
        return { error: 'Failed to toggle prompt' }
    }
}

export async function deletePrompt(id: string) {
    await ensureAdmin()
    try {
        await prisma.$transaction([
            prisma.journalEntry.deleteMany({ where: { promptId: id } }),
            prisma.prompt.delete({ where: { id } })
        ]);

        revalidatePath('/admin/prompts')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error(error)
        return { error: 'Failed to delete prompt' }
    }
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

import bcrypt from 'bcryptjs'

export async function createUser(prevState: any, formData: FormData) {
    await ensureAdmin();
    const session = await auth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string;

    const email = formData.get('email') as string;
    const name = formData.get('name') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
        return { error: 'Email and password are required' }
    }

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        return { error: 'User already exists with this email' }
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.user.create({
            data: {
                email,
                name,
                password: hashedPassword,
                organizationId,
                role: 'USER' // Defaults to User
            }
        });

        // Send Welcome Email
        try {
            const emailContent = welcomeEmail(name || email)
            await sendEmail({
                to: email,
                subject: emailContent.subject,
                html: emailContent.html,
                text: emailContent.text
            })
        } catch (error) {
            console.error("Failed to send welcome email:", error)
            // Don't fail the user creation
        }

        revalidatePath('/admin/users');
        return { success: true }
    } catch (e) {
        console.error(e)
        return { error: 'Failed to create user' }
    }
}

export async function updateUser(userId: string, prevState: any, formData: FormData) {
    await ensureAdmin();
    // Validate org access? Ideally check if target user is in same org.
    // For simplicity assuming shared org context or admin super-power properly scoped.

    const email = formData.get('email') as string;
    const name = formData.get('name') as string;

    if (!email) return { error: 'Email is required' };

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { email, name }
        });
        revalidatePath(`/admin/users/${userId}`);
        revalidatePath('/admin/users');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to update user' };
    }
}

export async function importPrompts(formData: FormData) {
    await ensureAdmin();
    const session = await auth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizationId = (session?.user as any)?.organizationId as string;

    const file = formData.get('file') as File | null;
    if (!file) return { error: "No file provided" };

    let data: any;
    try {
        const text = await file.text();
        data = JSON.parse(text);
    } catch (e) {
        return { error: "Invalid JSON file" };
    }

    // Initialize Stats
    const stats = {
        detectedCategories: 0,
        detectedPrompts: 0,
        createdCategories: 0,
        skippedCategories: 0,
        createdPrompts: 0,
        skippedPrompts: 0
    };

    try {
        // --- 1. Pre-fetch Existing Data for Normalization ---
        const existingCategories = await prisma.promptCategory.findMany({
            where: { organizationId },
            select: { id: true, name: true }
        });

        // Map: lowercase name -> id
        const categoryMap = new Map<string, string>();
        existingCategories.forEach(c => categoryMap.set(c.name.toLowerCase(), c.id));

        const allPrompts = await prisma.prompt.findMany({
            where: { organizationId },
            select: { id: true, content: true, categoryId: true }
        });

        // Map: `${categoryId}:${lowercase_content}` -> id
        const promptMap = new Map<string, string>();
        allPrompts.forEach(p => {
            if (p.categoryId) {
                const key = `${p.categoryId}:${p.content.trim().toLowerCase()}`;
                promptMap.set(key, p.id);
            }
        });

        // --- 2. Process Data ---

        // Helper to process a single prompt
        const processPrompt = async (categoryName: string, promptText: string, type: string = 'TEXT', options: string[] | null = null) => {
            if (!categoryName || !promptText) return;

            const categoryNameClean = categoryName.trim();
            const categoryKey = categoryNameClean.toLowerCase();

            // Find or Create Category
            let categoryId = categoryMap.get(categoryKey);

            if (categoryId) {
                // We don't increment skippedCategories here because we might hit the same category multiple times
                // We'll calculate distinct categories at the end if needed, or just track creations
            } else {
                const newCat = await prisma.promptCategory.create({
                    data: { name: categoryNameClean, organizationId }
                });
                categoryId = newCat.id;
                categoryMap.set(categoryKey, categoryId);
                stats.createdCategories++;
            }

            const promptContentClean = promptText.trim();
            const promptKey = `${categoryId}:${promptContentClean.toLowerCase()}`;

            if (promptMap.has(promptKey)) {
                stats.skippedPrompts++;
            } else {
                await prisma.prompt.create({
                    data: {
                        content: promptContentClean,
                        type: type.toUpperCase(), // Ensure uppercase enum-like string
                        options: options ? JSON.stringify(options) : null,
                        organizationId,
                        categoryId,
                        categoryString: categoryNameClean, // Legacy
                        isGlobal: false,
                        isActive: true
                    }
                });
                promptMap.set(promptKey, "created");
                stats.createdPrompts++;
            }
        };

        if (Array.isArray(data)) {
            // New Format: Array of { category, text, type, options }
            stats.detectedPrompts = data.length;
            const uniqueCategories = new Set(data.map((item: any) => item.category));
            stats.detectedCategories = uniqueCategories.size;

            for (const item of data) {
                if (typeof item === 'object' && item.category && item.text) {
                    await processPrompt(item.category, item.text, item.type, item.options);
                }
            }

        } else if (typeof data === 'object') {
            // Legacy Format: { "Category": ["Prompt 1", "Prompt 2"] }
            stats.detectedCategories = Object.keys(data).length;
            for (const prompts of Object.values(data)) {
                if (Array.isArray(prompts)) stats.detectedPrompts += prompts.length;
            }

            for (const [categoryName, prompts] of Object.entries(data)) {
                if (Array.isArray(prompts)) {
                    for (const promptText of prompts) {
                        if (typeof promptText === 'string') {
                            await processPrompt(categoryName, promptText);
                        }
                    }
                }
            }
        } else {
            return { error: "Invalid format. Expected Array or Object." };
        }

        revalidatePath('/admin/prompts');
        revalidatePath('/dashboard');

        return {
            success: true,
            message: `Import Complete. Created ${stats.createdCategories} Categories and ${stats.createdPrompts} Prompts. Skipped ${stats.skippedPrompts} duplicates.`
        };

    } catch (e) {
        console.error("Import Prompts Error:", e);
        return { error: "Server error during import" };
    }
}

export async function deleteUser(userId: string) {
    await ensureAdmin();
    const session = await auth();

    // 1. Prevent Self-Deletion
    if (session?.user?.id === userId) {
        return { error: "You cannot delete your own account." }
    }

    try {
        await prisma.$transaction(async (tx) => {
            // 2. Delete dependent data manually if cascade isn't fully relied upon
            // (Though schema has some relations, it's safer to be explicit for critical user data)

            // Delete Journal Entries
            await tx.journalEntry.deleteMany({ where: { userId } });

            // Delete Avatars
            await tx.userAvatar.deleteMany({ where: { userId } });

            // Remove from Groups (Implicit handling via link table, but let's be sure)
            // Many-to-many is handled by Prisma, no manual disconnect needed usually.

            // 3. Delete User
            await tx.user.delete({ where: { id: userId } });
        });

        revalidatePath('/admin/users');
        return { success: true };

    } catch (e) {
        console.error("Delete User Failed:", e);
        return { error: "Failed to delete user. Check logs." };
    }
}
