'use client'

import { useOptimistic, useTransition } from 'react'
import { toggleRuleCompletion } from '@/app/actions/rules'
import { useToast } from '@/components/providers/ToastProvider'

export function useRuleToggle(assignmentId: string, isCompleted: boolean) {
  const [completed, setOptimistic] = useOptimistic(isCompleted, (state) => !state)
  const [isPending, startTransition] = useTransition()
  const { addToast } = useToast()

  const toggle = () => {
    startTransition(async () => {
      setOptimistic(null)
      const result = await toggleRuleCompletion(assignmentId)
      if (result && 'error' in result && result.error) {
        addToast('error', "Couldn't update rule — try again")
      }
    })
  }

  return { completed, isPending, toggle }
}
