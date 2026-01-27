'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function updateLastActive() {
    const session = await auth()
    if (!session?.user?.id) return

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { lastLogin: true }
        })

        if (!user) return

        // Throttle: Only update if last update was > 1 hour ago
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

        if (!user.lastLogin || user.lastLogin < oneHourAgo) {
            await prisma.user.update({
                where: { id: session.user.id },
                data: { lastLogin: new Date() }
            })
        }
    } catch (error) {
        // Silently fail to avoid disrupting the UI
        console.error("Failed to update activity", error)
    }
}
