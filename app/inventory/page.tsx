import type { Metadata } from 'next'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { resolveUserId } from '@/lib/auth-helpers'
import { getInventory, getFrozenDates } from '@/app/lib/inventoryData'
import { getActiveOrganization } from '@/app/lib/data'
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
                    <h1 className="text-4xl font-bold text-white mb-8">Inventory</h1>

                    {/* Streak Freezes */}
                    <div className="glass-card p-5 rounded-xl border border-white/10 mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">🧊</span>
                                <span className="text-lg font-bold text-white">Streak Freezes</span>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-bold text-sky-400">{inventory.freezeCount}</span>
                                <span className="text-sm text-gray-500">/ {inventory.maxQuantity}</span>
                            </div>
                        </div>

                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Next freeze</span>
                            <span className="text-sky-300">{inventory.earningCounter} / {inventory.earningInterval}</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-sky-500 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>

                    {/* Usage History */}
                    {sortedFrozenDates.length > 0 && (
                        <div className="glass-card p-5 rounded-xl border border-white/10">
                            <h3 className="text-sm font-medium text-gray-400 mb-3">Used</h3>
                            <div className="space-y-1">
                                {sortedFrozenDates.map((date) => (
                                    <div key={date} className="flex items-center gap-2 py-1.5 text-sm text-gray-300">
                                        <span className="text-xs">🧊</span>
                                        {new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                        })}
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
