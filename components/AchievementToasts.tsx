'use client'

import { useEffect, useRef } from 'react'
import { useToast } from '@/components/providers/ToastProvider'

type Props = {
    achievements: { name: string; icon: string; label: string }[]
}

export function AchievementToasts({ achievements }: Props) {
    const { addToast } = useToast()
    const shown = useRef(false)

    useEffect(() => {
        if (shown.current || achievements.length === 0) return
        shown.current = true

        achievements.forEach((a, i) => {
            setTimeout(() => {
                addToast('success', `${a.icon} Achievement unlocked: ${a.name} — ${a.label}!`)
            }, i * 800)
        })
    }, [achievements, addToast])

    return null
}
