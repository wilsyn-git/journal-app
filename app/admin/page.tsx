
import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export const metadata: Metadata = {
    title: 'Admin Dashboard | myJournal',
}

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
        activePrompts,
        openTaskCount,
        overdueTaskCount
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
        }),
        // Open Tasks (not archived)
        prisma.task.count({
            where: { organizationId, archivedAt: null }
        }),
        // Overdue Task Assignments
        prisma.taskAssignment.count({
            where: {
                completedAt: null,
                task: { organizationId, archivedAt: null, dueDate: { lt: new Date() } }
            }
        })
    ])

    // --- Weighted Response Rate Logic ---

    // Parallelize independent queries
    const [
        globalPromptCount,
        promptsByCategory,
        allProfiles,
        activeStatsUsers
    ] = await Promise.all([
        // 1. Get Global Prompt Count (Everyone sees these)
        prisma.prompt.count({
            where: { organizationId, isActive: true, isGlobal: true }
        }),
        // 2. Get Counts per Category (for 'includeAll' rules)
        prisma.prompt.groupBy({
            by: ['categoryId'],
            where: { organizationId, isActive: true, isGlobal: false },
            _count: { id: true }
        }),
        // 3. Get All Profiles and their Rules to build "Potential Map"
        prisma.profile.findMany({
            where: { organizationId },
            include: { rules: true }
        }),
        // 4. Get Users + Entries to calc actual opportunities
        prisma.user.findMany({
            where: {
                organizationId,
                excludeFromStats: false
            },
            include: {
                profiles: { select: { id: true } },
                groups: {
                    include: {
                        profiles: { select: { id: true } }
                    }
                },
                entries: {
                    where: { createdAt: { gte: sevenDaysAgo } },
                    select: { createdAt: true }
                }
            }
        })
    ]);

    const categoryCountMap = new Map<string, number>();
    promptsByCategory.forEach(p => {
        if (p.categoryId) categoryCountMap.set(p.categoryId, p._count.id);
    });

    const profilePotentialMap = new Map<string, number>();

    allProfiles.forEach(profile => {
        let count = 0;
        profile.rules.forEach(rule => {
            if (rule.includeAll) {
                // Add all active prompts in this category
                if (rule.categoryId) {
                    count += categoryCountMap.get(rule.categoryId) || 0;
                }
                // Legacy support: if categoryString is used but no ID, we might miss it
                // ideally we rely on ID now.
            } else {
                // Add min(maxCount, available) or just maxCount
                // For simpler calc, we assume maxCount is the target opportunity
                count += rule.maxCount;
            }
        });
        profilePotentialMap.set(profile.id, count);
    });

    let totalWeightedOpportunity = 0;
    let totalWeightedAnswers = 0;

    activeStatsUsers.forEach(user => {
        // Collect effective profile IDs
        const effectiveProfileIds = new Set<string>();
        user.profiles.forEach(p => effectiveProfileIds.add(p.id));
        user.groups.forEach(g => g.profiles.forEach(p => effectiveProfileIds.add(p.id)));

        // Calc Daily Potential for this user
        let dailyPotential = globalPromptCount;
        effectiveProfileIds.forEach(pid => {
            dailyPotential += profilePotentialMap.get(pid) || 0;
        });

        // Determine Active Days (Unique Dates in UTC/Local approximation)
        const activeDaysSet = new Set<string>();
        user.entries.forEach(e => {
            activeDaysSet.add(e.createdAt.toISOString().split('T')[0]);
        });
        const activeDays = activeDaysSet.size;

        if (activeDays > 0) {
            totalWeightedOpportunity += (activeDays * dailyPotential);
            totalWeightedAnswers += user.entries.length;
        }
    });

    const responseRate = totalWeightedOpportunity > 0
        ? Math.round((totalWeightedAnswers / totalWeightedOpportunity) * 100)
        : 0;

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

                <Link href="/admin/tasks">
                    <div className="glass-card p-6 rounded-xl border border-white/10 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-amber-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <h3 className="text-muted-foreground text-sm font-medium uppercase relative z-10">Open Tasks</h3>
                        <div className="flex items-baseline gap-2 mt-2 relative z-10">
                            <p className="text-4xl font-bold text-white">{openTaskCount}</p>
                            <p className={`text-sm ${overdueTaskCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {overdueTaskCount > 0 ? `${overdueTaskCount} overdue` : 'All on track'}
                            </p>
                        </div>
                    </div>
                </Link>
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
