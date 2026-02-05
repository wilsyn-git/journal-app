
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export default async function AdminPage() {
    const session = await auth()
    const organizationId = session?.user?.organizationId

    if (!organizationId) {
        redirect("/dashboard")
    }

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Parallelize queries for performance
    // Parallelize queries for performance
    const [
        totalUsers,
        activeUsers,
        totalEntries,
        recentEntries,
        activePrompts
    ] = await Promise.all([
        // Total Users in Org
        prisma.user.count({
            where: {
                organizationId,
                excludeFromStats: false
            }
        }),
        // Active Users (Last 7 Days)
        prisma.user.count({
            where: {
                organizationId,
                lastLogin: { gte: sevenDaysAgo },
                excludeFromStats: false
            }
        }),
        // Total Entries in Org
        prisma.journalEntry.count({
            where: {
                user: {
                    organizationId,
                    excludeFromStats: false
                }
            }
        }),
        // Recent Entries (Last 7 Days)
        prisma.journalEntry.count({
            where: {
                user: {
                    organizationId,
                    excludeFromStats: false
                },
                createdAt: { gte: sevenDaysAgo }
            }
        }),
        // Active Prompts in Org
        prisma.prompt.count({
            where: {
                organizationId,
                isActive: true
            }
        })
    ])

    // Calculate Response Rate: (Recent Entries) / (Active Users * Active Prompts * 7)
    // This approximates the % of meaningful opportunities taken
    // We prevent division by zero if no prompts or users exist
    const denominator = activeUsers * activePrompts * 7
    const responseRate = denominator > 0
        ? Math.round((recentEntries / denominator) * 100)
        : 0

    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-8">Overview</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Core Stats */}
                <div className="glass-card p-6 rounded-xl border border-white/10 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <h3 className="text-muted-foreground text-sm font-medium uppercase relative z-10">Total Users</h3>
                    <div className="flex items-baseline gap-2 mt-2 relative z-10">
                        <p className="text-4xl font-bold text-white">{totalUsers}</p>
                        <p className="text-sm text-green-400">
                            {activeUsers} active (7d)
                        </p>
                    </div>
                </div>

                <div className="glass-card p-6 rounded-xl border border-white/10 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <h3 className="text-muted-foreground text-sm font-medium uppercase relative z-10">Total Journal Entries</h3>
                    <div className="flex items-baseline gap-2 mt-2 relative z-10">
                        <p className="text-4xl font-bold text-white">{totalEntries}</p>
                        <p className="text-sm text-green-400">
                            +{recentEntries} this week
                        </p>
                    </div>
                </div>

                <div className="glass-card p-6 rounded-xl border border-white/10 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <h3 className="text-muted-foreground text-sm font-medium uppercase relative z-10">Active Prompts</h3>
                    <p className="text-4xl font-bold text-white mt-2 relative z-10">{activePrompts}</p>
                </div>
            </div>

            {/* Engagement Stats */}
            <h2 className="text-xl font-bold text-white mb-4">Engagement</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-6 rounded-xl border border-white/10">
                    <h3 className="text-muted-foreground text-sm font-medium uppercase">Response Rate</h3>
                    <p className="text-4xl font-bold text-white mt-2">{responseRate}%</p>
                    <p className="text-xs text-gray-400 mt-1">Avg daily completion per active user</p>
                </div>
            </div>
        </div>
    )
}
