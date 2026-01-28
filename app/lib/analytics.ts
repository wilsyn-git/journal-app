
import { prisma } from "@/lib/prisma"
import { getUserTimezone } from "@/lib/timezone"

// Helper to calculate streak from a sorted list of date strings (descending)
// Helper to calculate streak from a sorted list of date strings (descending)
function calculateStreaks(sortedDays: string[], todayStr: string) {
    if (sortedDays.length === 0) return { current: 0, max: 0 };

    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;

    // Calculate yesterday string from todayStr (YYYY-MM-DD)
    const t = new Date(todayStr); // Treating as UTC for math is fine as long as we put it back
    // Actually, simple Date parsing of YYYY-MM-DD returns UTC midnight.
    // Subtract 24h
    t.setUTCDate(t.getUTCDate() - 1);
    const yesterdayStr = t.toISOString().split('T')[0];

    // Current Streak logic
    // Check start point
    if (sortedDays[0] === todayStr || sortedDays[0] === yesterdayStr) {
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
    if (sortedDays.includes(todayStr) || sortedDays.includes(yesterdayStr)) {
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

const STOP_WORDS = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there',
    'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
    'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
    'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well',
    'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'had', 'has', 'am'
]);

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

    const timezone = await getUserTimezone()

    const now = new Date();
    // Use user timezone
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);
    // This is approximate subtraction, but for "Yesterday String" in a specific timezone,
    // we should actually subtract 24h from the Moment and then format in Timezone.
    // Better: 
    // const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
    // How do we find "Yesterday" string reliably without library?
    // We can iterate back days? 
    // Let's just assume 24h subtraction works for 99% of cases, or rely on logic:
    // If we have a sorted list of days, "Current Streak" logic handles the day adjacency naturally.

    // We actually only need todayStr/yesterdayStr for the "Is streak active?" check.
    // Let's rely on sortedDays logic in calculateStreaks, we just need to pass the right "current" reference.
    // Wait, calculateStreaks uses internal new Date()... we need to fix THAT helper too or pass args.

    // Let's fix calculateStreaks signature to accept "referenceDate" (today).

    // Data structures
    const dayStats: Record<string, { words: number, entries: number }> = {};
    const heatmap: Record<string, number> = {};
    const hourCounts: number[] = new Array(24).fill(0);
    const wordCounts: Record<string, number> = {};
    const filteredWords: { text: string, value: number }[] = [];

    // Process Entries
    entries.forEach(e => {
        const date = new Date(e.createdAt);
        // Use user's timezone for grouping
        const dayStr = date.toLocaleDateString('en-CA', { timeZone: timezone });

        // Time of Day (Hour in user's timezone)
        // We need to parse the hour relative to that timezone strings.
        // Intl format { hour: 'numeric', hour12: false, timeZone: timezone }
        const hourStr = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone });
        const hour = parseInt(hourStr) % 24; // Ensure 0-23

        // Heatmap
        // heatmap[dayStr] = (heatmap[dayStr] || 0) + 1; // Removed in favor of avg words logic

        // Time of Day
        if (!isNaN(hour)) hourCounts[hour]++;

        // Word Cloud (Text only) + Heatmap Stats
        if (e.prompt.type === 'TEXT') {
            // Split by any non-word character sequence
            const words = e.answer.toLowerCase().split(/[\W_]+/);
            const validWords = words.filter(w => w.length > 0);

            // Update Daily Stats
            if (!dayStats[dayStr]) dayStats[dayStr] = { words: 0, entries: 0 };
            dayStats[dayStr].words += validWords.length;
            dayStats[dayStr].entries += 1;

            // Word Freq
            words.forEach(w => {
                if (w.length > 2 && !STOP_WORDS.has(w)) {
                    wordCounts[w] = (wordCounts[w] || 0) + 1;
                }
            });
        }
    });

    // Compute Heatmap (Avg Words per Day)
    Object.entries(dayStats).forEach(([date, stats]) => {
        if (stats.entries > 0) {
            heatmap[date] = Math.round(stats.words / stats.entries);
        }
    });

    // Finalize Word Cloud (Top 50)
    Object.entries(wordCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 50)
        .forEach(([text, value]) => filteredWords.push({ text, value }));


    // Global Streak Logic
    const uniqueDays = new Set(Object.keys(heatmap));
    const sortedDays = Array.from(uniqueDays).sort().reverse();
    const { current, max } = calculateStreaks(sortedDays, todayStr);

    // Calc Avg Words
    const textEntries = entries.filter(e => e.prompt.type === 'TEXT');
    let totalWords = 0;
    textEntries.forEach(e => totalWords += e.answer.trim().split(/\s+/).length);
    const avgWords = textEntries.length > 0 ? Math.round(totalWords / textEntries.length) : 0;

    // Badges Logic
    const badges = [
        {
            id: 'early-bird',
            name: 'Early Bird',
            icon: '🌅',
            description: '5 entries logged between 4AM and 8AM',
            unlocked: hourCounts.slice(4, 9).reduce((a, b) => a + b, 0) >= 5
        },
        {
            id: 'night-owl',
            name: 'Night Owl',
            icon: '🦉',
            description: '5 entries logged between 10PM and 4AM',
            unlocked: (hourCounts[22] + hourCounts[23] + hourCounts[0] + hourCounts[1] + hourCounts[2] + hourCounts[3]) >= 5
        },
        {
            id: 'streak-week',
            name: 'On a Roll',
            icon: '🔥',
            description: 'Achieved a 7-day streak',
            unlocked: max >= 7
        },
        {
            id: 'dedicated',
            name: 'Dedicated',
            icon: '✍️',
            description: 'Logged 100 total answers',
            unlocked: entries.length >= 100
        },
        {
            id: 'wordsmith',
            name: 'Wordsmith',
            icon: '📚',
            description: 'Average word count over 50',
            unlocked: avgWords >= 50 && textEntries.length > 5
        }
    ];

    // Task Stats (Daily Habits)
    const taskMap = new Map<string, { prompt: string, type: string, days: Set<string> }>();
    const rangeMap = new Map<string, { prompt: string, dateValues: Map<string, number[]> }>();

    entries.forEach(e => {
        // Habits (Checkboxes / Radio)
        if (['Checkboxes', 'Radio', 'CHECKBOX', 'RADIO'].includes(e.prompt.type)) {
            if (!taskMap.has(e.prompt.id)) {
                taskMap.set(e.prompt.id, { prompt: e.prompt.content, type: e.prompt.type, days: new Set() });
            }
            taskMap.get(e.prompt.id)!.days.add(new Date(e.createdAt).toLocaleDateString('en-CA', { timeZone: timezone }));
        }

        // Trends (Range / Slider)
        if (e.prompt.type === 'RANGE') {
            if (!rangeMap.has(e.prompt.id)) {
                rangeMap.set(e.prompt.id, { prompt: e.prompt.content, dateValues: new Map() });
            }

            const dayStr = new Date(e.createdAt).toLocaleDateString('en-CA', { timeZone: timezone });
            const mapEntry = rangeMap.get(e.prompt.id)!;
            if (!mapEntry.dateValues.has(dayStr)) {
                mapEntry.dateValues.set(dayStr, []);
            }

            // Soft Adapter: Parse the value
            let val = 0;
            const answer = e.answer.trim().toLowerCase();

            if (!isNaN(parseInt(answer))) {
                val = parseInt(answer);
            } else if (answer === 'yes' || answer === 'true') {
                val = 100;
            } else if (answer === 'no' || answer === 'false') {
                val = 0;
            } else {
                // Unknown text value, skip or default to 50? 
                // Let's skip invalid data points to not skew average
                return;
            }

            // Clamp 0-100 just in case
            val = Math.max(0, Math.min(100, val));

            mapEntry.dateValues.get(dayStr)!.push(val);
        }
    });

    const taskStats = [];
    for (const [id, data] of taskMap.entries()) {
        const days = Array.from(data.days).sort().reverse();
        const streaks = calculateStreaks(days, todayStr);
        taskStats.push({
            id,
            content: data.prompt,
            currentStreak: streaks.current,
            maxStreak: streaks.max,
            count: days.length
        });
    }

    // Process Range Stats
    const trendStats: { id: string, name: string, data: { date: string, value: number }[] }[] = [];

    for (const [id, data] of rangeMap.entries()) {
        const seriesData: { date: string, value: number }[] = [];
        // Sort dates chronologically
        const sortedDates = Array.from(data.dateValues.keys()).sort();

        sortedDates.forEach(date => {
            const values = data.dateValues.get(date)!;
            const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
            seriesData.push({ date, value: avg });
        });

        trendStats.push({
            id,
            name: data.prompt,
            data: seriesData
        });
    }

    return {
        streak: current, // Legacy
        currentStreak: current,
        maxStreak: max,
        totalEntries: entries.length,
        daysCompleted: uniqueDays.size,
        avgWords,
        taskStats,
        trendStats, // New Range Data
        // New Data
        heatmap,     // { "2024-01-01": 5 }
        hourCounts,  // [0, 0, 5, ...] 24 items
        wordCloud: filteredWords, // [{text: "foo", value: 10}]
        badges
    }
}
