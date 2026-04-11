import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ensureDefaultRuleTypes, createRuleType } from '@/app/actions/rules'
import { RESET_MODES, DAY_LABELS } from '@/lib/ruleConstants'
import { RuleTypeForm } from '@/components/admin/RuleTypeForm'

type RuleTypeWithCount = {
  id: string
  name: string
  description: string | null
  resetMode: string
  resetDay: number | null
  resetIntervalDays: number | null
  sortOrder: number
  _count: { rules: number }
}

function formatResetSchedule(ruleType: RuleTypeWithCount): string {
  if (ruleType.resetMode === RESET_MODES.DAILY) {
    return 'Resets daily at midnight'
  }
  if (ruleType.resetMode === RESET_MODES.WEEKLY) {
    const dayName = ruleType.resetDay !== null ? DAY_LABELS[ruleType.resetDay] ?? 'Sunday' : 'Sunday'
    return `Resets weekly on ${dayName} at midnight`
  }
  if (ruleType.resetMode === RESET_MODES.INTERVAL) {
    return `Resets every ${ruleType.resetIntervalDays ?? '?'} day(s)`
  }
  return ''
}

export default async function AdminRuleTypesPage() {
  const session = await auth()
  const organizationId = session?.user?.organizationId

  if (!organizationId) {
    redirect('/dashboard')
  }

  await ensureDefaultRuleTypes(organizationId)

  const ruleTypes = await prisma.ruleType.findMany({
    where: { organizationId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      resetMode: true,
      resetDay: true,
      resetIntervalDays: true,
      sortOrder: true,
      _count: { select: { rules: true } },
    },
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Rule Types</h1>
        <p className="text-gray-400 text-sm mt-1">
          Define categories of rules with their own reset schedules.
        </p>
      </div>

      {/* Rule Types List */}
      {ruleTypes.length === 0 ? (
        <div className="glass-card border border-white/10 rounded-xl p-12 text-center">
          <p className="text-gray-400">No rule types yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ruleTypes.map((rt) => (
            <Link
              key={rt.id}
              href={`/admin/rules/types/${rt.id}`}
              className="block glass-card border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-white font-medium">{rt.name}</h3>
                  {rt.description && (
                    <p className="text-gray-400 text-sm mt-0.5 truncate">{rt.description}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-1">{formatResetSchedule(rt)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-sm text-gray-400">
                    {rt._count.rules} {rt._count.rules === 1 ? 'rule' : 'rules'}
                  </span>
                  <p className="text-gray-500 text-xs mt-0.5">&#8250;</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create New Type */}
      <div className="glass-card border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Create New Type</h2>
        <RuleTypeForm
          action={createRuleType}
          mode="create"
          cancelHref="/admin/rules/types"
        />
      </div>
    </div>
  )
}
