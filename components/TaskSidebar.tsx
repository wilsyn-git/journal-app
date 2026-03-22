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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  // Hide completed tasks older than 2 days
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  const filtered = assignments.filter((a) => {
    if (a.completedAt && new Date(a.completedAt) < twoDaysAgo) return false
    return true
  })

  if (filtered.length === 0) return null

  // Sort: incomplete first, then by priority (asc), then by due date (soonest first, null last). Completed at bottom.
  const sorted = [...filtered].sort((a, b) => {
    const aComplete = !!a.completedAt
    const bComplete = !!b.completedAt
    if (aComplete !== bComplete) return aComplete ? 1 : -1

    // Priority asc (urgent=0 first)
    if (a.task.priority !== b.task.priority) return a.task.priority - b.task.priority

    // Due date: soonest first, null last
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

  const handleComplete = async (assignment: TaskAssignment) => {
    setLoading((prev) => ({ ...prev, [assignment.id]: true }))
    try {
      await completeTask(assignment.id, notes[assignment.id])
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

      <div className="space-y-1">
        {sorted.map((assignment) => {
          const isExpanded = expandedId === assignment.id
          const isComplete = !!assignment.completedAt
          const colors = priorityColor(assignment.task.priority)
          const isLoading = loading[assignment.id]

          return (
            <div
              key={assignment.id}
              className={`rounded-lg transition-colors ${isComplete ? 'opacity-50' : ''} ${isExpanded ? 'bg-white/5' : 'hover:bg-white/5'}`}
            >
              {/* Collapsed card row */}
              <div className="flex items-start gap-2 p-2">
                {/* Checkbox */}
                <div
                  role="checkbox"
                  aria-checked={isComplete}
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!isLoading) handleToggle(assignment)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
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

                {/* Clickable card area */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : assignment.id)}
                  aria-expanded={isExpanded}
                >
                  <div className={`text-xs truncate ${isComplete ? 'text-gray-400 line-through' : 'text-white'}`}>
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

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-2 pb-2 pl-8">
                  {assignment.task.description && (
                    <p className="text-xs text-gray-400 mb-2">{assignment.task.description}</p>
                  )}
                  {!isComplete && (
                    <>
                      <textarea
                        className="w-full text-xs bg-white/5 border border-white/10 rounded p-2 text-gray-300 placeholder-gray-500 resize-none focus:outline-none focus:border-primary/50 mb-2"
                        rows={2}
                        placeholder="Completion notes (optional)"
                        aria-label={`Completion notes for ${assignment.task.title}`}
                        value={notes[assignment.id] || ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [assignment.id]: e.target.value }))}
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleComplete(assignment)}
                          disabled={isLoading}
                          className="text-xs px-3 py-1 bg-primary hover:bg-primary/80 text-white rounded transition-colors disabled:opacity-50"
                        >
                          Complete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
