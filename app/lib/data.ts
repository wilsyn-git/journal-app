
import { prisma } from "@/lib/prisma"

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
            orderBy: { createdAt: 'asc' }
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

        for (const profile of profiles) {
            for (const rule of profile.rules) {
                // Determine count for this rule (random between min and max)
                // We advance the RNG to ensure stability per rule order? 
                // Better: mix rule ID into seed or just use next random. 
                // Since profile ordering from DB might be stable by ID, we should sort them first to be safe.

                let count = 0;
                if (!rule.includeAll) {
                    const range = rule.maxCount - rule.minCount + 1;
                    count = Math.floor(random() * range) + rule.minCount;
                    if (count <= 0) continue;
                }

                // Fetch pool of prompts for this category
                const categoryConditions: any[] = [];
                if (rule.categoryString) categoryConditions.push({ categoryString: rule.categoryString });
                if (rule.categoryId) categoryConditions.push({ categoryId: rule.categoryId });

                // If no target is defined, skip this rule (or handle as error)
                if (categoryConditions.length === 0) continue;

                // Fetch pool of prompts for this category
                const pool = await prisma.prompt.findMany({
                    where: {
                        organizationId,
                        isActive: true,
                        OR: categoryConditions,
                        isGlobal: false,
                        id: { notIn: Array.from(selectedPromptsMap.keys()) }
                    }
                });

                if (rule.includeAll) {
                    // Take everything
                    pool.forEach(p => selectedPromptsMap.set(p.id, p));
                } else {
                    // Shuffle pool deterministically
                    // Fisher-Yates with our custom random
                    for (let i = pool.length - 1; i > 0; i--) {
                        const j = Math.floor(random() * (i + 1));
                        [pool[i], pool[j]] = [pool[j], pool[i]];
                    }

                    // Pick first N
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
    // Prisma aggregation isn't perfect for Date truncation in SQLite/Generic.
    // We'll fetch select fields and process in JS for simplicity/compatibility.
    const entries = await prisma.journalEntry.findMany({
        where: { userId },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' }
    });

    const dates = new Set<string>();
    entries.forEach(e => {
        dates.add(new Date(e.createdAt).toLocaleDateString('en-CA'));
    });

    return Array.from(dates);
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
