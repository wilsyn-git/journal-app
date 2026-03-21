import { prisma } from "@/lib/prisma"
import type { Session } from "next-auth"

/**
 * Resolve a user ID from a session, falling back to an email lookup
 * if the ID is not directly available on the session object.
 */
export async function resolveUserId(session: Session | null): Promise<string | null> {
    let userId = session?.user?.id
    if (!userId && session?.user?.email) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } })
        if (user) userId = user.id
    }
    return userId || null
}
