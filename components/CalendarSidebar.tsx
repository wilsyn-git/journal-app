
'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Props = {
    completedDates: { date: string, hasLike: boolean }[] // YYYY-MM-DD + Status
}

export function CalendarSidebar({ completedDates }: Props) {
    const searchParams = useSearchParams();
    const activeDateParam = searchParams.get('date');
    const viewUserId = searchParams.get('viewUserId');

    const now = new Date();
    const yearNow = now.getFullYear();
    const monthNow = String(now.getMonth() + 1).padStart(2, '0');
    const dayNow = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yearNow}-${monthNow}-${dayNow}`;

    const [viewDate, setViewDate] = useState(new Date());

    const completedMap = new Map<string, boolean>(); // date -> hasLike
    completedDates.forEach(d => completedMap.set(d.date, d.hasLike));

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
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dayStr}`;
    }

    // Check streak length ending at specific date
    const getStreakLength = (dateStr: string) => {
        if (!completedMap.has(dateStr)) return 0;
        let streak = 1;
        const current = new Date(dateStr);
        while (true) {
            current.setDate(current.getDate() - 1);
            const prevStr = current.toISOString().split('T')[0];
            if (completedMap.has(prevStr)) {
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
            const isCompleted = completedMap.has(dateStr);
            const isLiked = completedMap.get(dateStr);
            const isActive = activeDateParam === dateStr;
            const isToday = dateStr === todayStr;

            // Visual Logic for connecting bubbles
            const index = startDay + (d - 1);
            const isStartOfWeek = index % 7 === 0;
            const isEndOfWeek = index % 7 === 6;

            const prevCompleted = d > 1 && completedMap.has(formatDate(d - 1));
            const nextCompleted = d < daysInMonth && completedMap.has(formatDate(d + 1));

            // Determine border radius class
            let roundedClass = 'rounded-full'; // Default isolated

            if (isCompleted) {
                const connectLeft = prevCompleted && !isStartOfWeek;
                const connectRight = nextCompleted && !isEndOfWeek;

                if (connectLeft && connectRight) roundedClass = 'rounded-none'; // Middle
                else if (connectLeft) roundedClass = 'rounded-r-full rounded-l-none'; // End
                else if (connectRight) roundedClass = 'rounded-l-full rounded-r-none'; // Start
            }

            // Streak Flame (Simpler check to avoid infinite loop overhead usually, but 30 days is fine)
            const streak = getStreakLength(dateStr);
            const showFlame = isCompleted && streak >= 7;

            const cellContent = (
                <Link
                    href={`/dashboard?date=${dateStr}${viewUserId ? `&viewUserId=${viewUserId}` : ''}`}
                    className={`
                        relative w-8 h-8 flex items-center justify-center text-xs font-medium transition-all
                        ${isCompleted
                            ? (isLiked ? 'bg-rose-600 ' : 'bg-primary/80 ') + roundedClass
                            : 'hover:bg-white/10 rounded-full text-gray-400'
                        }
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
                <Link
                    href={`/dashboard?${viewUserId ? `viewUserId=${viewUserId}` : ''}`}
                    className="text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full text-gray-400 hover:text-white transition-colors"
                >
                    Jump to Today
                </Link>
            </div>
        </div>
    )
}
