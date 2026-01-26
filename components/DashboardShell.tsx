'use client'

import { useState } from 'react'
import Link from 'next/link'
import { StreakBadge } from './StreakBadge'
import { useBranding } from './BrandingProvider'

type Props = {
    sidebar: React.ReactNode
    children: React.ReactNode
    streak: number
}

export function DashboardShell({ sidebar, children, streak }: Props) {
    const [isSidebarOpen, setSidebarOpen] = useState(false)
    const { siteName, logoUrl } = useBranding()

    return (
        <div className="flex w-full h-screen bg-background text-foreground overflow-hidden">
            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar Container */}
            <aside
                className={`
                    fixed md:relative z-40 h-full w-64 flex flex-col border-r border-white/10 bg-black/90 md:bg-black/20 backdrop-blur-md transition-transform duration-300 ease-in-out
                    ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                `}
            >
                {/* Mobile Close Button (Optional, implies clicking outside works, but good to have) */}
                <div className="md:hidden absolute top-4 right-4 z-50">
                    <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">
                        ✕
                    </button>
                </div>

                {sidebar}
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative z-10 w-full h-full overflow-hidden">
                {/* Mobile Header */}
                <header className="md:hidden border-b border-white/10 p-4 flex justify-between items-center bg-background/80 backdrop-blur-md sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-1 -ml-2 text-gray-300 hover:text-white"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <Link href="/dashboard" className="text-lg font-bold text-white flex items-center gap-2">
                            {logoUrl && <img src={logoUrl} alt="Logo" className="w-6 h-6 object-contain" />}
                            <span>{siteName}</span>
                        </Link>
                    </div>

                    <div className="flex items-center gap-3">
                        <StreakBadge streak={streak} />
                    </div>
                </header>

                {children}
            </main>
        </div>
    )
}
