'use server'

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { writeFile, unlink } from "fs/promises"
import { join } from "path"
import { randomUUID } from 'crypto'

export async function updateProfile(userId: string, formData: FormData) {
    if (!userId) throw new Error("Unauthorized")

    const name = formData.get("name") as string
    const bio = formData.get("bio") as string
    const file = formData.get("avatar") as File

    // 1. Update basic info
    await prisma.user.update({
        where: { id: userId },
        data: { name, bio }
    })

    // 2. Handle Avatar Upload if present
    if (file && file.size > 0) {
        // Validation
        if (!file.type.startsWith("image/jpeg")) {
            throw new Error("Only JPG images are allowed")
        }
        if (file.size > 2 * 1024 * 1024) {
            throw new Error("Image must be smaller than 2MB")
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const filename = `${userId}-${randomUUID()}.jpg`
        const uploadDir = join(process.cwd(), "public/uploads/avatars")
        const filepath = join(uploadDir, filename)
        const url = `/uploads/avatars/${filename}`

        // Ensure directory exists (node fs/promises doesn't have ensureDir, assume public exists or we create it?)
        // Let's assume public/uploads/avatars exists for now or user manual creation? 
        // Better: try to mkdir
        const fs = require('fs')
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Write file
        await writeFile(filepath, buffer)

        // Find old active avatar to deactivate (and delete file)
        const oldAvatar = await prisma.userAvatar.findFirst({
            where: { userId, isActive: true }
        })

        if (oldAvatar && oldAvatar.url) {
            // Deactivate
            await prisma.userAvatar.update({
                where: { id: oldAvatar.id },
                data: { isActive: false, url: null } // Clear URL to indicate deleted file
            })

            // Delete old file
            try {
                const oldPath = join(process.cwd(), "public", oldAvatar.url)
                if (fs.existsSync(oldPath)) {
                    await unlink(oldPath)
                }
            } catch (e) {
                console.error("Failed to delete old avatar:", e)
            }
        }

        // Create new record
        await prisma.userAvatar.create({
            data: {
                userId,
                url,
                isActive: true
            }
        })
    }

    revalidatePath("/dashboard")
    revalidatePath("/settings")
    return { success: true }
}
