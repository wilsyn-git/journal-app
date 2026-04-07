
import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { getUserTimezone } from "@/lib/timezone"
import { calculateStreaks } from "@/lib/streaks"
import { getFrozenDates } from "@/app/lib/inventoryData"
import { AchievementMetrics } from '@/lib/achievementEvaluator'
import { PROMPT_TYPES } from '@/lib/promptConstants'

const STOP_WORDS = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there',
    'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no',
    'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then',
    'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well',
    'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is', 'are', 'was', 'were', 'had', 'has', 'am',
    // Common contractions
    "don't", "can't", "won't", "it's", "i'm", "you're", "he's", "she's", "we're", "they're",
    "didn't", "wouldn't", "couldn't", "shouldn't", "isn't", "aren't", "wasn't", "weren't",
    "haven't", "hasn't", "hadn't", "doesn't", "that's", "there's", "let's"
]);

export const getUserStats = cache(async function getUserStats(userId: string) {
    const timezone = await getUserTimezone()

    // Lightweight all-time query: just dates and types for streaks/totals
    const allEntries = await prisma.journalEntry.findMany({
        where: { userId },
        select: {
            createdAt: true,
            prompt: { select: { id: true, type: true } }
        },
        orderBy: { createdAt: 'desc' }
    })

    // Bounded query: last 365 days with full text for word cloud, heatmap, trends
    const textCutoff = new Date()
    textCutoff.setDate(textCutoff.getDate() - 365)

    const recentEntries = await prisma.journalEntry.findMany({
        where: { userId, createdAt: { gte: textCutoff } },
        select: {
            createdAt: true,
            answer: true,
            prompt: { select: { id: true, type: true, content: true } }
        },
        orderBy: { createdAt: 'desc' }
    })

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone });

    // --- All-time pass: streaks, totals, hour counts (lightweight, no text) ---
    const allTimeDays = new Set<string>()
    const hourCounts: number[] = new Array(24).fill(0);

    allEntries.forEach(e => {
        const date = new Date(e.createdAt);
        const dayStr = date.toLocaleDateString('en-CA', { timeZone: timezone });
        const hourStr = date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone });
        const hour = parseInt(hourStr) % 24;
        if (!isNaN(hour)) hourCounts[hour]++;

        if (e.prompt.type === PROMPT_TYPES.TEXT) {
            allTimeDays.add(dayStr);
        }
    });

    const frozenDates = await getFrozenDates(userId)
    const frozenSet = new Set(frozenDates)
    const sortedAllDays = Array.from(allTimeDays).sort().reverse();
    const { current, max } = calculateStreaks(sortedAllDays, todayStr, frozenSet);

    // --- Bounded pass (last 365 days): word cloud, heatmap, avg words, habits, trends ---
    const dayStats: Record<string, { words: number, entries: number }> = {};
    const heatmap: Record<string, number> = {};
    const wordCounts: Record<string, number> = {};
    const filteredWords: { text: string, value: number }[] = [];
    const taskMap = new Map<string, { prompt: string, type: string, days: Set<string> }>();
    const rangeMap = new Map<string, { prompt: string, dateValues: Map<string, number[]> }>();

    recentEntries.forEach(e => {
        const date = new Date(e.createdAt);
        const dayStr = date.toLocaleDateString('en-CA', { timeZone: timezone });

        if (e.prompt.type === PROMPT_TYPES.TEXT) {
            const normalizedAnswer = e.answer.toLowerCase().replace(/[\u2018\u2019]/g, "'");
            const words = normalizedAnswer.split(/[^a-z0-9']+/);
            const validWords = words.filter(w => w.length > 0);

            if (!dayStats[dayStr]) dayStats[dayStr] = { words: 0, entries: 0 };
            dayStats[dayStr].words += validWords.length;
            dayStats[dayStr].entries += 1;

            words.forEach(w => {
                if (w.length > 2 && !STOP_WORDS.has(w)) {
                    wordCounts[w] = (wordCounts[w] || 0) + 1;
                }
            });
        }

        if (([PROMPT_TYPES.CHECKBOX, PROMPT_TYPES.RADIO] as string[]).includes(e.prompt.type)) {
            if (!taskMap.has(e.prompt.id)) {
                taskMap.set(e.prompt.id, { prompt: e.prompt.content, type: e.prompt.type, days: new Set() });
            }
            taskMap.get(e.prompt.id)!.days.add(dayStr);
        }

        if (e.prompt.type === PROMPT_TYPES.RANGE) {
            if (!rangeMap.has(e.prompt.id)) {
                rangeMap.set(e.prompt.id, { prompt: e.prompt.content, dateValues: new Map() });
            }

            const mapEntry = rangeMap.get(e.prompt.id)!;
            if (!mapEntry.dateValues.has(dayStr)) {
                mapEntry.dateValues.set(dayStr, []);
            }

            let val = 0;
            const answer = e.answer.trim().toLowerCase();

            if (!isNaN(parseInt(answer))) {
                val = parseInt(answer);
            } else if (answer === 'yes' || answer === 'true') {
                val = 100;
            } else if (answer === 'no' || answer === 'false') {
                val = 0;
            } else {
                return;
            }

            val = Math.max(0, Math.min(100, val));
            mapEntry.dateValues.get(dayStr)!.push(val);
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

    // Calc Avg Words (from recent entries only)
    const textEntries = recentEntries.filter(e => e.prompt.type === PROMPT_TYPES.TEXT);
    let totalWords = 0;
    textEntries.forEach(e => totalWords += e.answer.trim().split(/\s+/).length);
    const avgWords = textEntries.length > 0 ? Math.round(totalWords / textEntries.length) : 0;

    // Achievement metrics
    const lateNightEntries = hourCounts[22] + hourCounts[23]

    const achievementMetrics: AchievementMetrics = {
        maxStreak: max,
        totalDaysJournaled: allTimeDays.size,
        totalEntries: allEntries.length,
        lateNightEntries,
    }

    // Task Stats (Daily Habits)
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
        currentStreak: current,
        maxStreak: max,
        totalEntries: allEntries.length,
        daysCompleted: allTimeDays.size,
        avgWords,
        taskStats,
        trendStats,
        heatmap,
        hourCounts,
        wordCloud: filteredWords,
        achievementMetrics,
    }
})
