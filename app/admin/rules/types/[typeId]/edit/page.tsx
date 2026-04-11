import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { RuleTypeForm } from '@/components/admin/RuleTypeForm'
import { updateRuleType, deleteRuleType } from '@/app/actions/rules'

export default async function EditRuleTypePage({ params }: { params: Promise<{ typeId: string }> }) {
  const session = await auth()
  const organizationId = session?.user?.organizationId

  if (!organizationId) {
    redirect('/dashboard')
  }

  const { typeId } = await params

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
      _count: { select: { rules: true } },
    },
  })

  if (!ruleType || ruleType.organizationId !== organizationId) {
    notFound()
  }

  async function handleUpdate(formData: FormData) {
    'use server'
    return updateRuleType(typeId, formData)
  }

  async function handleDelete() {
    'use server'
    const result = await deleteRuleType(typeId)
    if (result?.success) {
      redirect('/admin/rules/types')
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/admin/rules/types/${typeId}`}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to Rule Type
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white mb-6">Edit Rule Type</h1>

      <RuleTypeForm
        action={handleUpdate}
        initialData={ruleType}
        mode="edit"
        cancelHref={`/admin/rules/types/${typeId}`}
      />

      {ruleType._count.rules === 0 && (
        <div className="mt-12 pt-8 border-t border-white/10">
          <h2 className="text-sm font-medium text-red-400 mb-3">Danger Zone</h2>
          <form action={handleDelete}>
            <button className="text-sm px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors">
              Delete Rule Type
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
