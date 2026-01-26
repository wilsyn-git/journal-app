'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function toggleEntryLike(entryId: string) {
    try {
        const session = await auth()
        const user = session?.user as any; // Cast to access role
        if (!user || user.role !== 'ADMIN') {
            return { error: "Unauthorized" }
        }

        const entry = await prisma.journalEntry.findUnique({
            where: { id: entryId }
        })

        if (!entry) return { error: "Entry not found" }

        const updated = await prisma.journalEntry.update({
            where: { id: entryId },
            data: { isLiked: !entry.isLiked }
        })

        // Revalidate essential paths
        revalidatePath('/dashboard')
        revalidatePath(`/dashboard?viewUserId=${updated.userId}`)
        // Also revalidate the stats page if we ever show likes there

        return { success: true, isLiked: updated.isLiked }
    } catch (e) {
        console.error("Failed to toggle like:", e)
        return { error: "Failed to update" }
    }
}
