'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { writeFile, unlink } from "fs/promises"
import { join } from "path"
import { mkdir } from "fs/promises"

export async function updateBranding(formData: FormData) {
    const session = await auth()
    if (!session?.user?.email) return { error: "Not authenticated" }

    // Fetch user with role
    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { role: true, organizationId: true }
    })

    if (!user || user.role !== 'ADMIN') {
        return { error: "Not authorized" }
    }

    const siteName = formData.get("siteName") as string
    const logoFile = formData.get("logo") as File | null

    try {
        const updateData: any = {}

        if (siteName) {
            updateData.siteName = siteName
        }

        if (logoFile && logoFile.size > 0) {
            // Validate
            if (logoFile.size > 2 * 1024 * 1024) return { error: "Logo must be under 2MB" }
            if (!logoFile.type.startsWith("image/")) return { error: "Invalid file type" }

            const buffer = Buffer.from(await logoFile.arrayBuffer())

            // Ensure directory exists
            const uploadDir = join(process.cwd(), "public", "uploads", "org", user.organizationId)
            await mkdir(uploadDir, { recursive: true })

            // Create filename (timestamp to bust cache)
            const filename = `logo-${Date.now()}.png` // Force PNG extension or detect? simpler to just keep extension or force one.
            // Let's keep original extension or just use png/jpg. keeping it simple.
            const path = join(uploadDir, filename)

            // Write file
            await writeFile(path, buffer)

            // Cleanup old logo if exists
            const org = await prisma.organization.findUnique({ where: { id: user.organizationId } })
            if (org?.logoUrl) {
                // Try delete old file
                const oldPath = join(process.cwd(), "public", org.logoUrl)
                try {
                    await unlink(oldPath)
                } catch (e) {
                    console.warn("Failed to delete old logo", e)
                }
            }

            // Save relative path
            updateData.logoUrl = `/uploads/org/${user.organizationId}/${filename}`
        }

        await prisma.organization.update({
            where: { id: user.organizationId },
            data: updateData
        })

        revalidatePath("/") // Revalidate everything
        return { success: true }

    } catch (error) {
        console.error("Failed to update branding. Details:", error)
        return { error: `Failed to update settings: ${error instanceof Error ? error.message : String(error)}` }
    }
}
