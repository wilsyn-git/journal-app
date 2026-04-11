'use client'

import { useTransition } from 'react'
import { toggleRuleCompletion } from '@/app/actions/rules'

type RuleCheckboxProps = {
  assignmentId: string
  title: string
  description: string | null
  isCompleted: boolean
  streakCurrent: number
}

export function RuleCheckbox({ assignmentId, title, description, isCompleted, streakCurrent }: RuleCheckboxProps) {
  const [isPending, startTransition] = useTransition()

  const handleToggle = () => {
    startTransition(async () => {
      await toggleRuleCompletion(assignmentId)
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
        isCompleted
          ? 'bg-green-500/10 border border-green-500/20'
          : 'bg-white/5 border border-white/10 hover:bg-white/10'
      } ${isPending ? 'opacity-50' : ''}`}
    >
      <span className="text-lg flex-shrink-0">
        {isPending ? '⏳' : isCompleted ? '✅' : '⬜'}
      </span>
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${isCompleted ? 'text-green-300 line-through' : 'text-white'}`}>
          {title}
        </span>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{description}</p>
        )}
      </div>
      {streakCurrent > 0 && (
        <span className="text-xs text-orange-400 flex-shrink-0" title={`${streakCurrent} period streak`}>
          🔥 {streakCurrent}
        </span>
      )}
    </button>
  )
}
