
import { cache } from "react"
import { prisma } from "@/lib/prisma"

/**
 * Returns the "active" organization (the one with the most users).
 * Wrapped in React's cache() so it deduplicates within a single
 * server-render request — layout, page, and metadata all share one query.
 */
export const getActiveOrganization = cache(async () => {
    return prisma.organization.findFirst({
        orderBy: { users: { _count: 'desc' } }
    })
})

// Simple seeded random generator (Linear Congruential Generator)
function mulberry32(a: number) {
    return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// Convert string to seed
function cyrb128(str: string) {
    let h1 = 1779033703, h2 = 3144134277,
        h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860281);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860281);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return (h1 ^ h2 ^ h3 ^ h4) >>> 0;
}

// Helper to resolve all profiles (Direct + Group Inherited)
export async function getEffectiveProfileIds(userId: string) {
    if (!userId) return [];

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            profiles: { select: { id: true } },
            groups: {
                include: {
                    profiles: { select: { id: true } }
                }
            }
        }
    });

    if (!user) return [];

    const profileIds = new Set<string>();

    // Add Direct Profiles
    user.profiles.forEach(p => profileIds.add(p.id));

    // Add Group Profiles
    user.groups.forEach(g => {
        g.profiles.forEach(p => profileIds.add(p.id));
    });

    return Array.from(profileIds);
}

export async function getActivePrompts(
    userId: string,
    organizationId: string,
    userProfileIds: string[] = [],
    dateStr?: string // YYYY-MM-DD
) {
    try {
        // 1. Fetch Global Prompts (Mandatory)
        const globalPrompts = await prisma.prompt.findMany({
            where: {
                organizationId,
                isActive: true,
                isGlobal: true
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
        });

        const selectedPromptsMap = new Map<string, any>();
        globalPrompts.forEach(p => selectedPromptsMap.set(p.id, p));

        // 2. Fetch User Profile Rules
        const profiles = await prisma.profile.findMany({
            where: { id: { in: userProfileIds } },
            include: {
                rules: {
                    orderBy: [
                        { sortOrder: 'asc' },
                        { createdAt: 'asc' }
                    ]
                }
            }
        });

        // 3. Process Rules
        // Use provided date or today for stable seeding
        const seedDate = dateStr || new Date().toISOString().split('T')[0];
        const seedStr = `${userId}-${seedDate}`;
        const seed = cyrb128(seedStr);
        const random = mulberry32(seed);

        // Collect all category targets upfront
        const allCategoryStrings: string[] = [];
        const allCategoryIds: string[] = [];

        for (const profile of profiles) {
            for (const rule of profile.rules) {
                if (rule.categoryString) allCategoryStrings.push(rule.categoryString);
                if (rule.categoryId) allCategoryIds.push(rule.categoryId);
            }
        }

        // Single query for ALL candidate non-global prompts
        const allCandidatePrompts = allCategoryStrings.length > 0 || allCategoryIds.length > 0
            ? await prisma.prompt.findMany({
                where: {
                    organizationId,
                    isActive: true,
                    isGlobal: false,
                    OR: [
                        ...(allCategoryStrings.length > 0
                            ? [{ categoryString: { in: allCategoryStrings } }]
                            : []),
                        ...(allCategoryIds.length > 0
                            ? [{ categoryId: { in: allCategoryIds } }]
                            : []),
                    ],
                },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
            })
            : [];

        // Index by category for fast lookup
        const promptsByCategoryString = new Map<string, typeof allCandidatePrompts>();
        const promptsByCategoryId = new Map<string, typeof allCandidatePrompts>();

        allCandidatePrompts.forEach(p => {
            if (p.categoryString) {
                const list = promptsByCategoryString.get(p.categoryString) || [];
                list.push(p);
                promptsByCategoryString.set(p.categoryString, list);
            }
            if (p.categoryId) {
                const list = promptsByCategoryId.get(p.categoryId) || [];
                list.push(p);
                promptsByCategoryId.set(p.categoryId, list);
            }
        });

        for (const profile of profiles) {
            for (const rule of profile.rules) {
                let count = 0;
                if (!rule.includeAll) {
                    const range = rule.maxCount - rule.minCount + 1;
                    count = Math.floor(random() * range) + rule.minCount;
                    if (count <= 0) continue;
                }

                // Build pool from pre-fetched data, excluding already-selected prompts
                let pool: typeof allCandidatePrompts = [];

                if (rule.categoryString) {
                    pool = [...(promptsByCategoryString.get(rule.categoryString) || [])];
                } else if (rule.categoryId) {
                    pool = [...(promptsByCategoryId.get(rule.categoryId) || [])];
                } else {
                    continue;
                }

                // Exclude already selected
                pool = pool.filter(p => !selectedPromptsMap.has(p.id));

                if (rule.includeAll) {
                    pool.forEach(p => selectedPromptsMap.set(p.id, p));
                } else {
                    // Fisher-Yates shuffle with deterministic random
                    for (let i = pool.length - 1; i > 0; i--) {
                        const j = Math.floor(random() * (i + 1));
                        [pool[i], pool[j]] = [pool[j], pool[i]];
                    }
                    const picked = pool.slice(0, count);
                    picked.forEach(p => selectedPromptsMap.set(p.id, p));
                }
            }
        }

        // Return combined list, maybe sorted by some logic? 
        // For now, Globals first, then mixed. OR just all sorted by createdAt or something.
        // Let's keep Globals at top, then others.

        // Actually, Map preserves insertion order mostly.
        return Array.from(selectedPromptsMap.values());

    } catch (error) {
        console.error('Failed to fetch prompts:', error)
        throw new Error('Failed to fetch prompts.')
    }
}

export async function getJournalHistory(userId: string) {
    // Group entries by date (YYYY-MM-DD)
    // We fetch select fields and process in JS for simplicity/compatibility.
    const entries = await prisma.journalEntry.findMany({
        where: { userId },
        select: { createdAt: true, isLiked: true },
        orderBy: { createdAt: 'desc' }
    });

    const datesMap = new Map<string, boolean>(); // Date -> hasLike

    entries.forEach(e => {
        const dateStr = new Date(e.createdAt).toLocaleDateString('en-CA');
        // If map already has this date, OR if current entry is liked, update it.
        // We want to know if *any* entry on this date is liked.
        const currentStatus = datesMap.get(dateStr) || false;
        datesMap.set(dateStr, currentStatus || e.isLiked);
    });

    // Convert keys to array of objects
    return Array.from(datesMap.entries()).map(([date, hasLike]) => ({
        date,
        hasLike
    }));
}

export async function getEntriesByDate(userId: string, dateStr: string) {
    // dateStr is YYYY-MM-DD
    // Filter between start and end of that day in UTC or server time.
    // Ideally we store YYYY-MM-DD as a string field for exact calling, but using range on createdAt works too.
    // dateStr is YYYY-MM-DD
    // Ensure we parse this as LOCAL time for the server/user context, not UTC.
    // Appending 'T00:00:00' forces local time parsing in most environments.
    // Alternatively, construct using arguments.
    const parts = dateStr.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // 0-indexed
    const day = parseInt(parts[2]);

    const start = new Date(year, month, day, 0, 0, 0, 0);
    const end = new Date(year, month, day, 23, 59, 59, 999);

    return await prisma.journalEntry.findMany({
        where: {
            userId,
            createdAt: {
                gte: start,
                lte: end
            }
        },
        include: {
            prompt: true
        }
    });
}
