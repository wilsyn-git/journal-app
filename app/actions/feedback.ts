'use server'

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { ensureAdmin } from './helpers'
import { setDayLike } from '@/lib/dayLike'

/**
 * Admin-only. Likes/unlikes a whole journal-day by setting isLiked on all of
 * that day's entries (the entry ids the client is currently displaying). The
 * desired `liked` value comes from the client's optimistic state — stateless,
 * no read-modify-write.
 */
export async function setJournalDayLike(entryIds: string[], liked: boolean) {
    try {
        const session = await ensureAdmin()
        await setDayLike(prisma, entryIds, session.user.organizationId, liked)
        // Revalidates /dashboard regardless of the ?viewUserId= query param,
        // so the admin's user-view refreshes too.
        revalidatePath('/dashboard')
        return { success: true as const }
    } catch (e) {
        console.error("Failed to set journal day like:", e)
        return { error: "Failed to update" }
    }
}
