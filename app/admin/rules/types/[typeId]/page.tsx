import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { deleteRule } from '@/app/actions/rules'
import { formatResetSchedule } from '@/lib/rules'
import { RulesByUser } from '@/components/admin/RulesByUser'

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
          assignments: {
            select: {
              userId: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  })

  if (!ruleType || ruleType.organizationId !== organizationId) {
    notFound()
  }

  // Group rules by user
  const userMap = new Map<string, {
    userName: string
    rules: { ruleId: string; title: string; description: string | null; isActive: boolean; assignmentMode: string }[]
  }>()

  for (const rule of ruleType.rules) {
    for (const assignment of rule.assignments) {
      const { user } = assignment
      if (!userMap.has(user.id)) {
        userMap.set(user.id, {
          userName: user.name || user.email,
          rules: [],
        })
      }
      userMap.get(user.id)!.rules.push({
        ruleId: rule.id,
        title: rule.title,
        description: rule.description,
        isActive: rule.isActive,
        assignmentMode: rule.assignmentMode,
      })
    }
  }

  const userGroups = Array.from(userMap.entries())
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => a.userName.localeCompare(b.userName))

  async function handleDeleteRule(ruleId: string) {
    'use server'
    await deleteRule(ruleId, typeId)
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

        <RulesByUser
          userGroups={userGroups}
          typeId={typeId}
          deleteAction={handleDeleteRule}
        />
      </div>
    </div>
  )
}
