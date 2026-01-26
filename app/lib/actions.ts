'use server'

import { signIn, auth } from '@/auth'
import { AuthError } from 'next-auth'
import { prisma } from '@/lib/prisma'
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
            userId: session.user.id,
            promptId: promptId,
            answer: answer
        })
    }

    // NOTE: Session User ID is NOT in the default session type unless we add it. 
    // We need to fetch user by email if ID is missing or extend the session type.
    // For now, let's fetch user by email from session.

    if (!session.user.id && session.user.email) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } })
        if (user) {
            // Update entries with real ID
            entries.forEach(e => e.userId = user.id)
        } else {
            throw new Error("User not found")
        }
    }

    // Save entries
    try {
        for (const entry of entries) {
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
    const session = await auth()
    if (!session?.user?.email) throw new Error("Unauthorized")

    let userId = session.user.id;
    if (!userId) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } })
        if (!user) throw new Error("User not found")
        userId = user.id;
    }

    // Determine "Today" (Server Time)
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

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
