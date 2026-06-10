'use client'

import { useEffect, useRef } from 'react'
import { useToast } from '@/components/providers/ToastProvider'

type Item = {
    assignmentId: string
    taskTitle: string
    note: string | null
    acknowledgedByName: string
}

export function AcknowledgementToasts({ items }: { items: Item[] }) {
    const { addToast } = useToast()
    const shown = useRef(false)

    useEffect(() => {
        if (shown.current || items.length === 0) return
        shown.current = true

        items.forEach((it, i) => {
            setTimeout(() => {
                addToast(
                    'success',
                    (
                        <div>
                            <div>{it.acknowledgedByName} acknowledged your completion of &quot;{it.taskTitle}&quot; ✅</div>
                            {it.note && <div className="mt-1 italic text-green-200/80">&quot;{it.note}&quot;</div>}
                        </div>
                    ),
                    8000
                )
            }, i * 800)
        })
    }, [items, addToast])

    return null
}
