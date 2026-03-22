'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/providers/ToastProvider'
import { ASSIGNMENT_MODES } from '@/lib/taskConstants'

type TaskFormProps = {
  users: { id: string; name: string | null; email: string }[]
  groups: { id: string; name: string; _count: { users: number } }[]
  action: (formData: FormData) => Promise<{ success?: boolean; error?: string }>
  initialData?: {
    id: string
    title: string
    description: string | null
    priority: number
    dueDate: Date | null
    assignmentMode: string
    groupId: string | null
  }
  mode: 'create' | 'edit'
}

const PRIORITY_OPTIONS = [
  { value: 0, label: 'Urgent' },
  { value: 1, label: 'Normal' },
  { value: 2, label: 'Low' },
]

const ASSIGNMENT_OPTIONS = [
  { value: ASSIGNMENT_MODES.USER, label: 'User' },
  { value: ASSIGNMENT_MODES.GROUP, label: 'Group' },
  { value: ASSIGNMENT_MODES.ALL, label: 'All' },
]

function SegmentedToggle({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: string | number; label: string }[]
  value: string | number
  onChange: (value: string | number) => void
  name: string
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      let nextIdx = idx
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        nextIdx = (idx + 1) % options.length
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        nextIdx = (idx - 1 + options.length) % options.length
      }
      if (nextIdx !== idx) {
        onChange(options[nextIdx].value)
      }
    },
    [options, onChange]
  )

  return (
    <div role="radiogroup" aria-label={name} className="flex rounded-lg border border-white/10 overflow-hidden">
      {options.map((opt, idx) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              selected
                ? 'bg-primary text-white'
                : 'bg-black/20 text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function TaskForm({ users, groups, action, initialData, mode }: TaskFormProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [priority, setPriority] = useState<number>(initialData?.priority ?? 1)
  const [assignmentMode, setAssignmentMode] = useState<string>(
    initialData?.assignmentMode ?? ASSIGNMENT_MODES.USER
  )
  const [targetId, setTargetId] = useState<string>(
    initialData?.groupId ?? ''
  )
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = (formData: FormData) => {
    const title = formData.get('title') as string
    if (!title?.trim()) {
      setValidationError('Title is required')
      return
    }
    setValidationError(null)

    startTransition(async () => {
      const result = await action(formData)
      if (result?.success) {
        addToast('success', mode === 'create' ? 'Task created successfully' : 'Task updated successfully')
        router.push('/admin/tasks')
      } else if (result?.error) {
        addToast('error', result.error)
      }
    })
  }

  // Build assignment preview
  const assignmentPreview = (() => {
    if (assignmentMode === ASSIGNMENT_MODES.USER && targetId) {
      const user = users.find((u) => u.id === targetId)
      return user ? [user.name || user.email] : []
    }
    if (assignmentMode === ASSIGNMENT_MODES.GROUP && targetId) {
      const group = groups.find((g) => g.id === targetId)
      return group ? [`${group.name} (${group._count.users} members)`] : []
    }
    if (assignmentMode === ASSIGNMENT_MODES.ALL) {
      return [`All users (${users.length})`]
    }
    return []
  })()

  const dueDateDefault = initialData?.dueDate
    ? new Date(initialData.dueDate).toISOString().split('T')[0]
    : ''

  return (
    <form action={handleSubmit} className="space-y-6 glass-card p-8 rounded-xl border border-white/10">
      {validationError && (
        <p role="alert" className="text-red-400 text-sm">
          {validationError}
        </p>
      )}

      {/* Title */}
      <div>
        <label htmlFor="task-title" className="block text-sm font-medium text-gray-200 mb-2">
          Title
        </label>
        <input
          id="task-title"
          name="title"
          required
          defaultValue={initialData?.title ?? ''}
          placeholder="Task title"
          className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="task-description" className="block text-sm font-medium text-gray-200 mb-2">
          Description
        </label>
        <textarea
          id="task-description"
          name="description"
          rows={3}
          defaultValue={initialData?.description ?? ''}
          placeholder="Optional description..."
          className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none"
        />
      </div>

      {/* Priority */}
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-2">Priority</label>
        <SegmentedToggle
          options={PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={priority}
          onChange={(v) => setPriority(v as number)}
          name="Priority"
        />
        <input type="hidden" name="priority" value={priority} />
      </div>

      {/* Due Date */}
      <div>
        <label htmlFor="task-due-date" className="block text-sm font-medium text-gray-200 mb-2">
          Due Date <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="task-due-date"
          name="dueDate"
          type="date"
          defaultValue={dueDateDefault}
          className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none [color-scheme:dark] invalid:text-gray-500"
          ref={(el) => {
            if (el && !el.value) el.style.color = '#6b7280'
            el?.addEventListener('change', () => {
              el.style.color = el.value ? 'white' : '#6b7280'
            })
          }}
        />
      </div>

      {/* Assignment Mode — only in create mode */}
      {mode === 'create' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">Assignment Mode</label>
            <SegmentedToggle
              options={ASSIGNMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={assignmentMode}
              onChange={(v) => {
                setAssignmentMode(v as string)
                setTargetId('')
              }}
              name="Assignment Mode"
            />
          </div>

          {/* Target Selector */}
          {assignmentMode === ASSIGNMENT_MODES.USER && (
            <div>
              <label htmlFor="task-target" className="block text-sm font-medium text-gray-200 mb-2">
                Assign to User
              </label>
              <select
                id="task-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer"
              >
                <option value="">Select a user...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name ? `${user.name} (${user.email})` : user.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {assignmentMode === ASSIGNMENT_MODES.GROUP && (
            <div>
              <label htmlFor="task-target" className="block text-sm font-medium text-gray-200 mb-2">
                Assign to Group
              </label>
              <select
                id="task-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer"
              >
                <option value="">Select a group...</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group._count.users} members)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Assignment Preview */}
          {assignmentPreview.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {assignmentPreview.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {/* Hidden fields for form submission */}
      <input type="hidden" name="assignmentMode" value={assignmentMode} />
      <input type="hidden" name="targetId" value={targetId} />

      {/* Buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
        <Link
          href="/admin/tasks"
          className="px-6 py-2.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors shadow-[0_0_20px_rgba(139,92,246,0.3)] disabled:opacity-50"
        >
          {isPending
            ? (mode === 'create' ? 'Creating...' : 'Saving...')
            : (mode === 'create' ? 'Create Task' : 'Save Changes')}
        </button>
      </div>
    </form>
  )
}
