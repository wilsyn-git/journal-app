
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getUserStats } from "@/app/lib/analytics"
import { AdminUserSelector } from "@/components/AdminUserSelector"
import Link from "next/link"
import { ContributionHeatmap } from "@/components/ContributionHeatmap"
import { TimeOfDayChart } from "@/components/stats/TimeOfDayChart"
import { WordCloud } from "@/components/stats/WordCloud"
import { BadgeGrid } from "@/components/stats/BadgeGrid"

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function StatsPage({ searchParams }: Props) {
    const session = await auth()
    if (!session?.user) redirect("/login")

    const params = await searchParams;
    const viewUserId = typeof params.viewUserId === 'string' ? params.viewUserId : null;
    const isAdmin = session.user.role === 'ADMIN';

    let currentUserId = session.user.id;
    if (!currentUserId && session.user.email) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } })
        if (user) {
            currentUserId = user.id
        }
    }
    if (!currentUserId) redirect("/login");
    const targetUserId = (isAdmin && viewUserId) ? viewUserId : currentUserId;
    const isViewingSelf = targetUserId === currentUserId;

    // Fetch Target User Info
    let targetUserEmail = session.user.email;
    let targetUserName = session.user.name;

    if (!isViewingSelf) {
        const u = await prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true, name: true } });
        targetUserEmail = u?.email || 'Unknown';
        targetUserName = u?.name;
    }

    // Fetch Stats
    const stats = await getUserStats(targetUserId || "");

    // Fetch Branding (Active Org)
    const org = await prisma.organization.findFirst({
        orderBy: { users: { _count: 'desc' } }
    })

    // Prepare Admin Select List
    let allUsers: any[] = [];
    if (isAdmin) {
        allUsers = await prisma.user.findMany({ select: { id: true, email: true, name: true }, orderBy: { email: 'asc' } });
    }

    return (
        <div className="flex min-h-screen bg-black text-white">
            {/* Sidebar (Simplified) */}
            <div className="w-64 border-r border-white/10 hidden md:flex flex-col bg-black/50">
                <div className="p-6 border-b border-white/10">
                    <Link href="/dashboard" className="text-xl font-bold tracking-tighter text-white flex items-center gap-2">
                        {org?.logoUrl && <img src={org.logoUrl} alt="Logo" className="w-6 h-6 object-contain" />}
                        <span>{org?.siteName || "myJournal"}</span>
                    </Link>
                </div>
                <div className="p-4 flex-1">
                    <Link href="/dashboard" className="block p-3 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors mb-2">
                        ← Back to Journal
                    </Link>

                    {isAdmin && (
                        <div className="mt-8 border-t border-white/10 pt-4">
                            <AdminUserSelector users={allUsers} />
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                <div className="max-w-4xl mx-auto">
                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <h1 className="text-4xl font-bold text-white mb-2">
                                {isViewingSelf ? 'Your Statistics' : `${targetUserName || targetUserEmail}'s Statistics`}
                            </h1>
                            <p className="text-gray-400">Tracking your consistency and habits.</p>
                        </div>
                        {isViewingSelf && (
                            <div className="text-right">
                                <span className="text-3xl font-bold text-primary">{stats.currentStreak}</span>
                                <span className="text-sm text-gray-500 block uppercase tracking-wider">Current Streak</span>
                            </div>
                        )}
                    </div>

                    {/* Big Numbers Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <div className="text-3xl font-bold text-white mb-1">{stats.maxStreak}</div>
                            <div className="text-xs text-gray-500 uppercase tracking-widest">Max Streak</div>
                        </div>
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <div className="text-3xl font-bold text-white mb-1">{stats.daysCompleted}</div>
                            <div className="text-xs text-gray-500 uppercase tracking-widest">Days Logged</div>
                        </div>
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <div className="text-3xl font-bold text-white mb-1">{stats.totalEntries}</div>
                            <div className="text-xs text-gray-500 uppercase tracking-widest">Total Answers</div>
                        </div>
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <div className="text-3xl font-bold text-white mb-1">{stats.avgWords}</div>
                            <div className="text-xs text-gray-500 uppercase tracking-widest">Avg Words / Answer</div>
                        </div>
                    </div>

                    {/* Heatmap */}
                    <div className="mb-12">
                        <h2 className="text-xl font-bold text-white mb-4">Consistency Map</h2>
                        <div className="glass-card p-6 rounded-xl border border-white/10 overflow-x-auto custom-scrollbar min-h-[160px] flex flex-col justify-center">
                            <ContributionHeatmap data={stats.heatmap} weeksHistory={46} />
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                        {/* Time of Day */}
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <h2 className="text-xl font-bold text-white mb-4">When You Journal</h2>
                            <TimeOfDayChart data={stats.hourCounts} />
                        </div>
                        {/* Word Cloud */}
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <h2 className="text-xl font-bold text-white mb-4">Common Themes</h2>
                            <WordCloud words={stats.wordCloud} />
                        </div>
                    </div>

                    {/* Badges */}
                    <div className="mb-12">
                        <h2 className="text-xl font-bold text-white mb-4">Achievements</h2>
                        <BadgeGrid badges={stats.badges} />
                    </div>

                    {/* Task Streaks */}
                    <h2 className="text-2xl font-bold text-white mb-6">Habit Consistency</h2>
                    {stats.taskStats.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4">
                            {stats.taskStats.map((task: any) => (
                                <div key={task.id} className="glass-card p-4 rounded-xl border border-white/10 flex justify-between items-center group hover:bg-white/5 transition-colors">
                                    <div className="flex-1">
                                        <h3 className="text-white font-medium">{task.content}</h3>
                                        <p className="text-xs text-gray-500 mt-1">Answered {task.count} times total</p>
                                    </div>
                                    <div className="flex gap-8 text-right">
                                        <div>
                                            <span className="block text-xl font-bold text-green-400">{task.currentStreak}</span>
                                            <span className="text-[10px] text-gray-500 uppercase">Streak</span>
                                        </div>
                                        <div>
                                            <span className="block text-xl font-bold text-gray-300">{task.maxStreak}</span>
                                            <span className="text-[10px] text-gray-500 uppercase">Best</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-gray-500 italic p-8 glass-card rounded-xl border border-white/10">
                            No daily habits (checkbox/radio prompts) tracked yet.
                        </div>
                    )}

                </div>
            </div>
        </div>
    )
}
