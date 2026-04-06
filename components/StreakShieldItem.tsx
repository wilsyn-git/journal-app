'use client'

import { useState } from 'react'
import { STREAK_SHIELD } from '@/lib/inventory'

type Props = {
    shieldCount: number
    maxQuantity: number
    earningCounter: number
    earningInterval: number
    usageHistory: string[]
}

export function StreakShieldItem({ shieldCount, maxQuantity, earningCounter, earningInterval, usageHistory }: Props) {
    const [showInfo, setShowInfo] = useState(false)
    const progressPercent = Math.round((earningCounter / earningInterval) * 100)

    const lastUsed = usageHistory.length > 0
        ? new Date(usageHistory[0] + 'T12:00:00Z').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
        : null

    return (
        <div className="glass-card rounded-xl border border-white/10 relative">
            {/* Main row */}
            <div className="flex items-center gap-3 p-4">
                <span className="text-2xl">🛡️</span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3">
                        <span className="font-bold text-white">Streak Shields</span>
                        {lastUsed && (
                            <span className="text-xs text-gray-500">Last used: {lastUsed}</span>
                        )}
                    </div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">{earningCounter}/{earningInterval}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-baseline gap-0.5">
                        <span className="text-2xl font-bold text-amber-400">{shieldCount}</span>
                        <span className="text-xs text-gray-500">/{maxQuantity}</span>
                    </div>

                    {/* Info button */}
                    <button
                        onClick={() => setShowInfo(!showInfo)}
                        className="text-gray-500 hover:text-white transition-colors p-1"
                        aria-label="How streak shields work"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 16v-4" />
                            <path d="M12 8h.01" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Info popover */}
            {showInfo && (
                <div className="border-t border-white/5 px-4 py-3 text-xs text-gray-400 space-y-1.5">
                    <p>Journal <strong className="text-white">{STREAK_SHIELD.earningInterval} consecutive days</strong> to earn a shield.</p>
                    <p>Hold up to <strong className="text-white">{STREAK_SHIELD.maxQuantity}</strong> at a time. Shields cover missed days with no time limit.</p>
                    <p>When freezes can&apos;t reach, shields pick up the slack.</p>
                </div>
            )}
        </div>
    )
}
