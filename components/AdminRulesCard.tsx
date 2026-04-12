import { formatResetSchedule } from '@/lib/rules'

type RuleGroup = {
  ruleType: {
    name: string
    resetMode: string
    resetDay: number | null
    resetIntervalDays: number | null
  }
  rules: {
    assignmentId: string
    title: string
    isCompleted: boolean
  }[]
}

type Props = {
  ruleGroups: RuleGroup[]
}

export function AdminRulesCard({ ruleGroups }: Props) {
  const allRules = ruleGroups.flatMap(g => g.rules)
  if (allRules.length === 0) return null

  const completed = allRules.filter(r => r.isCompleted).length
  const total = allRules.length
  const allDone = completed === total

  return (
    <div className={`mb-6 rounded-xl border p-4 ${allDone ? 'border-green-500/20 bg-green-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Rules</span>
          <span className="text-xs text-gray-400">{completed}/{total}</span>
          {allDone && <span className="text-xs text-green-400">✓ Complete</span>}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="w-full bg-white/10 rounded-full h-1 mb-4">
        <div
          className={`h-1 rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-purple-500'}`}
          style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
        />
      </div>

      {/* Rule groups */}
      <div className="space-y-4">
        {ruleGroups.map(group => {
          const schedule = formatResetSchedule(group.ruleType)
          return (
            <div key={group.ruleType.name}>
              <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-2">
                {group.ruleType.name} <span className="normal-case">· {schedule}</span>
              </div>
              <div className="space-y-1">
                {group.rules.map(rule => (
                  <div
                    key={rule.assignmentId}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${
                      rule.isCompleted ? 'text-green-300/70' : 'text-white'
                    }`}
                  >
                    <span className="text-sm flex-shrink-0">
                      {rule.isCompleted ? '✅' : '⬜'}
                    </span>
                    <span className={rule.isCompleted ? 'line-through' : ''}>
                      {rule.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
