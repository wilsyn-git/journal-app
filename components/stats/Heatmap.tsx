"use client"

import { useMemo } from "react"

export function Heatmap({ data }: { data: Record<string, number> }) {
    // Generate last 365 days
    const days = useMemo(() => {
        const list = []
        const today = new Date()
        for (let i = 364; i >= 0; i--) {
            const d = new Date(today)
            d.setDate(d.getDate() - i)
            const iso = d.toISOString().split('T')[0]
            list.push({ date: iso, count: data[iso] || 0 })
        }
        return list
    }, [data])

    // Determine intensity (0-4)
    const getIntensity = (count: number) => {
        if (count === 0) return 'bg-white/10' // Increased from /5 for better visibility
        if (count <= 1) return 'bg-primary/40' // Lower threshold
        if (count <= 3) return 'bg-primary/70'
        return 'bg-primary'
    }

    return (
        <div className="w-full overflow-x-auto pb-2">
            <div className="flex gap-1 min-w-max">
                {/* 
                   We want a grid of weeks (columns) x 7 days (rows).
                   But CSS grid auto-flow column is easier.
                   Total ~52 cols.
                */}
                <div className="grid grid-rows-7 grid-flow-col gap-1">
                    {days.map((d) => (
                        <div
                            key={d.date}
                            className={`w-3 h-3 rounded-sm ${getIntensity(d.count)} hover:ring-1 hover:ring-white transition-all`}
                            title={`${d.date}: ${d.count} entries`}
                        />
                    ))}
                </div>
            </div>
            <div className="flex justify-end gap-2 items-center text-[10px] text-gray-500 mt-2">
                <span>Less</span>
                <div className="flex gap-1">
                    <div className="w-3 h-3 rounded-sm bg-white/5" />
                    <div className="w-3 h-3 rounded-sm bg-primary/40" />
                    <div className="w-3 h-3 rounded-sm bg-primary/70" />
                    <div className="w-3 h-3 rounded-sm bg-primary" />
                </div>
                <span>More</span>
            </div>
        </div>
    )
}
