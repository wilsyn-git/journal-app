import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { join } from "path"
import { promisify } from "util"
import { gzip } from "zlib"
import fs from "fs/promises"

const gzipAsync = promisify(gzip)

export async function GET() {
    try {
        // 1. Security Check
        const session = await auth()
        // Force type assertion or check properties safely since NextAuth types can be tricky
        const user = session?.user as any

        if (!user || user.role !== 'ADMIN') {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        // 2. Data Fetching
        const organizations = await prisma.organization.findMany()

        const users = await prisma.user.findMany({
            include: {
                profiles: { select: { id: true } },
                groups: { select: { id: true } }
            }
        })

        const profiles = await prisma.profile.findMany({
            include: {
                groups: { select: { id: true } }
            }
        })

        const groups = await prisma.userGroup.findMany() // Relations likely captured on the other side or symmetric
        const prompts = await prisma.prompt.findMany()
        const categories = await prisma.promptCategory.findMany()
        const rules = await prisma.profileRule.findMany()
        const entries = await prisma.journalEntry.findMany()
        const avatars = await prisma.userAvatar.findMany()

        // 3. Process Binary Data
        const publicDir = join(process.cwd(), 'public')

        const organizationsWithLogos = await Promise.all(organizations.map(async (org) => {
            if (org.logoUrl) {
                try {
                    const filePath = join(publicDir, org.logoUrl)
                    const buffer = await fs.readFile(filePath)
                    return { ...org, base64Data: `data:image/png;base64,${buffer.toString('base64')}` }
                } catch (e) {
                    console.warn(`Failed to export logo for org ${org.id}`, e)
                }
            }
            return org
        }))

        const avatarsWithImages = await Promise.all(avatars.map(async (av) => {
            if (av.url) {
                try {
                    const filePath = join(publicDir, av.url)
                    // Basic file check
                    const buffer = await fs.readFile(filePath)
                    return { ...av, base64Data: `data:image/jpeg;base64,${buffer.toString('base64')}` }
                } catch (e) {
                    console.warn(`Failed to export avatar ${av.id}`, e)
                }
            }
            return av
        }))

        // 4. Construct Backup Object
        const backupData = {
            meta: {
                version: "1.0",
                date: new Date().toISOString(),
                exportedBy: user.email,
                compression: "gzip"
            },
            data: {
                organizations: organizationsWithLogos,
                users,
                profiles,
                groups,
                prompts,
                categories,
                rules,
                entries,
                avatars: avatarsWithImages
            }
        }

        // 5. Compress
        const jsonString = JSON.stringify(backupData, null, 2)
        const compressedBuffer = await gzipAsync(jsonString)

        // 6. Return Response
        // Determine Site Identity from the current user's organization
        // We look for the org that matches the admin's organizationId, fallback to the first one
        const primaryOrg = organizations.find(o => o.id === user.organizationId) || organizations[0]
        const orgName = primaryOrg?.siteName || 'JournalSystem'
        const safeIdentity = orgName.replace(/[^a-zA-Z0-9]/g, '') // Remove spaces and special chars

        // Format Date: YYYY_MM_DD_HH_MM_SS
        const now = new Date()
        const yyyy = now.getFullYear()
        const mm = String(now.getMonth() + 1).padStart(2, '0')
        const dd = String(now.getDate()).padStart(2, '0')
        const hh = String(now.getHours()).padStart(2, '0')
        const min = String(now.getMinutes()).padStart(2, '0')
        const ss = String(now.getSeconds()).padStart(2, '0')
        const timestamp = `${yyyy}_${mm}_${dd}_${hh}_${min}_${ss}`

        const filename = `${safeIdentity}_backup_${timestamp}.json.gz`

        return new NextResponse(compressedBuffer, {
            headers: {
                "Content-Type": "application/gzip",
                "Content-Disposition": `attachment; filename="${filename}"`
            }
        })

    } catch (error) {
        console.error("Export API Error:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}
