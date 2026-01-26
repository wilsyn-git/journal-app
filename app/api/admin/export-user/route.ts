import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
    try {
        // 1. Admin Auth Check
        const session = await auth()
        if (session?.user?.role !== 'ADMIN') {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        // 2. Get Target User ID from URL
        const { searchParams } = new URL(request.url)
        const targetUserId = searchParams.get('userId')

        if (!targetUserId) {
            return new NextResponse("User ID required", { status: 400 })
        }

        // 3. Fetch Data (Target User's entries)
        const entries = await prisma.journalEntry.findMany({
            where: {
                userId: targetUserId
            },
            include: {
                prompt: true
            },
            orderBy: {
                date: 'desc'
            }
        })

        // 4. Fetch User Profile for Filename
        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { name: true, email: true }
        })

        // 5. Transform Data
        // Format: { "January 25, 2026": { "Prompt": "Answer" } }
        const exportData: Record<string, Record<string, string>> = {}

        for (const entry of entries) {
            // Format Date: "January 25, 2026"
            const dateObj = new Date(entry.date)
            const dateKey = dateObj.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })

            if (!exportData[dateKey]) {
                exportData[dateKey] = {}
            }

            const question = entry.prompt.content
            const answer = entry.answer || "na"

            exportData[dateKey][question] = answer
        }

        // 6. Return JSON
        const jsonString = JSON.stringify(exportData, null, 2)

        // Filename: "username"_export_YYYYMMDD_HHMMSS.json
        const rawName = targetUser?.name || targetUser?.email || "user"
        const cleanName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '') || "user"

        const now = new Date()
        const yyyy = now.getFullYear()
        const mm = String(now.getMonth() + 1).padStart(2, '0')
        const dd = String(now.getDate()).padStart(2, '0')
        const hh = String(now.getHours()).padStart(2, '0')
        const min = String(now.getMinutes()).padStart(2, '0')
        const ss = String(now.getSeconds()).padStart(2, '0')

        const timestamp = `${yyyy}${mm}${dd}_${hh}${min}${ss}`
        const filename = `${cleanName}_backup_${timestamp}.json`

        return new NextResponse(jsonString, {
            headers: {
                "Content-Type": "application/json",
                "Content-Disposition": `attachment; filename="${filename}"`
            }
        })

    } catch (error) {
        console.error("Admin User Export API Error:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}
