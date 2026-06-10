'use client'

type AchievementState = {
    id: string
    name: string
    icon: string
    currentTier: number
    currentLabel: string | null
    nextTier: { level: number; threshold: number; label: string } | null
    metricValue: number
    isMaxed: boolean
}

export function AchievementGrid({ achievements }: { achievements: AchievementState[] }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {achievements.map((a) => {
                const earned = a.currentTier > 0
                const progressPercent = a.nextTier
                    ? Math.min(100, Math.round((a.metricValue / a.nextTier.threshold) * 100))
                    : 100

                return (
                    <div
                        key={a.id}
                        className={`
                            achievement-card group relative overflow-hidden p-4 rounded-xl border transition-all duration-300
                            ${earned
                                ? 'bg-purple-900/20 border-purple-500/30 text-white hover:-translate-y-1.5 hover:scale-[1.02] hover:bg-purple-900/40 hover:border-purple-400/80 hover:shadow-[0_14px_36px_rgba(139,92,246,0.35),0_0_18px_rgba(139,92,246,0.25)]'
                                : 'bg-white/5 border-white/5 text-gray-500 hover:-translate-y-1 hover:scale-[1.01] hover:bg-white/10 hover:border-white/15'
                            }
                        `}
                    >
                        {earned && (
                            <div
                                className="achievement-shine absolute inset-0 z-0 pointer-events-none -translate-x-[120%] group-hover:animate-shine"
                                style={{
                                    background:
                                        'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.14) 50%, transparent 60%)',
                                }}
                            />
                        )}
                        <div className="flex items-start gap-3 relative z-10">
                            <span
                                className={`achievement-icon text-3xl transition-transform duration-300 ${earned ? 'group-hover:scale-[1.22] group-hover:rotate-6' : 'grayscale opacity-50'}`}
                            >
                                {a.icon}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm">{a.name}</div>
                                {a.isMaxed ? (
                                    <div className="text-xs text-purple-300 mt-1">
                                        {a.currentLabel} — Complete!
                                    </div>
                                ) : a.nextTier ? (
                                    <>
                                        <div className="text-xs text-gray-400 mt-1">
                                            {earned ? `${a.currentLabel} · ` : ''}
                                            Next: {a.nextTier.label}
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] text-gray-500 whitespace-nowrap">
                                                {a.metricValue}/{a.nextTier.threshold}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-xs text-gray-400 mt-1">
                                        {a.currentLabel ?? 'Locked'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
