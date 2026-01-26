import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET() {
    try {
        // 1. Auth Check
        const session = await auth()
        if (!session?.user?.id) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        // 2. Fetch Data (User's entries only)
        const entries = await prisma.journalEntry.findMany({
            where: {
                userId: session.user.id
            },
            include: {
                prompt: true
            },
            orderBy: {
                date: 'desc'
            }
        })

        // 3. Transform Data
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

            // Clean prompt content (remove HTML tags if any, though usually plain text)
            const question = entry.prompt.content
            const answer = entry.answer || "na"

            exportData[dateKey][question] = answer
        }

        // 4. Return JSON
        const jsonString = JSON.stringify(exportData, null, 2)

        // Filename: "username"_export_YYYYMMDD_HHMMSS.json
        // Sanitize Username: Strip spaces/non-text, lowercase
        const rawName = session.user.name || "user"
        const cleanName = rawName.toLowerCase().replace(/[^a-z]/g, '') || "user"

        const now = new Date()
        const yyyy = now.getFullYear()
        const mm = String(now.getMonth() + 1).padStart(2, '0')
        const dd = String(now.getDate()).padStart(2, '0')
        const hh = String(now.getHours()).padStart(2, '0')
        const min = String(now.getMinutes()).padStart(2, '0')
        const ss = String(now.getSeconds()).padStart(2, '0')

        const timestamp = `${yyyy}${mm}${dd}_${hh}${min}${ss}`
        const filename = `${cleanName}_export_${timestamp}.json`

        return new NextResponse(jsonString, {
            headers: {
                "Content-Type": "application/json",
                "Content-Disposition": `attachment; filename="${filename}"`
            }
        })

    } catch (error) {
        console.error("User Export API Error:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}
