import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { RESET_MODES, DAY_LABELS } from '@/lib/ruleConstants'
import { deleteRule } from '@/app/actions/rules'

const MODE_BADGES: Record<string, { label: string; className: string }> = {
  ALL: { label: 'Everyone', className: 'bg-green-500/20 text-green-400' },
  GROUP: { label: 'Group', className: 'bg-blue-500/20 text-blue-400' },
  USER: { label: 'User', className: 'bg-yellow-500/20 text-yellow-400' },
}

type RuleTypeWithRules = {
  id: string
  name: string
  description: string | null
  resetMode: string
  resetDay: number | null
  resetIntervalDays: number | null
  organizationId: string
  rules: {
    id: string
    title: string
    description: string | null
    assignmentMode: string
    isActive: boolean
    sortOrder: number
    _count: { assignments: number }
  }[]
}

function formatResetSchedule(ruleType: RuleTypeWithRules): string {
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

export default async function AdminRuleTypeDetailPage({
  params,
}: {
  params: Promise<{ typeId: string }>
}) {
  const { typeId } = await params

  const session = await auth()
  const organizationId = session?.user?.organizationId

  if (!organizationId) {
    redirect('/dashboard')
  }

  const ruleType = await prisma.ruleType.findUnique({
    where: { id: typeId },
    select: {
      id: true,
      name: true,
      description: true,
      resetMode: true,
      resetDay: true,
      resetIntervalDays: true,
      organizationId: true,
      rules: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          assignmentMode: true,
          isActive: true,
          sortOrder: true,
          _count: { select: { assignments: true } },
        },
      },
    },
  })

  if (!ruleType || ruleType.organizationId !== organizationId) {
    notFound()
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <div>
        <Link
          href="/admin/rules/types"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Rule Types
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{ruleType.name}</h1>
          {ruleType.description && (
            <p className="text-gray-400 text-sm mt-1">{ruleType.description}</p>
          )}
          <p className="text-gray-500 text-xs mt-1">{formatResetSchedule(ruleType)}</p>
        </div>
        <Link
          href={`/admin/rules/types/${typeId}/edit`}
          className="shrink-0 px-3 py-1.5 text-sm text-gray-300 border border-white/10 rounded-lg hover:bg-white/5 hover:text-white transition-colors"
        >
          Edit Type
        </Link>
      </div>

      {/* Rules Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Rules</h2>
          <Link
            href={`/admin/rules/types/${typeId}/rules/new`}
            className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
          >
            + Add Rule
          </Link>
        </div>

        {ruleType.rules.length === 0 ? (
          <div className="glass-card border border-white/10 rounded-xl p-12 text-center">
            <p className="text-gray-400">No rules yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {ruleType.rules.map((rule) => {
              const modeBadge = MODE_BADGES[rule.assignmentMode] ?? {
                label: rule.assignmentMode,
                className: 'bg-gray-500/20 text-gray-400',
              }

              async function handleDelete() {
                'use server'
                await deleteRule(rule.id, typeId)
              }

              return (
                <div
                  key={rule.id}
                  className="group glass-card border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Title row with badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium">{rule.title}</span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            rule.isActive
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-gray-500/20 text-gray-400'
                          }`}
                        >
                          {rule.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${modeBadge.className}`}
                        >
                          {modeBadge.label}
                        </span>
                      </div>

                      {/* Description */}
                      {rule.description && (
                        <p className="text-gray-400 text-sm mt-1 truncate">{rule.description}</p>
                      )}

                      {/* Assignment count */}
                      <p className="text-gray-500 text-xs mt-1">
                        {rule._count.assignments}{' '}
                        {rule._count.assignments === 1 ? 'user' : 'users'} assigned
                      </p>
                    </div>

                    {/* Hover-revealed actions */}
                    <div className="shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/admin/rules/types/${typeId}/rules/${rule.id}`}
                        className="px-2.5 py-1 text-xs text-gray-300 border border-white/10 rounded hover:bg-white/5 hover:text-white transition-colors"
                      >
                        Details
                      </Link>
                      <Link
                        href={`/admin/rules/types/${typeId}/rules/${rule.id}/edit`}
                        className="px-2.5 py-1 text-xs text-gray-300 border border-white/10 rounded hover:bg-white/5 hover:text-white transition-colors"
                      >
                        Edit
                      </Link>
                      <form action={handleDelete}>
                        <button
                          type="submit"
                          className="px-2.5 py-1 text-xs text-red-400 border border-red-500/20 rounded hover:bg-red-500/10 hover:text-red-300 transition-colors"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
