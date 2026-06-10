'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { setUserTimezone } from '@/app/actions/settings'
import { useToast } from '@/components/providers/ToastProvider'

type Props = {
    currentTimezone: string | null
}

function getTimezoneLabel(tz: string): string {
    try {
        const now = new Date()
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            timeZoneName: 'shortOffset',
        })
        const parts = formatter.formatToParts(now)
        const offset = parts.find(p => p.type === 'timeZoneName')?.value || ''
        return `${tz.replace(/_/g, ' ')} (${offset})`
    } catch {
        return tz
    }
}

export function TimezonePicker({ currentTimezone }: Props) {
    const [search, setSearch] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const [selected, setSelected] = useState(currentTimezone || '')
    const [isPending, setIsPending] = useState(false)
    const [pendingTz, setPendingTz] = useState<string | null>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const { addToast } = useToast()

    const allTimezones = useMemo(() => {
        try {
            return Intl.supportedValuesOf('timeZone')
        } catch {
            return []
        }
    }, [])

    const commonTimezones = [
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'America/Anchorage',
        'Pacific/Honolulu',
        'America/Phoenix',
        'America/Toronto',
        'America/Vancouver',
        'Europe/London',
        'Europe/Paris',
        'Europe/Berlin',
        'Asia/Tokyo',
        'Asia/Shanghai',
        'Australia/Sydney',
    ]

    const filtered = useMemo(() => {
        if (!search) return commonTimezones.filter(tz => allTimezones.includes(tz))
        const lower = search.toLowerCase().replace(/\s+/g, '_')
        return allTimezones.filter(tz => tz.toLowerCase().includes(lower)).slice(0, 30)
    }, [search, allTimezones])

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
                setSearch('')
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleSelect = (tz: string) => {
        setIsOpen(false)
        setSearch('')
        if (tz === selected) { setPendingTz(null); return }
        setPendingTz(tz)
    }

    const confirmChange = async () => {
        if (!pendingTz) return
        setIsPending(true)
        try {
            await setUserTimezone(pendingTz)
            setSelected(pendingTz)
            addToast('success', 'Timezone updated')
            setPendingTz(null)
        } catch {
            addToast('error', 'Failed to update timezone')
            setPendingTz(null)
        } finally {
            setIsPending(false)
        }
    }

    const cancelChange = () => setPendingTz(null)

    return (
        <div ref={dropdownRef} className="relative">
            <label className="block text-sm font-medium text-gray-400 mb-1">Timezone</label>
            <div
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white cursor-pointer hover:border-white/20 transition-colors flex items-center justify-between"
                onClick={() => {
                    setIsOpen(!isOpen)
                    if (!isOpen) {
                        setTimeout(() => inputRef.current?.focus(), 0)
                    }
                }}
            >
                <span className={selected ? 'text-white' : 'text-gray-500'}>
                    {isPending ? 'Saving...' : selected ? getTimezoneLabel(selected) : 'Select timezone...'}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-[#1a1a1c] border border-white/10 rounded-lg shadow-xl max-h-96 overflow-hidden">
                    <div className="p-2 border-b border-white/10">
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search city or region..."
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                        />
                    </div>
                    <div className="overflow-y-auto max-h-80">
                        {filtered.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500">No timezones found</div>
                        ) : (
                            filtered.map(tz => (
                                <button
                                    key={tz}
                                    onClick={() => handleSelect(tz)}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${
                                        tz === selected ? 'bg-blue-500/20 text-blue-300' : 'text-gray-300'
                                    }`}
                                >
                                    {getTimezoneLabel(tz)}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}

            {pendingTz && (
                <div className="mt-2 rounded-lg border border-white/10 bg-black/40 p-3 text-sm">
                    <p className="text-gray-300">
                        Your daily entries will roll over at midnight{' '}
                        <span className="text-white font-medium">{getTimezoneLabel(pendingTz)}</span>.
                    </p>
                    <div className="mt-2 flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={cancelChange}
                            disabled={isPending}
                            className="px-3 py-1.5 rounded-md border border-white/10 text-gray-300 hover:bg-white/5 text-xs disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirmChange}
                            disabled={isPending}
                            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs disabled:opacity-50"
                        >
                            {isPending ? 'Saving…' : 'Confirm'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
