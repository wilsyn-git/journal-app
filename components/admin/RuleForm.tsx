'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/providers/ToastProvider'
import { ASSIGNMENT_MODES } from '@/lib/taskConstants'

type RuleFormProps = {
  users: { id: string; name: string | null; email: string }[]
  groups: { id: string; name: string; _count: { users: number } }[]
  action: (formData: FormData) => Promise<{ success?: boolean; error?: string }>
  initialData?: {
    id: string
    title: string
    description: string | null
    assignmentMode: string
    groupId: string | null
    isActive: boolean
  }
  mode: 'create' | 'edit'
  cancelHref: string
}

const ASSIGNMENT_OPTIONS = [
  { value: ASSIGNMENT_MODES.ALL, label: 'Everyone' },
  { value: ASSIGNMENT_MODES.GROUP, label: 'Group' },
  { value: ASSIGNMENT_MODES.USER, label: 'User' },
]

export function RuleForm({ users, groups, action, initialData, mode, cancelHref }: RuleFormProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [assignmentMode, setAssignmentMode] = useState<string>(
    initialData?.assignmentMode ?? ASSIGNMENT_MODES.ALL
  )
  const [targetId, setTargetId] = useState<string>(initialData?.groupId ?? '')

  const handleSubmit = (formData: FormData) => {
    formData.set('assignmentMode', assignmentMode)
    formData.set('targetId', targetId)

    startTransition(async () => {
      const result = await action(formData)
      if (result?.success) {
        addToast('success', mode === 'create' ? 'Rule created' : 'Rule updated')
        router.push(cancelHref)
      } else if (result?.error) {
        addToast('error', result.error)
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <label htmlFor="rule-title" className="block text-sm font-medium text-gray-200 mb-2">
          Title <span className="text-red-400">*</span>
        </label>
        <input
          id="rule-title"
          name="title"
          type="text"
          required
          defaultValue={initialData?.title ?? ''}
          placeholder="e.g. Exercise for 30 minutes"
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="rule-description" className="block text-sm font-medium text-gray-200 mb-2">
          Description
        </label>
        <textarea
          id="rule-description"
          name="description"
          rows={3}
          defaultValue={initialData?.description ?? ''}
          placeholder="Optional description"
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30 resize-none"
        />
      </div>

      {/* Assignment Mode — create mode only */}
      {mode === 'create' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              Assign To
            </label>
            <div className="flex gap-2">
              {ASSIGNMENT_OPTIONS.map((opt) => {
                const isActive = assignmentMode === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setAssignmentMode(opt.value)
                      setTargetId('')
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      isActive
                        ? 'bg-purple-500/30 text-purple-300 border-purple-500/50'
                        : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* User selector */}
          {assignmentMode === ASSIGNMENT_MODES.USER && (
            <div>
              <label htmlFor="rule-target-user" className="block text-sm font-medium text-gray-200 mb-2">
                Select User
              </label>
              <select
                id="rule-target-user"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30"
              >
                <option value="">Select a user...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id} className="bg-gray-900">
                    {user.name ? `${user.name} (${user.email})` : user.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Group selector */}
          {assignmentMode === ASSIGNMENT_MODES.GROUP && (
            <div>
              <label htmlFor="rule-target-group" className="block text-sm font-medium text-gray-200 mb-2">
                Select Group
              </label>
              <select
                id="rule-target-group"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30"
              >
                <option value="">Select a group...</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id} className="bg-gray-900">
                    {group.name} ({group._count.users} members)
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {/* isActive checkbox — edit mode only */}
      {mode === 'edit' && (
        <div className="flex items-center gap-3">
          <input
            id="rule-isActive"
            name="isActive"
            type="checkbox"
            defaultChecked={initialData?.isActive ?? true}
            value="true"
            className="w-4 h-4 rounded border-white/20 bg-white/5 accent-purple-500"
          />
          <label htmlFor="rule-isActive" className="text-sm font-medium text-gray-200">
            Active
          </label>
        </div>
      )}

      {/* Hidden inputs */}
      <input type="hidden" name="assignmentMode" value={assignmentMode} />
      <input type="hidden" name="targetId" value={targetId} />

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {isPending
            ? mode === 'create' ? 'Creating...' : 'Saving...'
            : mode === 'create' ? 'Create Rule' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.push(cancelHref)}
          className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
