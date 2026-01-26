
'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export function JournalHistoryList({ dates }: { dates: string[] }) {
    const searchParams = useSearchParams();
    const activeDate = searchParams.get('date');

    // Group dates by Month-Year
    const groups: Record<string, string[]> = {};
    dates.forEach(date => {
        const d = new Date(date);
        const key = d.toLocaleString('default', { month: 'long', year: 'numeric' });
        if (!groups[key]) groups[key] = [];
        groups[key].push(date);
    });

    // Toggle logic for months (could default to open current month)
    // For now simple list

    return (
        <div className="space-y-6">
            {Object.keys(groups).map(month => (
                <div key={month}>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">{month}</h3>
                    <div className="space-y-1">
                        {groups[month].map(date => {
                            // Format: "Mon, Jan 21" or simple day number? "21st (Monday)"
                            const d = new Date(date);
                            const label = d.toLocaleDateString('default', { weekday: 'short', day: 'numeric' });
                            const isToday = new Date().toISOString().split('T')[0] === date;

                            const isActive = activeDate === date;

                            return (
                                <Link
                                    key={date}
                                    href={`/dashboard?date=${date}`}
                                    className={`block px-3 py-2 rounded-lg text-sm transition-colors ${isActive
                                            ? 'bg-primary text-white font-medium'
                                            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                                        }`}
                                >
                                    {isToday ? 'Today' : label}
                                </Link>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
