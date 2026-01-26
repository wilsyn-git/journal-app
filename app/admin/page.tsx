
import { prisma } from "@/lib/prisma"

export default async function AdminPage() {
    const userCount = await prisma.user.count()
    const entryCount = await prisma.journalEntry.count()
    const activePromptCount = await prisma.prompt.count({ where: { isActive: true } })

    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-8">Overview</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-6 rounded-xl border border-white/10">
                    <h3 className="text-muted-foreground text-sm font-medium uppercase">Total Users</h3>
                    <p className="text-4xl font-bold text-white mt-2">{userCount}</p>
                </div>
                <div className="glass-card p-6 rounded-xl border border-white/10">
                    <h3 className="text-muted-foreground text-sm font-medium uppercase">Total Journal Entries</h3>
                    <p className="text-4xl font-bold text-white mt-2">{entryCount}</p>
                </div>
                <div className="glass-card p-6 rounded-xl border border-white/10">
                    <h3 className="text-muted-foreground text-sm font-medium uppercase">Active Prompts</h3>
                    <p className="text-4xl font-bold text-white mt-2">{activePromptCount}</p>
                </div>
            </div>
        </div>
    )
}
