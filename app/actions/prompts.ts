'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { ensureAdmin, resolveCategory } from './helpers'
import { PROMPT_TYPES } from '@/lib/promptConstants'

// --- PROMPT CATEGORIES ---

export async function createPromptCategory(formData: FormData) {
    const session = await ensureAdmin();
    const organizationId = session.user.organizationId;
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
    const session = await ensureAdmin();
    const organizationId = session.user.organizationId;

    try {
        // Find or create the _archived category for this org
        let archivedCategory = await prisma.promptCategory.findFirst({
            where: { name: '_archived', organizationId }
        })
        if (!archivedCategory) {
            archivedCategory = await prisma.promptCategory.create({
                data: { name: '_archived', organizationId }
            })
        }

        // Transaction: reassign prompts, delete rules, delete category
        const [prompts, rules, cat] = await prisma.$transaction([
            // 1. Reassign prompts to _archived and deactivate
            prisma.prompt.updateMany({
                where: { categoryId: id },
                data: {
                    categoryId: archivedCategory.id,
                    categoryString: '_archived',
                    isActive: false
                }
            }),

            // 2. Delete rules (they reference the old category)
            prisma.profileRule.deleteMany({ where: { categoryId: id } }),

            // 3. Delete the category
            prisma.promptCategory.delete({ where: { id } })
        ]);

        revalidatePath('/admin/prompts');
        revalidatePath('/dashboard');

        return {
            success: true,
            details: {
                promptsArchived: prompts.count,
                rulesRemoved: rules.count,
                categoryDeleted: cat.name
            }
        }
    } catch (e) {
        return { error: 'Failed to delete category' }
    }
}


export async function createPrompt(formData: FormData) {
    const session = await ensureAdmin();
    const organizationId = session.user.organizationId;

    const content = formData.get('content') as string;
    const type = formData.get('type') as string; // 'TEXT', 'RADIO', 'CHECKBOX'
    const optionsRaw = formData.get('options') as string;
    const isGlobal = formData.get('isGlobal') === 'on';

    const categoryId = formData.get('categoryId') as string;
    const categoryString = formData.get('categoryString') as string;

    let options = null;
    if (type === PROMPT_TYPES.RANGE) {
        // Range options are sent as JSON string ["Min", "Max"] from client
        options = optionsRaw;
        if (!options) options = JSON.stringify(["Low", "High"]);
    } else if ((type === PROMPT_TYPES.RADIO || type === PROMPT_TYPES.CHECKBOX)) {
        if (optionsRaw) {
            const arr = optionsRaw.split(',').map(s => s.trim()).filter(Boolean);
            options = JSON.stringify(arr);
        } else {
            // Default options
            options = JSON.stringify(["Yes", "No"]);
        }
    }

    const { categoryId: resolvedCategoryId, categoryString: resolvedCategoryString } =
        await resolveCategory(organizationId, categoryId, categoryString);

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
    const session = await ensureAdmin();
    const organizationId = session.user.organizationId;

    const content = formData.get('content') as string;
    const type = formData.get('type') as string;
    const optionsRaw = formData.get('options') as string;

    // We might not allow changing category here easily without UI support,
    // but if we do...
    const categoryId = formData.get('categoryId') as string;

    let options = null;
    if (type === PROMPT_TYPES.RANGE) {
        options = optionsRaw;
        if (!options) options = JSON.stringify(["Low", "High"]);
    } else if ((type === PROMPT_TYPES.RADIO || type === PROMPT_TYPES.CHECKBOX)) {
        if (optionsRaw) {
            const arr = optionsRaw.split(',').map(s => s.trim()).filter(Boolean);
            options = JSON.stringify(arr);
        } else {
            options = JSON.stringify(["Yes", "No"]);
        }
    }

    let updateData: any = {
        content,
        type,
        options
    };

    if (categoryId) {
        const resolved = await resolveCategory(organizationId, categoryId);
        updateData.categoryId = resolved.categoryId;
        updateData.categoryString = resolved.categoryString;
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

export async function reorderPrompts(items: { id: string; sortOrder: number }[]) {
    await ensureAdmin();
    try {
        await prisma.$transaction(
            items.map((item) =>
                prisma.prompt.update({
                    where: { id: item.id },
                    data: { sortOrder: item.sortOrder },
                })
            )
        );
        revalidatePath('/admin/prompts');
        return { success: true };
    } catch (error) {
        console.error("Reorder failed:", error);
        return { error: "Failed to reorder prompts" };
    }
}

export async function importPrompts(formData: FormData) {
    const session = await ensureAdmin();
    const organizationId = session.user.organizationId;

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
        const processPrompt = async (categoryName: string, promptText: string, type: string = PROMPT_TYPES.TEXT, options: string[] | null = null) => {
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
