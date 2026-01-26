"use client"

export function BadgeGrid({ badges }: { badges: any[] }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {badges.map(b => (
                <div
                    key={b.id}
                    className={`
                        p-4 rounded-xl border flex flex-col items-center text-center transition-all
                        ${b.unlocked
                            ? 'bg-purple-900/20 border-purple-500/50 text-white shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                            : 'bg-white/5 border-white/5 text-gray-600 grayscale opacity-60'
                        }
                    `}
                >
                    <div className="text-4xl mb-2">{b.icon}</div>
                    <div className="font-bold text-sm mb-1">{b.name}</div>
                    <div className="text-[10px] opacity-70 leading-tight">{b.description}</div>
                </div>
            ))}
        </div>
    )
}
