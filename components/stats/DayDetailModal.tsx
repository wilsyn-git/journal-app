'use client'

import { useEffect, useRef } from 'react'
import { EntryCard } from '@/components/journal/EntryCard'
import type { DayDetails } from '@/lib/dayDetails'

type Props = {
    date: string
    details: DayDetails | null
    loading: boolean
    onClose: () => void
}

export function DayDetailModal({ date, details, loading, onClose }: Props) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const onCloseRef = useRef(onClose)
    useEffect(() => { onCloseRef.current = onClose }, [onClose])

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null
        dialogRef.current?.focus()

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onCloseRef.current(); return }
            if (e.key === 'Tab') {
                const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
                )
                if (!focusables || focusables.length === 0) { e.preventDefault(); return }
                const first = focusables[0]
                const last = focusables[focusables.length - 1]
                const active = document.activeElement
                if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
                else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => {
            window.removeEventListener('keydown', onKeyDown)
            previouslyFocused?.focus?.()
        }
    }, [])

    const displayDate = new Date(`${date}T00:00:00`).toLocaleDateString('default', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={displayDate}
                tabIndex={-1}
                className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-[rgba(16,16,20,0.98)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden focus:outline-none"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    aria-label="Close"
                    onClick={onClose}
                    className="absolute top-3.5 right-3.5 w-8 h-8 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 transition-colors"
                >
                    ✕
                </button>

                <div className="px-5 py-4 border-b border-white/10">
                    <div className="text-base font-bold text-white">{displayDate}</div>
                    {details && (
                        <div className="flex gap-4 mt-2 text-xs text-gray-400">
                            <span><b className="text-white">{details.summary.entryCount}</b> entries</span>
                            <span><b className="text-white">{details.summary.wordCount}</b> words</span>
                            <span><b className="text-white">{details.rules.length}</b> habits</span>
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div data-testid="day-modal-loading" className="py-12 text-center text-gray-400 text-sm">
                            Loading…
                        </div>
                    ) : !details || details.entries.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-sm">Nothing logged this day.</div>
                    ) : (
                        <>
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">Journal</div>
                            <div className="space-y-4">
                                {details.entries.map(e => <EntryCard key={e.id} entry={e} />)}
                            </div>
                            {details.rules.length > 0 && (
                                <>
                                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-6 mb-2">Habits completed</div>
                                    <ul className="space-y-1.5">
                                        {details.rules.map((title, i) => (
                                            <li key={i} className="flex items-center gap-2 text-sm text-gray-200">
                                                <span className="text-green-400">✓</span> {title}
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
