'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { toggleRuleCompletion } from '@/app/actions/rules'

type DailyRule = {
  assignmentId: string
  title: string
  isCompleted: boolean
}

type Props = {
  rules: DailyRule[]
}

export function DailyRulesCard({ rules }: Props) {
  if (rules.length === 0) return null

  const completed = rules.filter(r => r.isCompleted).length
  const total = rules.length
  const allDone = completed === total

  return (
    <div className={`mb-6 rounded-xl border p-4 ${allDone ? 'border-green-500/20 bg-green-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Daily Rules</span>
          <span className="text-xs text-gray-400">{completed}/{total}</span>
          {allDone && <span className="text-xs text-green-400">✓ Complete</span>}
        </div>
        <Link href="/rules" className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
          View all →
        </Link>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-white/10 rounded-full h-1 mb-3">
        <div
          className={`h-1 rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-purple-500'}`}
          style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
        />
      </div>

      {/* Compact checklist */}
      <div className="space-y-1">
        {rules.map(rule => (
          <RuleRow key={rule.assignmentId} rule={rule} />
        ))}
      </div>
    </div>
  )
}

function RuleRow({ rule }: { rule: DailyRule }) {
  const [isPending, startTransition] = useTransition()

  const handleToggle = () => {
    startTransition(async () => {
      await toggleRuleCompletion(rule.assignmentId)
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition-colors ${
        isPending ? 'opacity-50' : ''
      } ${
        rule.isCompleted
          ? 'text-green-300/70'
          : 'text-white hover:bg-white/5'
      }`}
    >
      <span className="text-sm flex-shrink-0">
        {isPending ? '⏳' : rule.isCompleted ? '✅' : '⬜'}
      </span>
      <span className={rule.isCompleted ? 'line-through' : ''}>
        {rule.title}
      </span>
    </button>
  )
}
