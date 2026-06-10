'use client'

import { useState, useTransition } from 'react'
import { acknowledgeCompletion } from '@/app/actions/tasks'

type Props = {
    assignmentId: string
    taskTitle: string
    userName: string
    completedLabel: string
}

export function AcknowledgeCompletionItem({ assignmentId, taskTitle, userName, completedLabel }: Props) {
    const [note, setNote] = useState('')
    const [isPending, startTransition] = useTransition()
    const [done, setDone] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (done) return null

    const onAcknowledge = () => {
        setError(null)
        startTransition(async () => {
            const res = await acknowledgeCompletion(assignmentId, note)
            if (res && 'error' in res) setError(res.error ?? null)
            else setDone(true)
        })
    }

    return (
        <div className="flex flex-col gap-2 p-4 border border-white/10 rounded-xl bg-white/[0.02]">
            <div className="text-sm text-white">
                <span className="font-medium">{userName}</span>
                <span className="text-gray-400"> completed </span>
                <span className="font-medium">"{taskTitle}"</span>
            </div>
            <div className="text-xs text-gray-500">{completedLabel}</div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={280}
                    placeholder="Optional note to the user…"
                    className="flex-1 text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                />
                <button
                    onClick={onAcknowledge}
                    disabled={isPending}
                    className="shrink-0 text-sm bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                    {isPending ? 'Acknowledging…' : 'Acknowledge'}
                </button>
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
        </div>
    )
}
