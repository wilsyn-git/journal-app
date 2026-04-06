import type { Metadata } from 'next'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { resolveUserId } from '@/lib/auth-helpers'
import { getInventory, getFrozenDates } from '@/app/lib/inventoryData'
import { getActiveOrganization } from '@/app/lib/data'
import Link from 'next/link'
import { SidebarHeader } from '@/components/SidebarHeader'
import { StreakFreezeItem } from '@/components/StreakFreezeItem'
import { StreakShieldItem } from '@/components/StreakShieldItem'

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

                    <StreakFreezeItem
                        freezeCount={inventory.freezeCount}
                        maxQuantity={inventory.maxQuantity}
                        earningCounter={inventory.earningCounter}
                        earningInterval={inventory.earningInterval}
                        usageHistory={sortedFrozenDates}
                    />
                    <div className="mt-3">
                        <StreakShieldItem
                            shieldCount={inventory.shieldCount}
                            maxQuantity={inventory.shieldMaxQuantity}
                            earningCounter={inventory.shieldEarningCounter}
                            earningInterval={inventory.shieldEarningInterval}
                            usageHistory={[]}
                        />
                    </div>
                </div>
            </main>
        </div>
    )
}
