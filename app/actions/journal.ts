'use server'

import { signIn, auth } from '@/auth'
import { AuthError } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { resolveUserId } from '@/lib/auth-helpers'
import { getUserTimezoneById, startOfDayInTimezone, endOfDayInTimezone, getTodayForUser } from "@/lib/timezone"
import { revalidatePath } from 'next/cache'

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
        // Join multiple values (checkboxes) with a delimiter or JSON array
        // Let's use JSON array for multiple values, plain string for single.
        // OR just JSON stringify everything for consistency if multiple?
        // Simpler: comma separated for now, or JSON.
        const answer = values.length > 1 ? JSON.stringify(values) : values[0];

        entries.push({
            userId,
            promptId: promptId,
            answer: answer
        })
    }

    // Save entries
    try {
        for (const entry of entries) {
            if (entry.answer.length > 10000) continue
            await prisma.journalEntry.create({
                data: {
                    userId: entry.userId,
                    promptId: entry.promptId,
                    answer: entry.answer
                }
            })
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
