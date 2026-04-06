'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useStreakFreeze } from '@/app/actions/inventory'

type Props = {
  missedDays: string[]
  freezesCost: number
  freezesAvailable: number
  streakAtRisk: number
}

export function StreakFreezeBanner({ missedDays, freezesCost, freezesAvailable, streakAtRisk }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (dismissed) return null

  const canAfford = freezesAvailable >= freezesCost
  const dayLabel = missedDays.length === 1 ? 'yesterday' : `the last ${missedDays.length} days`

  const handleUseFreeze = () => {
    startTransition(async () => {
      const result = await useStreakFreeze(missedDays)
      if (result.success) {
        router.refresh()
      }
    })
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-3 mb-4 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base flex-shrink-0" aria-hidden="true">🧊</span>
        <span className="text-[13px] text-white truncate">
          You missed {dayLabel}. Use{' '}
          <strong>{freezesCost} streak {freezesCost === 1 ? 'freeze' : 'freezes'}</strong> to keep
          your <strong>{streakAtRisk}-day streak</strong>?
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {canAfford && (
          <button
            onClick={handleUseFreeze}
            disabled={isPending}
            className="text-[12px] text-sky-400 hover:text-white transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {isPending ? 'Applying...' : `Use ${freezesCost === 1 ? 'freeze' : 'freezes'}`}
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss streak freeze notification"
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
