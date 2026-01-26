'use client'

import React, { useOptimistic, useTransition } from 'react'
import { toggleEntryLike } from '@/app/actions/feedback'

type EntryWithPrompt = {
    id: string;
    answer: string;
    isLiked: boolean;
    prompt: {
        content: string;
        type: string;
    }
}

type Props = {
    entries: EntryWithPrompt[];
    date: string;
    isAdmin?: boolean;
}

export function PastJournalView({ entries, date, isAdmin = false }: Props) {
    const displayDate = new Date(`${date}T00:00:00`).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    return (
        <div className="animate-[fade-in_0.5s_ease-out]">
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 mb-8 border-b border-white/10 pb-4">
                {displayDate}
            </h2>

            <div className="space-y-6">
                {entries.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <p>No entries found for this day.</p>
                    </div>
                ) : (
                    entries.map(entry => (
                        <EntryCard key={entry.id} entry={entry} isAdmin={isAdmin} />
                    ))
                )}
            </div>
        </div>
    )
}

function EntryCard({ entry, isAdmin }: { entry: EntryWithPrompt, isAdmin: boolean }) {
    const [isPending, startTransition] = useTransition();
    const [optimisticLiked, toggleOptimisticLike] = useOptimistic(
        entry.isLiked,
        (state) => !state
    );

    const handleToggle = () => {
        if (!isAdmin) return;
        startTransition(async () => {
            toggleOptimisticLike(null); // Toggle immediately
            await toggleEntryLike(entry.id);
        });
    };

    return (
        <div className="glass-card p-6 rounded-xl border border-white/10 relative group">
            <div className="flex justify-between items-start mb-3">
                <h3 className="text-sm font-medium text-primary uppercase tracking-wide opacity-80">{entry.prompt.content}</h3>

                {/* Heart Button */}
                {(isAdmin || optimisticLiked) && (
                    <button
                        onClick={handleToggle}
                        disabled={!isAdmin || isPending}
                        className={`
                            transition-all duration-300 p-2 rounded-full
                            ${isAdmin ? 'cursor-pointer hover:bg-white/10' : 'cursor-default'}
                            ${optimisticLiked
                                ? 'text-red-500 scale-110 opacity-100'
                                : (isAdmin
                                    ? 'text-gray-500 hover:text-red-400 opacity-50 hover:opacity-100'
                                    : 'text-gray-600 opacity-0 group-hover:opacity-100')
                            }
                        `}
                        title={isAdmin ? "Toggle Like" : "Admin liked this"}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill={optimisticLiked ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-5 h-5"
                        >
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                        </svg>
                    </button>
                )}
            </div>

            <div className="text-lg text-gray-200 leading-relaxed whitespace-pre-wrap">
                {formatAnswer(entry.answer, entry.prompt.type)}
            </div>
        </div>
    )
}

function formatAnswer(answer: string, type: string) {
    if (type === 'CHECKBOX' || type === 'RADIO') {
        try {
            if (answer.startsWith('[') || answer.startsWith('{')) {
                const parsed = JSON.parse(answer);
                if (Array.isArray(parsed)) return parsed.join(', ');
                return parsed;
            }
        } catch (e) {
            // ignore
        }
    }
    return answer;
}
