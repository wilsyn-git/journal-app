'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/providers/ToastProvider'
import { RESET_MODES, RESET_MODE_LABELS, DAY_LABELS } from '@/lib/ruleConstants'
import type { ResetMode } from '@/lib/ruleConstants'

type RuleTypeFormProps = {
  action: (formData: FormData) => Promise<{ success?: boolean; error?: string }>
  initialData?: {
    id: string
    name: string
    description: string | null
    resetMode: string
    resetDay: number | null
    resetIntervalDays: number | null
  }
  mode: 'create' | 'edit'
  cancelHref: string
}

export function RuleTypeForm({ action, initialData, mode, cancelHref }: RuleTypeFormProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [resetMode, setResetMode] = useState<ResetMode>(
    (initialData?.resetMode as ResetMode) ?? RESET_MODES.DAILY
  )

  const handleSubmit = (formData: FormData) => {
    // Inject current resetMode since we manage it in state
    formData.set('resetMode', resetMode)

    startTransition(async () => {
      const result = await action(formData)
      if (result?.success) {
        addToast('success', mode === 'create' ? 'Rule type created' : 'Rule type updated')
        router.push(cancelHref)
      } else if (result?.error) {
        addToast('error', result.error)
      }
    })
  }

  const RESET_MODE_OPTIONS: { value: ResetMode; label: string }[] = [
    { value: RESET_MODES.DAILY, label: RESET_MODE_LABELS[RESET_MODES.DAILY] },
    { value: RESET_MODES.WEEKLY, label: RESET_MODE_LABELS[RESET_MODES.WEEKLY] },
    { value: RESET_MODES.INTERVAL, label: RESET_MODE_LABELS[RESET_MODES.INTERVAL] },
  ]

  return (
    <form action={handleSubmit} className="space-y-5">
      {/* Name */}
      <div>
        <label htmlFor="rt-name" className="block text-sm font-medium text-gray-200 mb-2">
          Name <span className="text-red-400">*</span>
        </label>
        <input
          id="rt-name"
          name="name"
          type="text"
          required
          defaultValue={initialData?.name ?? ''}
          placeholder="e.g. Daily Habits"
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="rt-description" className="block text-sm font-medium text-gray-200 mb-2">
          Description
        </label>
        <textarea
          id="rt-description"
          name="description"
          rows={3}
          defaultValue={initialData?.description ?? ''}
          placeholder="Optional description"
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/30 resize-none"
        />
      </div>

      {/* Reset Mode */}
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-2">
          Reset Schedule
        </label>
        <div className="flex gap-2">
          {RESET_MODE_OPTIONS.map((opt) => {
            const isActive = resetMode === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setResetMode(opt.value)}
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
        {/* Hidden input carries resetMode value for the server action */}
        <input type="hidden" name="resetMode" value={resetMode} />
      </div>

      {/* Weekly: day select */}
      {resetMode === RESET_MODES.WEEKLY && (
        <div>
          <label htmlFor="rt-resetDay" className="block text-sm font-medium text-gray-200 mb-2">
            Reset Day
          </label>
          <select
            id="rt-resetDay"
            name="resetDay"
            defaultValue={initialData?.resetDay ?? 0}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30"
          >
            {Object.entries(DAY_LABELS).map(([num, label]) => (
              <option key={num} value={num} className="bg-gray-900">
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Interval: N days */}
      {resetMode === RESET_MODES.INTERVAL && (
        <div>
          <label htmlFor="rt-intervalDays" className="block text-sm font-medium text-gray-200 mb-2">
            Every N Days
          </label>
          <input
            id="rt-intervalDays"
            name="resetIntervalDays"
            type="number"
            min={1}
            defaultValue={initialData?.resetIntervalDays ?? 7}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          {isPending
            ? mode === 'create' ? 'Creating...' : 'Saving...'
            : mode === 'create' ? 'Create Rule Type' : 'Save Changes'}
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
