import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { RuleForm } from '@/components/admin/RuleForm'
import { updateRule } from '@/app/actions/rules'

export default async function EditRulePage({
  params,
}: {
  params: Promise<{ typeId: string; ruleId: string }>
}) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard')

  const { typeId, ruleId } = await params

  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    select: {
      id: true,
      title: true,
      description: true,
      assignmentMode: true,
      groupId: true,
      isActive: true,
      ruleTypeId: true,
      ruleType: {
        select: {
          id: true,
          name: true,
          organizationId: true,
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

  const [users, groups] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true, name: true, email: true },
      orderBy: { email: 'asc' },
    }),
    prisma.userGroup.findMany({
      where: { organizationId: session.user.organizationId },
      select: { id: true, name: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    }),
  ])

  const handleUpdate = async (formData: FormData) => {
    'use server'
    return updateRule(ruleId, typeId, formData)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/admin/rules/types/${typeId}`}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to {rule.ruleType.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white mb-8">Edit Rule</h1>

      <RuleForm
        users={users}
        groups={groups}
        action={handleUpdate}
        initialData={{
          id: rule.id,
          title: rule.title,
          description: rule.description,
          assignmentMode: rule.assignmentMode,
          groupId: rule.groupId,
          isActive: rule.isActive,
        }}
        mode="edit"
        cancelHref={`/admin/rules/types/${typeId}`}
      />
    </div>
  )
}
