import type { Metadata } from 'next'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { resolveUserId } from '@/lib/auth-helpers'
import { getInventory, getFrozenDates } from '@/app/lib/inventoryData'
import { getActiveOrganization } from '@/app/lib/data'
import { STREAK_FREEZE } from '@/lib/inventory'
import Link from 'next/link'
import { SidebarHeader } from '@/components/SidebarHeader'

export const metadata: Metadata = {
    title: 'Inventory | myJournal',
}

export default async function InventoryPage() {
    const session = await auth()
    if (!session?.user) redirect('/login')

    const userId = await resolveUserId(session)
    if (!userId) redirect('/login')

    const [inventory, frozenDates, org] = await Promise.all([
        getInventory(userId),
        getFrozenDates(userId),
        getActiveOrganization(),
    ])

    const progressPercent = Math.round((inventory.earningCounter / inventory.earningInterval) * 100)
    const daysUntilNext = inventory.earningInterval - inventory.earningCounter

    // Sort frozen dates descending for usage history
    const sortedFrozenDates = [...frozenDates].sort().reverse()

    return (
        <div className="flex min-h-screen bg-black text-white">
            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-20 border-b border-white/10 bg-black/90 backdrop-blur-md px-4 py-3 flex items-center gap-3">
                <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </Link>
                <span className="text-lg font-semibold text-white">Inventory</span>
            </div>

            {/* Sidebar */}
            <div className="w-64 border-r border-white/10 hidden md:flex flex-col bg-black/50">
                <div className="p-6 border-b border-white/10">
                    <SidebarHeader logoUrl={org?.logoUrl} siteName={org?.siteName} />
                </div>
                <div className="p-4 flex-1">
                    <Link href="/dashboard" className="block p-3 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors mb-2">
                        ← Back to Journal
                    </Link>
                </div>
            </div>

            {/* Main Content */}
            <main id="main-content" className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-16 md:pt-8">
                <div className="max-w-2xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-4xl font-bold text-white mb-2">Inventory</h1>
                        <p className="text-gray-400">Items you&apos;ve earned through consistent journaling.</p>
                    </div>

                    {/* Streak Freezes Card */}
                    <div className="glass-card p-6 rounded-xl border border-white/10 mb-8">
                        <div className="flex items-center gap-3 mb-6">
                            <span className="text-3xl">🧊</span>
                            <div>
                                <h2 className="text-xl font-bold text-white">Streak Freezes</h2>
                                <p className="text-sm text-gray-400">Protect your streak when life gets in the way</p>
                            </div>
                        </div>

                        {/* Count */}
                        <div className="flex items-baseline gap-2 mb-6">
                            <span className="text-5xl font-bold text-sky-400">{inventory.freezeCount}</span>
                            <span className="text-lg text-gray-400">/ {inventory.maxQuantity}</span>
                        </div>

                        {/* Earning Progress */}
                        <div className="mb-2">
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-400">Next freeze</span>
                                <span className="text-sky-300">{inventory.earningCounter} / {inventory.earningInterval} days</span>
                            </div>
                            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-sky-500 to-sky-400 rounded-full transition-all duration-500"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                            {inventory.freezeCount < inventory.maxQuantity ? (
                                <p className="text-xs text-gray-500 mt-1">
                                    {daysUntilNext} {daysUntilNext === 1 ? 'day' : 'days'} of journaling until your next freeze
                                </p>
                            ) : (
                                <p className="text-xs text-sky-400/60 mt-1">
                                    At maximum capacity
                                </p>
                            )}
                        </div>
                    </div>

                    {/* How It Works */}
                    <div className="glass-card p-6 rounded-xl border border-white/10 mb-8">
                        <h3 className="text-lg font-bold text-white mb-4">How It Works</h3>
                        <div className="space-y-3 text-sm text-gray-400">
                            <div className="flex gap-3">
                                <span className="text-sky-400 font-bold">1.</span>
                                <span>Journal for <strong className="text-white">14 consecutive days</strong> to earn a streak freeze</span>
                            </div>
                            <div className="flex gap-3">
                                <span className="text-sky-400 font-bold">2.</span>
                                <span>You can hold up to <strong className="text-white">{STREAK_FREEZE.maxQuantity} freezes</strong> at a time</span>
                            </div>
                            <div className="flex gap-3">
                                <span className="text-sky-400 font-bold">3.</span>
                                <span>If you miss a day, you&apos;ll see a prompt to use a freeze and keep your streak</span>
                            </div>
                            <div className="flex gap-3">
                                <span className="text-sky-400 font-bold">4.</span>
                                <span>You have <strong className="text-white">{STREAK_FREEZE.graceWindowDays} days</strong> to decide before the streak is lost</span>
                            </div>
                        </div>
                    </div>

                    {/* Usage History */}
                    {sortedFrozenDates.length > 0 && (
                        <div className="glass-card p-6 rounded-xl border border-white/10">
                            <h3 className="text-lg font-bold text-white mb-4">Usage History</h3>
                            <div className="space-y-2">
                                {sortedFrozenDates.map((date) => (
                                    <div key={date} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                                        <span className="text-sm">🧊</span>
                                        <span className="text-sm text-gray-300">
                                            {new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
                                                weekday: 'short',
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })}
                                        </span>
                                        <span className="text-xs text-gray-500">Streak preserved</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
