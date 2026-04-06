
import type { Metadata } from "next"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { resolveUserId } from "@/lib/auth-helpers"
import { getUserStats } from "@/app/lib/analytics"
import { getActiveOrganization } from "@/app/lib/data"
import { getInventory } from '@/app/actions/inventory'
import { AdminUserSelector } from "@/components/AdminUserSelector"
import Link from "next/link"
import Image from "next/image"
import { SidebarHeader } from "@/components/SidebarHeader"
import { ContributionHeatmap } from "@/components/ContributionHeatmap"
import { TimeOfDayChart } from "@/components/stats/TimeOfDayChart"
import { WordCloud } from "@/components/stats/WordCloud"
import { BadgeGrid } from "@/components/stats/BadgeGrid"
import { TrendChart } from "@/components/stats/TrendChart"

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export const metadata: Metadata = {
    title: 'Stats | myJournal',
}

export default async function StatsPage({ searchParams }: Props) {
    const session = await auth()
    if (!session?.user) redirect("/login")

    const params = await searchParams;
    const viewUserId = typeof params.viewUserId === 'string' ? params.viewUserId : null;
    const isAdmin = session.user.role === 'ADMIN';

    const currentUserId = await resolveUserId(session)
    if (!currentUserId) redirect("/login");
    const targetUserId = (isAdmin && viewUserId) ? viewUserId : currentUserId;
    const isViewingSelf = targetUserId === currentUserId;

    // Fetch stats, org, target user info, and admin user list in parallel
    const [stats, org, targetUserInfo, allUsers, inventoryData] = await Promise.all([
        getUserStats(targetUserId || ""),
        getActiveOrganization(),
        !isViewingSelf
            ? prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true, name: true } })
            : Promise.resolve(null),
        isAdmin
            ? prisma.user.findMany({ select: { id: true, email: true, name: true }, orderBy: { email: 'asc' } })
            : Promise.resolve([] as any[]),
        isViewingSelf ? getInventory(targetUserId) : Promise.resolve(null),
    ]);

    const targetUserEmail = !isViewingSelf ? (targetUserInfo?.email || 'Unknown') : session.user.email;
    const targetUserName = !isViewingSelf ? targetUserInfo?.name : session.user.name;

    return (
        <div className="flex min-h-screen bg-black text-white">
            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-20 border-b border-white/10 bg-black/90 backdrop-blur-md px-4 py-3 flex items-center gap-3">
                <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </Link>
                <span className="text-lg font-semibold text-white">Stats</span>
            </div>

            {/* Sidebar (Simplified) */}
            <div className="w-64 border-r border-white/10 hidden md:flex flex-col bg-black/50">
                <div className="p-6 border-b border-white/10">
                    <SidebarHeader logoUrl={org?.logoUrl} siteName={org?.siteName} />
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
            <main id="main-content" className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-16 md:pt-8">
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
                                <span className="text-sm text-gray-400 block uppercase tracking-wider">Current Streak</span>
                            </div>
                        )}
                    </div>

                    {/* Big Numbers Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <div className="text-3xl font-bold text-white mb-1">{stats.maxStreak}</div>
                            <div className="text-xs text-gray-400 uppercase tracking-widest">Max Streak</div>
                        </div>
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <div className="text-3xl font-bold text-white mb-1">{stats.daysCompleted}</div>
                            <div className="text-xs text-gray-400 uppercase tracking-widest">Days Logged</div>
                        </div>
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <div className="text-3xl font-bold text-white mb-1">{stats.totalEntries}</div>
                            <div className="text-xs text-gray-400 uppercase tracking-widest">Total Answers</div>
                        </div>
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <div className="text-3xl font-bold text-white mb-1">{stats.avgWords}</div>
                            <div className="text-xs text-gray-400 uppercase tracking-widest">Avg Words / Answer</div>
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

                    {/* Trends (Slider Prompts) */}
                    {stats.trendStats && stats.trendStats.length > 0 && (
                        <div className="mb-12">
                            <h2 className="text-2xl font-bold text-white mb-6">Trends Over Time</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {stats.trendStats.map((trend: any) => (
                                    <div key={trend.id} className="glass-card p-6 rounded-xl border border-white/10">
                                        <TrendChart data={trend.data} name={trend.name} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Badges */}
                    <div className="mb-12">
                        <h2 className="text-xl font-bold text-white mb-4">Achievements</h2>
                        <BadgeGrid badges={stats.badges} />
                        {isViewingSelf && inventoryData && (
                            <div className="mt-4 glass-card p-4 rounded-xl border border-white/10 flex items-center gap-3">
                                <span className="text-2xl">🧊</span>
                                <div className="flex-1">
                                    {inventoryData.freezeCount < inventoryData.maxQuantity ? (
                                        <>
                                            <span className="text-sm text-white font-medium">
                                                {inventoryData.earningInterval - inventoryData.earningCounter} days from +1 Streak Freeze
                                            </span>
                                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-1">
                                                <div
                                                    className="h-full bg-sky-500 rounded-full"
                                                    style={{ width: `${Math.round((inventoryData.earningCounter / inventoryData.earningInterval) * 100)}%` }}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-sm text-sky-400">
                                            Streak Freezes at max ({inventoryData.maxQuantity}/{inventoryData.maxQuantity})
                                        </span>
                                    )}
                                </div>
                                <Link href="/inventory" className="text-xs text-sky-400 hover:text-white transition-colors">
                                    View
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Task Streaks */}
                    <h2 className="text-2xl font-bold text-white mb-6">Habit Consistency</h2>
                    {stats.taskStats.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4">
                            {stats.taskStats.map((task: any) => (
                                <div key={task.id} className="glass-card p-4 rounded-xl border border-white/10 flex justify-between items-center group hover:bg-white/5 transition-colors">
                                    <div className="flex-1">
                                        <h3 className="text-white font-medium">{task.content}</h3>
                                        <p className="text-xs text-gray-400 mt-1">Answered {task.count} times total</p>
                                    </div>
                                    <div className="flex gap-8 text-right">
                                        <div>
                                            <span className="block text-xl font-bold text-green-400">{task.currentStreak}</span>
                                            <span className="text-xs text-gray-400 uppercase">Streak</span>
                                        </div>
                                        <div>
                                            <span className="block text-xl font-bold text-gray-300">{task.maxStreak}</span>
                                            <span className="text-xs text-gray-400 uppercase">Best</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-muted-foreground italic p-8 glass-card rounded-xl border border-white/10">
                            No daily habits tracked yet. Complete journal entries with checkbox or radio prompts to see habit tracking here.
                        </div>
                    )}

                </div>
            </main>
        </div>
    )
}
