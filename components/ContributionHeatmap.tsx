'use client'

import { useMemo, useRef, useEffect } from 'react'

type Props = {
    data: Record<string, number> // Date YYYY-MM-DD -> Value (Avg Words)
    weeksHistory?: number // Default 12
}

// Color Scale logic
function getColor(value: number) {
    if (value === 0) return 'bg-white/5' // Empty
    if (value < 5) return 'bg-green-900/40'
    if (value < 10) return 'bg-green-700/60'
    if (value < 20) return 'bg-green-600'
    if (value < 30) return 'bg-green-500'
    return 'bg-green-400' // Max intensity
}

export function ContributionHeatmap({ data, weeksHistory = 12 }: Props) {
    // Generate last N weeks (Current + N-1 past)
    const weeks = useMemo(() => {
        const weeksArray = []
        const today = new Date()

        // Find start of current week (Sunday)
        const currentWeekStart = new Date(today)
        currentWeekStart.setDate(today.getDate() - today.getDay())

        // Go back (weeksHistory - 1) weeks from that
        const startDate = new Date(currentWeekStart)
        startDate.setDate(startDate.getDate() - ((weeksHistory - 1) * 7))

        // Iterate weeksHistory total
        for (let w = 0; w < weeksHistory; w++) {
            const weekDays = []
            for (let d = 0; d < 7; d++) {
                const date = new Date(startDate)
                date.setDate(date.getDate() + (w * 7) + d)

                const dateStr = date.toLocaleDateString('en-CA')
                const value = data[dateStr] || 0

                // Future check: strictly greater than actual today
                const isFuture = date > today && date.getDate() !== today.getDate(); // Simple check logic, relying on time
                // Better Future Check: Compare YYYY-MM-DD strings
                const todayStr = today.toLocaleDateString('en-CA')
                const isActuallyFuture = dateStr > todayStr

                weekDays.push({
                    date: dateStr,
                    value,
                    isFuture: isActuallyFuture
                })
            }
            weeksArray.push(weekDays)
        }

        return weeksArray
    }, [data])

    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
        }
    }, [weeks])

    return (
        <div className="flex flex-col gap-2">
            {/* Heatmap Grid */}
            <div
                ref={scrollRef}
                className="flex gap-[3px] overflow-x-auto pb-2 custom-scrollbar"
            >
                {weeks.map((week, wIdx) => (
                    <div key={wIdx} className="flex flex-col gap-[3px]">
                        {week.map((day, dIdx) => (
                            <div
                                key={dIdx}
                                className={`w-3.5 h-3.5 rounded-[2px] transition-colors ${day.isFuture ? 'invisible' : getColor(day.value)}`}
                                title={day.date && !day.isFuture ? `${day.date}: ${day.value} avg words` : ''}
                            />
                        ))}
                    </div>
                ))}
            </div>

            <div className="flex justify-start items-center gap-6 px-1 mt-1">
                <span className="text-xs text-gray-500 font-medium">Recent Activity</span>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                    <span>Less</span>
                    <div className="flex gap-1">
                        <div className="w-3 h-3 bg-white/5 rounded-sm" />
                        <div className="w-3 h-3 bg-green-900/40 rounded-sm" />
                        <div className="w-3 h-3 bg-green-600 rounded-sm" />
                        <div className="w-3 h-3 bg-green-400 rounded-sm" />
                    </div>
                    <span>More</span>
                </div>
            </div>
        </div>
    )
}
