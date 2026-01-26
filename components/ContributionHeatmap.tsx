'use client'

import { useMemo, useRef, useEffect } from 'react'

type Props = {
    data: Record<string, number> // Date YYYY-MM-DD -> Value (Avg Words)
    weeksHistory?: number // Default 12
    showLegend?: boolean
}

// Color Scale logic
function getColor(value: number) {
    if (value === 0) return 'bg-white/5' // Empty
    if (value < 5) return 'bg-green-900/40' // Low
    if (value < 10) return 'bg-green-700/60'
    if (value < 20) return 'bg-green-600'
    if (value < 30) return 'bg-green-500'
    return 'bg-green-400' // Max intensity
}

export function ContributionHeatmap({ data, weeksHistory = 52, showLegend = true }: Props) {
    // Generate last N weeks (Current + N-1 past)
    const { weeks, months } = useMemo(() => {
        const weeksArray = []
        const today = new Date()

        // Find start of current week (Sunday)
        const currentWeekStart = new Date(today)
        currentWeekStart.setDate(today.getDate() - today.getDay())

        // Go back (weeksHistory - 1) weeks
        const startDate = new Date(currentWeekStart)
        startDate.setDate(startDate.getDate() - ((weeksHistory - 1) * 7))

        const monthLabels: { index: number, label: string }[] = []
        let lastMonth = -1

        // Iterate weeksHistory total
        for (let w = 0; w < weeksHistory; w++) {
            const weekDays = []

            // Calculate week Start Date for Month Labeling
            // We use the first day (Sunday) or maybe the majority?
            // GitHub usually labels the month if the first week of that month appears.
            // Let's check the date of the FIRST day of the week.
            const weekDate = new Date(startDate)
            weekDate.setDate(weekDate.getDate() + (w * 7))

            const currentMonth = weekDate.getMonth()
            // If month changed, add label at this index
            // BUT: Don't add if it's too close to end? No, just add.
            if (currentMonth !== lastMonth) {
                const monthName = weekDate.toLocaleString('default', { month: 'short' })
                monthLabels.push({ index: w, label: monthName })
                lastMonth = currentMonth
            }

            for (let d = 0; d < 7; d++) {
                const date = new Date(startDate)
                date.setDate(date.getDate() + (w * 7) + d)

                const dateStr = date.toLocaleDateString('en-CA')
                const value = data[dateStr] || 0

                // Future Check
                const todayStr = today.toLocaleDateString('en-CA')
                const isActuallyFuture = dateStr > todayStr

                weekDays.push({
                    date: dateStr,
                    value,
                    isFuture: isActuallyFuture,
                    dayIndex: d // 0=Sun, 1=Mon...
                })
            }
            weeksArray.push(weekDays)
        }

        return { weeks: weeksArray, months: monthLabels }
    }, [data, weeksHistory])

    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
        }
    }, [weeks])

    return (
        <div className="flex flex-col gap-2">
            <div className="flex">
                {/* Day Labels (Left Column) */}
                <div className="flex flex-col gap-[3px] pr-2 pt-6 text-[10px] text-gray-400 font-medium leading-[14px]">
                    {/* Rows match the grid: Sun(0), Mon(1), Tue(2)... */}
                    {/* We only label Mon(1), Wed(3), Fri(5) like GitHub */}
                    <div className="h-3.5"></div> {/* Sun */}
                    <div className="h-3.5 flex items-center">Mon</div>
                    <div className="h-3.5"></div> {/* Tue */}
                    <div className="h-3.5 flex items-center">Wed</div>
                    <div className="h-3.5"></div> {/* Thu */}
                    <div className="h-3.5 flex items-center">Fri</div>
                    <div className="h-3.5"></div> {/* Sat */}
                </div>

                {/* Main Scrollable Area */}
                <div
                    ref={scrollRef}
                    className="overflow-x-auto custom-scrollbar pb-2"
                >
                    <div className="flex flex-col gap-1 min-w-max">
                        {/* Month Headers */}
                        <div className="flex h-5 relative mb-1">
                            {months.map((m, i) => (
                                <span
                                    key={i}
                                    className="absolute text-[10px] text-gray-400 font-medium"
                                    style={{
                                        // Each column is w-3.5 (14px) + gap-1 (4px) => ~18px?
                                        // Actually: w-3.5 is 0.875rem = 14px. Gap is 3px. Total = 17px.
                                        left: `${m.index * 17}px`
                                    }}
                                >
                                    {m.label}
                                </span>
                            ))}
                        </div>

                        {/* The Grid */}
                        <div className="flex gap-[3px]">
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

                        {showLegend && (
                            <div className="flex justify-end items-center gap-2 mt-2 text-[10px] text-gray-400">
                                <span>Less</span>
                                <div className="flex gap-1">
                                    <div className="w-3 h-3 bg-white/5 rounded-sm" />
                                    <div className="w-3 h-3 bg-green-900/40 rounded-sm" />
                                    <div className="w-3 h-3 bg-green-600 rounded-sm" />
                                    <div className="w-3 h-3 bg-green-400 rounded-sm" />
                                </div>
                                <span>More</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
