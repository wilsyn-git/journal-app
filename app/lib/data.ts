
import { cache } from "react"
import { createHash } from 'crypto'
import { prisma } from "@/lib/prisma"
import { getUserTimezoneById, startOfDayInTimezone, endOfDayInTimezone, getTodayForUser } from "@/lib/timezone"

const RECENCY_SUPPRESSION_DAYS = 4

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

function createSeededRandom(seed: string): () => number {
    let hashIndex = 0
    let byteOffset = 0
    let currentHash = createHash('sha256').update(seed).digest()

    return function random(): number {
        if (byteOffset >= 32) {
            hashIndex++
            currentHash = createHash('sha256').update(seed + '-' + hashIndex).digest()
            byteOffset = 0
        }
        const value = currentHash.readUInt32BE(byteOffset)
        byteOffset += 4
        return value / 0x100000000 // normalize to [0, 1)
    }
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
    dateStr?: string, // YYYY-MM-DD
    recentPromptIdsOverride?: Set<string>
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

        // Hoist timezone and todayStr so both recency suppression and seed use the same value
        const timezone = await getUserTimezoneById(userId)
        const todayStr = dateStr || getTodayForUser(timezone)

        // Recency suppression: determine which prompts were shown recently
        let recentPromptIds: Set<string>
        if (recentPromptIdsOverride) {
            recentPromptIds = recentPromptIdsOverride
        } else {
            // Query actual journal history for recency suppression
            const todayStart = startOfDayInTimezone(todayStr, timezone)

            // Calculate suppression start date string
            const suppressionDate = new Date(todayStr + 'T12:00:00Z') // noon to avoid DST issues
            suppressionDate.setDate(suppressionDate.getDate() - RECENCY_SUPPRESSION_DAYS)
            const suppressionDateStr = suppressionDate.toISOString().split('T')[0]
            const suppressionStart = startOfDayInTimezone(suppressionDateStr, timezone)

            const recentEntries = await prisma.journalEntry.findMany({
                where: {
                    userId,
                    createdAt: {
                        gte: suppressionStart,
                        lt: todayStart
                    }
                },
                select: { promptId: true },
                distinct: ['promptId']
            })
            recentPromptIds = new Set(recentEntries.map(e => e.promptId))
        }

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
        // Use provided date or today for stable seeding (timezone-aware via todayStr)
        const seedDate = todayStr;
        const seedStr = `${userId}-${seedDate}`;
        const random = createSeededRandom(seedStr);

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

                if (rule.categoryId) {
                    pool = [...(promptsByCategoryId.get(rule.categoryId) || [])];
                } else if (rule.categoryString) {
                    pool = [...(promptsByCategoryString.get(rule.categoryString) || [])];
                } else {
                    continue;
                }

                // Exclude already selected
                pool = pool.filter(p => !selectedPromptsMap.has(p.id))
                if (!rule.includeAll) {
                    const filteredPool = pool.filter(p => !recentPromptIds.has(p.id))
                    // Fall back to unsuppressed pool if recency removes all candidates
                    if (filteredPool.length > 0) {
                        pool = filteredPool
                    }
                }

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

        return Array.from(selectedPromptsMap.values());

    } catch (error) {
        console.error('Failed to fetch prompts:', error)
        throw new Error('Failed to fetch prompts.')
    }
}

export async function getJournalHistory(userId: string, timezone?: string) {
    const tz = timezone || await getUserTimezoneById(userId)

    // Only fetch last 90 days for the dashboard calendar
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)

    const entries = await prisma.journalEntry.findMany({
        where: { userId, createdAt: { gte: cutoff } },
        select: { createdAt: true, isLiked: true },
        orderBy: { createdAt: 'desc' }
    });

    const datesMap = new Map<string, boolean>(); // Date -> hasLike

    entries.forEach(e => {
        const dateStr = new Date(e.createdAt).toLocaleDateString('en-CA', { timeZone: tz });
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

export async function getEntriesByDate(userId: string, dateStr: string, timezone?: string) {
    const tz = timezone || await getUserTimezoneById(userId)
    const start = startOfDayInTimezone(dateStr, tz)
    const end = endOfDayInTimezone(dateStr, tz)

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
