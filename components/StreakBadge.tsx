
import React from 'react'

type Props = {
    streak: number
    freezeCount?: number
    shieldCount?: number
}

export function StreakBadge({ streak, freezeCount, shieldCount }: Props) {
    return (
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30 rounded-full">
                <span className="text-lg">🔥</span>
                <div className="flex flex-col">
                    <span className="text-lg font-bold text-orange-400 leading-none">{streak}</span>
                    <span className="text-xs uppercase tracking-wider text-orange-300/70 font-medium">Day Streak</span>
                </div>
            </div>
            {freezeCount !== undefined && freezeCount > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-sky-500/10 border border-sky-500/20 rounded-full" title={`${freezeCount} streak ${freezeCount === 1 ? 'freeze' : 'freezes'} available`}>
                    <span className="text-sm">🧊</span>
                    <span className="text-xs font-bold text-sky-300">{freezeCount}</span>
                </div>
            )}
            {shieldCount !== undefined && shieldCount > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full" title={`${shieldCount} streak ${shieldCount === 1 ? 'shield' : 'shields'} available`}>
                    <span className="text-sm">🛡️</span>
                    <span className="text-xs font-bold text-amber-300">{shieldCount}</span>
                </div>
            )}
        </div>
    )
}
