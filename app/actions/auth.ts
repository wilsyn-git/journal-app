'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { hash, compare } from "bcryptjs"
import { revalidatePath } from "next/cache"

type ChangePasswordResult = {
    success?: boolean
    error?: string
}

export async function changePassword(
    formData: FormData
): Promise<ChangePasswordResult> {
    const session = await auth()
    if (!session?.user?.email) return { error: "Not authenticated" }

    const targetUserId = formData.get("targetUserId") as string | null
    const currentPassword = formData.get("currentPassword") as string | null
    const newPassword = formData.get("newPassword") as string

    if (!newPassword || newPassword.length < 6) {
        return { error: "New password must be at least 6 characters" }
    }

    // Determine target user and authorization mode
    let userIdToUpdate = session.user.id
    let isAdminOverride = false

    if (targetUserId) {
        // Admin Mode Check
        if (session.user.role !== 'ADMIN') {
            return { error: "Unauthorized: Only admins can reset other users' passwords" }
        }
        userIdToUpdate = targetUserId
        isAdminOverride = true
    } else {
        // Self Change Mode Check
        if (!currentPassword) {
            return { error: "Current password is required" }
        }
        // Verify current password
        const user = await prisma.user.findUnique({ where: { id: session.user.id } })
        if (!user || user.password === null) {
            // Handle edge case where user might not have a password (e.g. OAuth only? Not applicable here yet)
            return { error: "User not found" }
        }

        // Compare hash
        const isValid = await compare(currentPassword, user.password)
        if (!isValid) {
            return { error: "Incorrect current password" }
        }
    }

    try {
        const hashedPassword = await hash(newPassword, 12)

        await prisma.user.update({
            where: { id: userIdToUpdate },
            data: { password: hashedPassword }
        })

        // No forced logout needed, session remains valid.

        revalidatePath("/")
        return { success: true }
    } catch (error) {
        console.error("Password change failed:", error)
        return { error: "Failed to update password" }
    }
}
