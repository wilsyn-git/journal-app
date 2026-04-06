'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useStreakRecovery } from '@/app/actions/inventory'

type Props = {
  missedDays: string[]
  freezesCost: number
  shieldsCost: number
  streakAtRisk: number
}

export function StreakFreezeBanner({ missedDays, freezesCost, shieldsCost, streakAtRisk }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (dismissed) return null

  const totalCost = freezesCost + shieldsCost
  const dayLabel = missedDays.length === 1 ? 'yesterday' : `the last ${missedDays.length} days`

  // Build cost label
  let costLabel: string
  if (freezesCost > 0 && shieldsCost > 0) {
    costLabel = `${freezesCost} ${freezesCost === 1 ? 'freeze' : 'freezes'} + ${shieldsCost} ${shieldsCost === 1 ? 'shield' : 'shields'}`
  } else if (shieldsCost > 0) {
    costLabel = `${shieldsCost} ${shieldsCost === 1 ? 'shield' : 'shields'}`
  } else {
    costLabel = `${freezesCost} ${freezesCost === 1 ? 'freeze' : 'freezes'}`
  }

  const handleUseRecovery = () => {
    startTransition(async () => {
      const result = await useStreakRecovery(missedDays, freezesCost, shieldsCost)
      if (result.success) {
        router.refresh()
      }
    })
  }

  // Use shield color if shields are involved, freeze color if freezes only
  const useShieldTheme = shieldsCost > 0
  const bgClass = useShieldTheme ? 'bg-amber-500/10 border-amber-500/20' : 'bg-sky-500/10 border-sky-500/20'
  const icon = useShieldTheme ? '🛡️' : '🧊'
  const buttonClass = useShieldTheme ? 'text-amber-400 hover:text-white' : 'text-sky-400 hover:text-white'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${bgClass} border rounded-lg p-3 mb-4 flex items-center justify-between gap-3`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base flex-shrink-0" aria-hidden="true">{icon}</span>
        <span className="text-[13px] text-white truncate">
          You missed {dayLabel}. Use <strong>{costLabel}</strong> to keep
          your <strong>{streakAtRisk}-day streak</strong>?
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleUseRecovery}
          disabled={isPending}
          className={`text-[12px] ${buttonClass} transition-colors whitespace-nowrap disabled:opacity-50`}
        >
          {isPending ? 'Applying...' : 'Recover'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss streak recovery notification"
          className="text-gray-400 hover:text-white transition-colors p-0.5"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
