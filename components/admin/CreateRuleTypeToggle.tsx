'use client'

import { useState } from 'react'
import { RuleTypeForm } from '@/components/admin/RuleTypeForm'
import { createRuleType } from '@/app/actions/rules'

export function CreateRuleTypeToggle() {
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
      >
        + New Type
      </button>
    )
  }

  return (
    <div className="glass-card border border-white/10 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Create New Type</h2>
      <RuleTypeForm
        action={createRuleType}
        mode="create"
        cancelHref="/admin/rules/types"
        onCancel={() => setIsOpen(false)}
      />
    </div>
  )
}
