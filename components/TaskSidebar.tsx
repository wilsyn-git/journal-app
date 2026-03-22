'use client'

import React, { useState } from 'react'
import { completeTask, uncompleteTask } from '@/app/actions/tasks'
import { PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/taskConstants'
import type { PriorityValue } from '@/lib/taskConstants'

type Task = {
  id: string
  title: string
  description: string | null
  priority: number
  dueDate: Date | null
  archivedAt: Date | null
  organizationId: string
  createdById: string
  assignmentMode: string
  groupId: string | null
  createdAt: Date
  updatedAt: Date
}

type TaskAssignment = {
  id: string
  taskId: string
  userId: string
  completedAt: Date | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  task: Task
}

type TaskSidebarProps = {
  assignments: TaskAssignment[]
}

export function TaskSidebar({ assignments }: TaskSidebarProps) {
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  // Hide completed tasks from before today
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const filtered = assignments.filter((a) => {
    if (a.completedAt && new Date(a.completedAt) < todayStart) return false
    return true
  })

  if (filtered.length === 0) return null

  // Sort: incomplete first, then by priority (asc), then by due date (soonest first, null last). Completed at bottom.
  const sorted = [...filtered].sort((a, b) => {
    const aComplete = !!a.completedAt
    const bComplete = !!b.completedAt
    if (aComplete !== bComplete) return aComplete ? 1 : -1

    if (a.task.priority !== b.task.priority) return a.task.priority - b.task.priority

    const aDue = a.task.dueDate ? new Date(a.task.dueDate).getTime() : Infinity
    const bDue = b.task.dueDate ? new Date(b.task.dueDate).getTime() : Infinity
    return aDue - bDue
  })

  const incompleteCount = sorted.filter((a) => !a.completedAt).length

  const handleToggle = async (assignment: TaskAssignment) => {
    setLoading((prev) => ({ ...prev, [assignment.id]: true }))
    try {
      if (assignment.completedAt) {
        await uncompleteTask(assignment.id)
      } else {
        await completeTask(assignment.id, notes[assignment.id])
      }
    } finally {
      setLoading((prev) => ({ ...prev, [assignment.id]: false }))
    }
  }

  const formatDueDate = (date: Date | null) => {
    if (!date) return null
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const priorityColor = (priority: number) =>
    PRIORITY_COLORS[priority as PriorityValue] || PRIORITY_COLORS[1]

  const priorityLabel = (priority: number) =>
    PRIORITY_LABELS[priority as PriorityValue] || 'Normal'

  return (
    <section className="mt-6 px-2" aria-label="Tasks">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="text-xs uppercase text-gray-400 tracking-wider font-medium">Tasks</span>
        {incompleteCount > 0 && (
          <span className="text-[10px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full font-medium min-w-[18px] text-center">
            {incompleteCount}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {sorted.map((assignment) => {
          const isComplete = !!assignment.completedAt
          const colors = priorityColor(assignment.task.priority)
          const isLoading = loading[assignment.id]

          return (
            <div
              key={assignment.id}
              className={`rounded-lg p-2 ${isComplete ? 'opacity-50 bg-white/3' : 'bg-white/5'}`}
            >
              {/* Task header row */}
              <div className="flex items-start gap-2">
                {/* Checkbox */}
                <div
                  role="checkbox"
                  aria-checked={isComplete}
                  tabIndex={0}
                  onClick={() => !isLoading && handleToggle(assignment)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (!isLoading) handleToggle(assignment)
                    }
                  }}
                  className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded flex items-center justify-center cursor-pointer transition-colors ${
                    isComplete
                      ? 'bg-green-500'
                      : `border-2 ${colors.border}`
                  } ${isLoading ? 'opacity-50' : ''}`}
                >
                  {isComplete && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4.5 7.5L8 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Title and meta */}
                <div className="flex-1 min-w-0">
                  <div className={`text-xs ${isComplete ? 'text-gray-400 line-through' : 'text-white'}`}>
                    {assignment.task.title}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {assignment.task.dueDate && (
                      <span className={`text-[10px] ${colors.text}`}>
                        {formatDueDate(assignment.task.dueDate)}
                      </span>
                    )}
                    <span className={`text-[10px] ${colors.text}`}>
                      {priorityLabel(assignment.task.priority)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description */}
              {!isComplete && assignment.task.description && (
                <p className="text-xs text-gray-400 mt-1.5 pl-6">{assignment.task.description}</p>
              )}

              {/* Notes textarea — always visible for incomplete tasks */}
              {!isComplete && (
                <div className="mt-2 pl-6">
                  <textarea
                    className="w-full text-xs bg-white/5 border border-white/10 rounded p-2 text-gray-300 placeholder-gray-500 resize-none focus:outline-none focus:border-primary/50"
                    rows={2}
                    placeholder="Completion notes (optional)"
                    aria-label={`Completion notes for ${assignment.task.title}`}
                    value={notes[assignment.id] || ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [assignment.id]: e.target.value }))}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
