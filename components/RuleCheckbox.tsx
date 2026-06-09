'use client'

import { useRuleToggle } from '@/components/hooks/useRuleToggle'

type RuleCheckboxProps = {
  assignmentId: string
  title: string
  description: string | null
  isCompleted: boolean
  streakCurrent: number
}

export function RuleCheckbox({ assignmentId, title, description, isCompleted, streakCurrent }: RuleCheckboxProps) {
  const { completed, isPending, toggle } = useRuleToggle(assignmentId, isCompleted)

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
        completed
          ? 'bg-green-500/10 border border-green-500/20'
          : 'bg-white/5 border border-white/10 hover:bg-white/10'
      } ${isPending ? 'opacity-50' : ''}`}
    >
      <span className="text-lg flex-shrink-0">
        {completed ? '✅' : '⬜'}
      </span>
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${completed ? 'text-green-300 line-through' : 'text-white'}`}>
          {title}
        </span>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
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
