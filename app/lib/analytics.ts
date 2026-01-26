
import { prisma } from "@/lib/prisma"

// Helper to calculate streak from a sorted list of date strings (descending)
function calculateStreaks(sortedDays: string[]) {
    if (sortedDays.length === 0) return { current: 0, max: 0 };

    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Current Streak logic
    // Check start point
    if (sortedDays[0] === today || sortedDays[0] === yesterday) {
        currentStreak = 1;
    } else {
        currentStreak = 0;
    }

    // Single pass for Max Streak
    for (let i = 0; i < sortedDays.length; i++) {
        if (i === 0) {
            tempStreak = 1;
        } else {
            const current = new Date(sortedDays[i - 1]);
            const prev = new Date(sortedDays[i]);
            const diffTime = Math.abs(current.getTime() - prev.getTime());
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                tempStreak++;
            } else {
                if (tempStreak > maxStreak) maxStreak = tempStreak;
                tempStreak = 1;
            }
        }
    }
    if (tempStreak > maxStreak) maxStreak = tempStreak;

    // Finalize Current Streak
    let cStreak = 0;
    if (sortedDays.includes(today) || sortedDays.includes(yesterday)) {
        cStreak = 1;
        for (let i = 0; i < sortedDays.length - 1; i++) {
            const d1 = new Date(sortedDays[i]);
            const d2 = new Date(sortedDays[i + 1]);
            const diff = Math.round((d1.getTime() - d2.getTime()) / (1000 * 3600 * 24));
            if (diff === 1) cStreak++;
            else break;
        }
    }

    return { current: cStreak, max: maxStreak };
}

export async function getUserStats(userId: string) {
    const entries = await prisma.journalEntry.findMany({
        where: { userId },
        select: {
            createdAt: true,
            answer: true,
            prompt: { select: { id: true, type: true, content: true } }
        },
        orderBy: { createdAt: 'desc' }
    })

    if (entries.length === 0) {
        return {
            streak: 0,
            currentStreak: 0,
            maxStreak: 0,
            totalEntries: 0,
            daysCompleted: 0,
            avgWords: 0,
            taskStats: []
        }
    }

    // 1. Unique Days & Global Streak
    const uniqueDays = new Set<string>();
    entries.forEach(e => {
        uniqueDays.add(new Date(e.createdAt).toISOString().split('T')[0])
    })
    const sortedDays = Array.from(uniqueDays).sort().reverse();
    const { current, max } = calculateStreaks(sortedDays);

    // 2. Average Word Count (only for TEXT metrics)
    const textEntries = entries.filter(e => e.prompt.type === 'TEXT');
    let totalWords = 0;
    textEntries.forEach(e => {
        totalWords += e.answer.trim().split(/\s+/).length;
    });
    const avgWords = textEntries.length > 0 ? Math.round(totalWords / textEntries.length) : 0;

    // 3. Task Stats (Daily Habits)
    const taskMap = new Map<string, { prompt: string, days: Set<string> }>();

    entries.forEach(e => {
        if (e.prompt.type === 'Checkboxes' || e.prompt.type === 'Radio' || e.prompt.type === 'CHECKBOX' || e.prompt.type === 'RADIO') {
            if (!taskMap.has(e.prompt.id)) {
                taskMap.set(e.prompt.id, { prompt: e.prompt.content, days: new Set() });
            }
            taskMap.get(e.prompt.id)!.days.add(new Date(e.createdAt).toISOString().split('T')[0]);
        }
    });

    const taskStats = [];
    for (const [id, data] of taskMap.entries()) {
        const days = Array.from(data.days).sort().reverse();
        const streaks = calculateStreaks(days);
        taskStats.push({
            id,
            content: data.prompt,
            currentStreak: streaks.current,
            maxStreak: streaks.max,
            count: days.length
        });
    }

    return {
        streak: current, // Legacy support
        currentStreak: current,
        maxStreak: max,
        totalEntries: entries.length,
        daysCompleted: uniqueDays.size,
        avgWords,
        taskStats
    }
}
