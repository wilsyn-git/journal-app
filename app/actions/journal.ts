'use server'

import { signIn, auth } from '@/auth'
import { AuthError } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { resolveUserId } from '@/lib/auth-helpers'
import { getUserTimezoneById, startOfDayInTimezone, endOfDayInTimezone, getTodayForUser } from "@/lib/timezone"
import { revalidatePath } from 'next/cache'
import { STREAK_FREEZE, STREAK_SHIELD, parseStreakFreezeMetadata } from '@/lib/inventory'

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
        // Streak freeze earning: increment counter if this is the user's first entry today
        try {
            const timezone = await getUserTimezoneById(userId)
            const todayStr = getTodayForUser(timezone)
            const startOfDay = startOfDayInTimezone(todayStr, timezone)
            const endOfDay = endOfDayInTimezone(todayStr, timezone)

            const todayEntryCount = await prisma.journalEntry.count({
                where: {
                    userId,
                    createdAt: { gte: startOfDay, lte: endOfDay },
                },
            })

            // Only increment on first entry of the day (the ones we just created count,
            // so if count equals the number we just inserted, this is the first batch)
            if (todayEntryCount <= validEntries.length) {
                const inventory = await prisma.userInventory.upsert({
                    where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
                    create: {
                        userId,
                        itemType: STREAK_FREEZE.itemType,
                        quantity: 0,
                        metadata: JSON.stringify({ earningCounter: 1 }),
                    },
                    update: {},
                    select: { quantity: true, metadata: true },
                })

                // If row already existed, increment the counter
                if (todayEntryCount > 0 || inventory.quantity > 0 || inventory.metadata) {
                    const meta = parseStreakFreezeMetadata(inventory.metadata)
                    const newCounter = meta.earningCounter + 1

                    if (newCounter >= STREAK_FREEZE.earningInterval) {
                        // Award a freeze (up to cap)
                        const newQuantity = Math.min(inventory.quantity + 1, STREAK_FREEZE.maxQuantity)
                        await prisma.userInventory.update({
                            where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
                            data: {
                                quantity: newQuantity,
                                metadata: JSON.stringify({ earningCounter: 0 }),
                            },
                        })
                    } else {
                        await prisma.userInventory.update({
                            where: { userId_itemType: { userId, itemType: STREAK_FREEZE.itemType } },
                            data: {
                                metadata: JSON.stringify({ earningCounter: newCounter }),
                            },
                        })
                    }
                }

                // Shield earning: same pattern, independent counter
                const shieldInventory = await prisma.userInventory.upsert({
                    where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
                    create: {
                        userId,
                        itemType: STREAK_SHIELD.itemType,
                        quantity: 0,
                        metadata: JSON.stringify({ earningCounter: 1 }),
                    },
                    update: {},
                    select: { quantity: true, metadata: true },
                })

                if (todayEntryCount > 0 || shieldInventory.quantity > 0 || shieldInventory.metadata) {
                    const shieldMeta = parseStreakFreezeMetadata(shieldInventory.metadata)
                    const newShieldCounter = shieldMeta.earningCounter + 1

                    if (newShieldCounter >= STREAK_SHIELD.earningInterval) {
                        const newShieldQty = Math.min(shieldInventory.quantity + 1, STREAK_SHIELD.maxQuantity)
                        await prisma.userInventory.update({
                            where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
                            data: {
                                quantity: newShieldQty,
                                metadata: JSON.stringify({ earningCounter: 0 }),
                            },
                        })
                    } else {
                        await prisma.userInventory.update({
                            where: { userId_itemType: { userId, itemType: STREAK_SHIELD.itemType } },
                            data: {
                                metadata: JSON.stringify({ earningCounter: newShieldCounter }),
                            },
                        })
                    }
                }
            }
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
