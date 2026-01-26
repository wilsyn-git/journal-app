
import React from 'react'

export function StreakBadge({ streak }: { streak: number }) {
    return (
        <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30 rounded-full">
            <span className="text-lg">🔥</span>
            <div className="flex flex-col">
                <span className="text-lg font-bold text-orange-400 leading-none">{streak}</span>
                <span className="text-[10px] uppercase tracking-wider text-orange-300/70 font-medium">Day Streak</span>
            </div>
        </div>
    )
}
