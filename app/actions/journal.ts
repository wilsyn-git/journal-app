'use server'

import { signIn, auth } from '@/auth'
import { AuthError } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { resolveUserId } from '@/lib/auth-helpers'
import { getUserTimezoneById, startOfDayInTimezone, endOfDayInTimezone, getTodayForUser } from "@/lib/timezone"
import { revalidatePath } from 'next/cache'
import { processFirstEntryEarning } from '@/lib/inventoryEarning'
import { requireAdminForUser } from '@/lib/adminGuards'
import { buildDayDetails, type DayDetails } from '@/lib/dayDetails'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function authenticate(prevState: any, formData: FormData) {
    try {
        await signIn('credentials', {
            email: formData.get('email'),
            password: formData.get('password'),
            redirectTo: '/dashboard',
        })
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.'
                default:
                    return 'Something went wrong.'
            }
        }
        throw error
    }
}

export async function submitEntry(formData: FormData) {
    const session = await auth()
    if (!session?.user?.email) throw new Error("Unauthorized")

    const userId = await resolveUserId(session)
    if (!userId) throw new Error("User not found")

    // Iterate over formData to find prompt answers
    const promptAnswers = new Map<string, string[]>();

    for (const [key, value] of formData.entries()) {
        if (key.startsWith('prompt_')) {
            const promptId = key.split('_')[1]
            if (typeof value === 'string' && value.trim() !== '') {
                const existing = promptAnswers.get(promptId) || [];
                existing.push(value);
                promptAnswers.set(promptId, existing);
            }
        }
    }

    const entries = [];
    for (const [promptId, values] of promptAnswers.entries()) {
        const answer = values.length > 1 ? JSON.stringify(values) : values[0];

        entries.push({
            userId,
            promptId: promptId,
            answer: answer
        })
    }

    // Save entries
    try {
        const validEntries = entries.filter(e => e.answer.length <= 10000)
        await prisma.$transaction(
            validEntries.map(entry =>
                prisma.journalEntry.create({
                    data: {
                        userId: entry.userId,
                        promptId: entry.promptId,
                        answer: entry.answer
                    }
                })
            )
        )
        // Streak freeze/shield earning: increment counters if this is the user's
        // first entry batch today. Runs transactionally in processFirstEntryEarning.
        try {
            const timezone = await getUserTimezoneById(userId)
            const todayStr = getTodayForUser(timezone)
            await processFirstEntryEarning(prisma, userId, validEntries.length, {
                start: startOfDayInTimezone(todayStr, timezone),
                end: endOfDayInTimezone(todayStr, timezone),
            }, todayStr)
        } catch (earningError) {
            // Non-critical — don't fail the journal entry save
            console.error('Streak freeze earning error:', earningError)
        }

        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        console.error(e)
        return { error: 'Failed to save entries' }
    }
}

export async function saveJournalResponse(promptId: string, answer: string) {
    if (answer.length > 10000) {
        return { error: "Answer exceeds maximum length" }
    }

    const session = await auth()
    if (!session?.user?.email) throw new Error("Unauthorized")

    const userId = await resolveUserId(session)
    if (!userId) throw new Error("User not found")

    const timezone = await getUserTimezoneById(userId)
    const todayStr = getTodayForUser(timezone)
    const startOfDay = startOfDayInTimezone(todayStr, timezone)
    const endOfDay = endOfDayInTimezone(todayStr, timezone)

    try {
        // Check for existing entry for this prompt today
        const existingEntry = await prisma.journalEntry.findFirst({
            where: {
                userId,
                promptId,
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

        if (existingEntry) {
            await prisma.journalEntry.update({
                where: { id: existingEntry.id },
                data: { answer, updatedAt: new Date() }
            });
        } else {
            await prisma.journalEntry.create({
                data: {
                    userId,
                    promptId,
                    answer
                }
            });
        }

        return { success: true, timestamp: new Date().toISOString() };
    } catch (error) {
        console.error("Auto-save failed:", error);
        return { error: "Failed to auto-save" };
    }
}

/**
 * Returns one day's journal entries, completed daily habits, and a summary for
 * the heatmap date explorer. Keyed by `createdAt` in the target user's timezone
 * so the result matches exactly the entries that colored the clicked cell
 * (see app/lib/analytics.ts bucketing). Org-scoped: inspecting another user
 * requires an admin in that user's org.
 */
export async function getDailyJournalDetails(targetUserId: string, dateStr: string): Promise<DayDetails> {
    const session = await auth()
    if (!session?.user) throw new Error("Unauthorized")

    const currentUserId = await resolveUserId(session)
    if (!currentUserId) throw new Error("User not found")

    let effectiveTargetId = currentUserId
    if (targetUserId && targetUserId !== currentUserId) {
        // Throws unless the session is an admin in the target user's org.
        await requireAdminForUser(targetUserId)
        effectiveTargetId = targetUserId
    }

    const timezone = await getUserTimezoneById(effectiveTargetId)
    const start = startOfDayInTimezone(dateStr, timezone)
    const end = endOfDayInTimezone(dateStr, timezone)

    const [entries, ruleCompletions] = await Promise.all([
        prisma.journalEntry.findMany({
            where: { userId: effectiveTargetId, createdAt: { gte: start, lte: end } },
            select: {
                id: true,
                answer: true,
                isLiked: true,
                prompt: { select: { content: true, type: true } },
            },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.ruleCompletion.findMany({
            where: { userId: effectiveTargetId, periodKey: dateStr },
            select: { rule: { select: { title: true } } },
        }),
    ])

    return buildDayDetails(entries, ruleCompletions.map(rc => rc.rule.title), dateStr)
}
