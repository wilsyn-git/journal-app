'use client'

import React, { useOptimistic, useTransition } from 'react'
import { setJournalDayLike } from '@/app/actions/feedback'
import { useToast } from '@/components/providers/ToastProvider'
import { EntryCard, type EntryWithPrompt } from '@/components/journal/EntryCard'

type Props = {
    entries: EntryWithPrompt[];
    date: string;
    isAdmin?: boolean;
}

export function PastJournalView({ entries, date, isAdmin = false }: Props) {
    const displayDate = new Date(`${date}T00:00:00`).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const dayLiked = entries.some(e => e.isLiked);
    const entryIds = entries.map(e => e.id);

    return (
        <div className="animate-[fade-in_0.5s_ease-out]">
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 mb-8 border-b border-white/10 pb-4">
                {displayDate}
            </h2>

            <div className="space-y-6">
                {entries.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <p>No entries found for this day.</p>
                        <p className="text-sm mt-2">Try navigating to today to fill out your journal, or browse other dates using the calendar.</p>
                    </div>
                ) : (
                    entries.map(entry => (
                        <EntryCard key={entry.id} entry={entry} />
                    ))
                )}
            </div>

            {entries.length > 0 && (
                isAdmin
                    ? <AdminDayLike dayLiked={dayLiked} entryIds={entryIds} />
                    : (dayLiked ? <ReadOnlyDayLike /> : null)
            )}
        </div>
    )
}

function AdminDayLike({ dayLiked, entryIds }: { dayLiked: boolean; entryIds: string[] }) {
    const [optimisticLiked, toggleOptimistic] = useOptimistic(dayLiked, (state) => !state);
    const [isPending, startTransition] = useTransition();
    const { addToast } = useToast();

    const handleToggle = () => {
        const next = !optimisticLiked;
        startTransition(async () => {
            toggleOptimistic(null);
            const result = await setJournalDayLike(entryIds, next);
            if (result && 'error' in result && result.error) {
                addToast('error', "Couldn't update like — try again");
            }
        });
    };

    return (
        <div className="mt-10 flex justify-center">
            <button
                onClick={handleToggle}
                disabled={isPending}
                aria-pressed={optimisticLiked}
                title={optimisticLiked ? 'Unlike this journal' : 'Like this journal'}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-300
                    ${optimisticLiked
                        ? 'text-rose-400 border-rose-400/40 bg-rose-500/10'
                        : 'text-gray-400 border-white/10 hover:text-rose-400 hover:border-rose-400/30'}`}
            >
                <HeartIcon filled={optimisticLiked} />
                <span className="text-sm font-medium">{optimisticLiked ? 'Liked' : 'Like this journal'}</span>
            </button>
        </div>
    )
}

function ReadOnlyDayLike() {
    return (
        <div className="mt-10 flex items-center justify-center gap-2 text-rose-400">
            <HeartIcon filled />
            <span className="text-sm font-medium">Liked by your admin</span>
        </div>
    )
}

function HeartIcon({ filled }: { filled: boolean }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill={filled ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
        >
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
    )
}
