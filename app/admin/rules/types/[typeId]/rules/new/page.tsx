import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { RuleForm } from '@/components/admin/RuleForm'
import { createRule } from '@/app/actions/rules'

export default async function NewRulePage({ params }: { params: Promise<{ typeId: string }> }) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') redirect('/dashboard')

  const { typeId } = await params

  const ruleType = await prisma.ruleType.findUnique({ where: { id: typeId } })
  if (!ruleType || ruleType.organizationId !== session.user.organizationId) {
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

  const handleCreate = async (formData: FormData) => {
    'use server'
    return createRule(typeId, formData)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link href={`/admin/rules/types/${typeId}`} className="text-sm text-gray-400 hover:text-white mb-2 inline-block">
        &larr; Back to {ruleType.name}
      </Link>

      <h1 className="text-2xl font-bold text-white mb-8">New {ruleType.name} Rule</h1>

      <RuleForm
        users={users}
        groups={groups}
        action={handleCreate}
        mode="create"
        cancelHref={`/admin/rules/types/${typeId}`}
      />
    </div>
  )
}
