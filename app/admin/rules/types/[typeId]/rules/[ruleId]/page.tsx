import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { getPeriodKey } from '@/lib/rules'
import { getUserTimezone } from '@/lib/timezone'

export default async function RuleDetailPage({
  params,
}: {
  params: Promise<{ typeId: string; ruleId: string }>
}) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard')

  const { typeId, ruleId } = await params

  const timezone = await getUserTimezone(session.user.id)

  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    include: {
      ruleType: true,
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          completions: true,
        },
      },
    },
  })

  if (
    !rule ||
    rule.ruleType.organizationId !== session.user.organizationId ||
    rule.ruleTypeId !== typeId
  ) {
    notFound()
  }

  const currentPeriodKey = getPeriodKey(rule.ruleType, timezone)

  const completedThisPeriod = rule.assignments.filter((a) =>
    a.completions.some((c) => c.periodKey === currentPeriodKey)
  ).length

  const assignedCount = rule.assignments.length
  const completionRate =
    assignedCount > 0 ? Math.round((completedThisPeriod / assignedCount) * 100) : 0

  // Sort assignments: completed first, then alphabetical by name/email
  const sortedAssignments = [...rule.assignments].sort((a, b) => {
    const aCompleted = a.completions.some((c) => c.periodKey === currentPeriodKey)
    const bCompleted = b.completions.some((c) => c.periodKey === currentPeriodKey)
    if (aCompleted !== bCompleted) return aCompleted ? -1 : 1
    const aLabel = a.user.name ?? a.user.email
    const bLabel = b.user.name ?? b.user.email
    return aLabel.localeCompare(bLabel)
  })

  return (
    <div className="space-y-8">
      {/* Back link */}
      <div>
        <Link
          href={`/admin/rules/types/${typeId}`}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to {rule.ruleType.name}
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{rule.title}</h1>
          {rule.description && (
            <p className="text-gray-400 text-sm mt-1">{rule.description}</p>
          )}
        </div>
        <Link
          href={`/admin/rules/types/${typeId}/rules/${ruleId}/edit`}
          className="shrink-0 px-3 py-1.5 text-sm text-gray-300 border border-white/10 rounded-lg hover:bg-white/5 hover:text-white transition-colors"
        >
          Edit
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card border border-white/10 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-white">{assignedCount}</p>
          <p className="text-gray-400 text-sm mt-1">Assigned</p>
        </div>
        <div className="glass-card border border-white/10 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-400">{completedThisPeriod}</p>
          <p className="text-gray-400 text-sm mt-1">Completed (this period)</p>
        </div>
        <div className="glass-card border border-white/10 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-purple-400">{completionRate}%</p>
          <p className="text-gray-400 text-sm mt-1">Completion Rate</p>
        </div>
      </div>

      {/* Progress bar */}
      {assignedCount > 0 && (
        <div className="glass-card border border-white/10 rounded-xl p-4">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Progress</span>
            <span>
              {completedThisPeriod} / {assignedCount}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                completionRate === 100 ? 'bg-green-500' : 'bg-purple-500'
              }`}
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Assignments section */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Assignments</h2>

        {sortedAssignments.length === 0 ? (
          <div className="glass-card border border-white/10 rounded-xl p-8 text-center">
            <p className="text-gray-400">No users assigned to this rule.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedAssignments.map((assignment) => {
              const isCompleted = assignment.completions.some(
                (c) => c.periodKey === currentPeriodKey
              )
              const totalCompletions = assignment.completions.length
              const displayName = assignment.user.name ?? assignment.user.email

              return (
                <div
                  key={assignment.id}
                  className="glass-card border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className={isCompleted ? 'text-green-400' : 'text-gray-600'}>
                      {isCompleted ? '✅' : '⬜'}
                    </span>
                    <span className="text-white text-sm">{displayName}</span>
                  </div>
                  <span className="text-gray-500 text-xs">
                    {totalCompletions} total {totalCompletions === 1 ? 'completion' : 'completions'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
