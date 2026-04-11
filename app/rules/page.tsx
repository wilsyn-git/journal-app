import type { Metadata } from 'next'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUserRulesWithStatus, getNextResetTime, formatResetCountdown, generatePeriodKeys, calculateRuleStreak } from '@/lib/rules'
import { resolveUserId } from '@/lib/auth-helpers'
import { getUserTimezone } from '@/lib/timezone'
import { getActiveOrganization } from '@/app/lib/data'
import { SidebarHeader } from '@/components/SidebarHeader'
import { RuleCheckbox } from '@/components/RuleCheckbox'

export const metadata: Metadata = {
  title: 'Rules | myJournal',
}

export default async function RulesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const userId = await resolveUserId(session)
  if (!userId) redirect('/login')

  const [timezone, org] = await Promise.all([
    getUserTimezone(userId),
    getActiveOrganization(),
  ])

  const ruleGroups = await getUserRulesWithStatus(userId, timezone)

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
    <div className="flex min-h-screen bg-black text-white">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-20 border-b border-white/10 bg-black/90 backdrop-blur-md px-4 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <span className="text-lg font-semibold text-white">Rules</span>
      </div>

      {/* Sidebar */}
      <div className="w-64 border-r border-white/10 hidden md:flex flex-col bg-black/50">
        <div className="p-6 border-b border-white/10">
          <SidebarHeader logoUrl={org?.logoUrl} siteName={org?.siteName} />
        </div>
        <div className="p-4 flex-1">
          <Link href="/dashboard" className="block p-3 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors mb-2">
            ← Back to Journal
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <main id="main-content" className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-16 md:pt-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-8">Rules</h1>

          {groupsWithStreaks.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg">No rules assigned to you yet.</p>
            </div>
          ) : (
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
          )}
        </div>
      </main>
    </div>
  )
}
