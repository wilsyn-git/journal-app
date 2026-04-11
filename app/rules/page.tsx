import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUserRulesWithStatus, getNextResetTime, formatResetCountdown, generatePeriodKeys, calculateRuleStreak } from '@/lib/rules'
import { resolveUserId } from '@/lib/auth-helpers'
import { getUserTimezone } from '@/lib/timezone'
import { RuleCheckbox } from '@/components/RuleCheckbox'

export const metadata = {
  title: 'Rules',
}

export default async function RulesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const userId = await resolveUserId(session)
  if (!userId) redirect('/login')

  const timezone = await getUserTimezone(userId)

  const ruleGroups = await getUserRulesWithStatus(userId, timezone)

  if (ruleGroups.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-white">Rules</h1>
          </div>
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No rules assigned to you yet.</p>
            <Link href="/dashboard" className="mt-4 inline-block text-sm text-purple-400 hover:text-purple-300 transition-colors">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Compute streaks from data already loaded by getUserRulesWithStatus (no extra queries)
  const groupsWithStreaks = ruleGroups.map((group) => {
    const rulesWithStreaks = group.rules.map((rule) => {
      const allKeys = generatePeriodKeys(group.ruleType, timezone, rule.assignmentCreatedAt)
      const streak = calculateRuleStreak(rule.allCompletionKeys, allKeys)
      return { ...rule, streakCurrent: streak.current, streakMax: streak.max }
    })

    const perfectStreak = rulesWithStreaks.reduce(
      (min, r) => Math.min(min, r.streakCurrent),
      rulesWithStreaks[0]?.streakCurrent ?? 0
    )

    return {
      ruleType: group.ruleType,
      rules: rulesWithStreaks,
      perfectStreak,
      resetMs: getNextResetTime(group.ruleType, timezone),
    }
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white">Rules</h1>
        </div>

        {/* Rule Groups */}
        <div className="space-y-8">
          {groupsWithStreaks.map((group) => {
            const completedCount = group.rules.filter((r) => r.isCompleted).length
            const totalCount = group.rules.length
            const isComplete = completedCount === totalCount

            return (
              <section key={group.ruleType.id}>
                {/* Section header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">{group.ruleType.name}</h2>
                    <span className="text-sm text-gray-400">
                      {completedCount}/{totalCount}
                    </span>
                    {group.perfectStreak > 0 && (
                      <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full">
                        🔥 {group.perfectStreak} perfect
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatResetCountdown(group.resetMs)}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-white/10 rounded-full h-1.5 mb-3">
                  <div
                    className={`h-1.5 rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-purple-500'}`}
                    style={{ width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%' }}
                  />
                </div>

                {/* Rule checkboxes */}
                <div className="space-y-2">
                  {group.rules.map((rule) => (
                    <RuleCheckbox
                      key={rule.assignmentId}
                      assignmentId={rule.assignmentId}
                      title={rule.title}
                      description={rule.description}
                      isCompleted={rule.isCompleted}
                      streakCurrent={rule.streakCurrent}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
