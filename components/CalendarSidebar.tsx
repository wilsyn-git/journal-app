
'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Props = {
    completedDates: string[] // YYYY-MM-DD
}

export function CalendarSidebar({ completedDates }: Props) {
    const searchParams = useSearchParams();
    const activeDateParam = searchParams.get('date');
    const todayStr = new Date().toISOString().split('T')[0];

    const [viewDate, setViewDate] = useState(new Date());

    const completedSet = new Set(completedDates);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth(); // 0-indexed

    const monthName = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Days in current month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Day of week the month starts on (0=Sun, 1=Mon...)
    const startDay = new Date(year, month, 1).getDay();

    const changeMonth = (offset: number) => {
        const newDate = new Date(viewDate);
        newDate.setMonth(newDate.getMonth() + offset);
        setViewDate(newDate);
    }

    // Helper to format date YYYY-MM-DD
    const formatDate = (day: number) => {
        const d = new Date(year, month, day);
        // Handle timezone/local issues simply by using the constructed Y/M/D values string directly
        // to avoid UTC shifts
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dayStr}`;
    }

    // Check streak length ending at specific date
    const getStreakLength = (dateStr: string) => {
        if (!completedSet.has(dateStr)) return 0;
        let streak = 1;
        const current = new Date(dateStr);
        while (true) {
            current.setDate(current.getDate() - 1);
            const prevStr = current.toISOString().split('T')[0];
            if (completedSet.has(prevStr)) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }

    const renderDays = () => {
        const days = [];
        // Empty slots for start of month
        for (let i = 0; i < startDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-8 w-8" />);
        }

        // Days
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = formatDate(d);
            const isCompleted = completedSet.has(dateStr);
            const isActive = activeDateParam === dateStr;
            const isToday = dateStr === todayStr;

            // Visual Logic for connecting bubbles
            // We need to check neighbors (d-1 and d+1)
            // But strict visual merging usually only happens within the row (week).
            // So we check if prev/next day is in the same week row?
            // Actually, simplified: check if neighbors are completed.

            // Check Previous Day
            const prevDate = new Date(year, month, d - 1);
            const prevStr = formatDate(d - 1); // Note: this handles 0 -> prev month day logic if we used Date object, but formatDate(0) needs care. 
            // Simpler: Just check if (d>1 and completedSet.has(prevStr)) AND (current index % 7 !== 0)

            // Current index in the grid (0-indexed)
            const index = startDay + (d - 1);
            const isStartOfWeek = index % 7 === 0;
            const isEndOfWeek = index % 7 === 6;

            const prevCompleted = d > 1 && completedSet.has(formatDate(d - 1));
            const nextCompleted = d < daysInMonth && completedSet.has(formatDate(d + 1));

            // Determine border radius class
            let roundedClass = 'rounded-full'; // Default isolated

            if (isCompleted) {
                const connectLeft = prevCompleted && !isStartOfWeek;
                const connectRight = nextCompleted && !isEndOfWeek;

                if (connectLeft && connectRight) roundedClass = 'rounded-none'; // Middle
                else if (connectLeft) roundedClass = 'rounded-r-full rounded-l-none'; // End
                else if (connectRight) roundedClass = 'rounded-l-full rounded-r-none'; // Start
            }

            // Streak Flame
            const streak = getStreakLength(dateStr);
            const showFlame = isCompleted && streak >= 7;

            // Highlight color
            // If active view: White border? 
            // If completed: Primary color

            const cellContent = (
                <Link
                    href={`/dashboard?date=${dateStr}`}
                    className={`
                        relative w-8 h-8 flex items-center justify-center text-xs font-medium transition-all
                        ${isCompleted ? 'bg-primary/80 ' + roundedClass : 'hover:bg-white/10 rounded-full text-gray-400'}
                        ${isActive ? 'ring-2 ring-white z-10' : ''}
                        ${isToday && !isCompleted ? 'border border-primary/50 text-white' : ''}
                        ${isCompleted ? 'text-white' : ''}
                    `}
                >
                    {d}
                    {showFlame && (
                        <span className="absolute -top-3 -right-2 text-[10px] animate-pulse filter drop-shadow">🔥</span>
                    )}
                </Link>
            )

            days.push(
                <div key={dateStr} className="flex items-center justify-center py-1">
                    {cellContent}
                </div>
            )
        }
        return days;
    }

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-4 px-2">
                <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white">
                    &lt;
                </button>
                <div className="font-bold text-white text-sm">
                    {monthName}
                </div>
                <button onClick={() => changeMonth(1)} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white">
                    &gt;
                </button>
            </div>

            <div className="grid grid-cols-7 gap-y-1 text-center mb-2">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                    <div key={i} className="text-[10px] text-gray-500 font-bold">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1">
                {renderDays()}
            </div>

            <div className="mt-6 flex justify-center">
                <Link href="/dashboard" className="text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full text-gray-400 hover:text-white transition-colors">
                    Jump to Today
                </Link>
            </div>
        </div>
    )
}
