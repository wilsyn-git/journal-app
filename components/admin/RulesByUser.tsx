'use client'

import { useState } from 'react'
import Link from 'next/link'

type UserRule = {
  ruleId: string
  title: string
  description: string | null
  isActive: boolean
  assignmentMode: string
}

type UserGroup = {
  userId: string
  userName: string
  rules: UserRule[]
}

type RulesByUserProps = {
  userGroups: UserGroup[]
  typeId: string
  deleteAction: (ruleId: string) => Promise<void>
}

const MODE_BADGES: Record<string, { label: string; className: string }> = {
  ALL: { label: 'Everyone', className: 'bg-green-500/20 text-green-400' },
  GROUP: { label: 'Group', className: 'bg-blue-500/20 text-blue-400' },
  USER: { label: 'User', className: 'bg-yellow-500/20 text-yellow-400' },
}

export function RulesByUser({ userGroups, typeId, deleteAction }: RulesByUserProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggle = (userId: string) => {
    setCollapsed(prev => ({ ...prev, [userId]: !prev[userId] }))
  }

  if (userGroups.length === 0) {
    return (
      <div className="glass-card border border-white/10 rounded-xl p-12 text-center">
        <p className="text-gray-400">No rules yet. Add one to get started.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {userGroups.map(group => {
        const isCollapsed = collapsed[group.userId] ?? false

        return (
          <div key={group.userId} className="border border-white/10 rounded-xl overflow-hidden">
            {/* User header — clickable to collapse */}
            <button
              onClick={() => toggle(group.userId)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/[0.07] transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <svg className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <span className={`font-medium ${isCollapsed ? 'text-gray-400' : 'text-white'}`}>{group.userName}</span>
                <span className="text-xs text-gray-500">
                  {group.rules.length} rule{group.rules.length === 1 ? '' : 's'}
                </span>
              </div>
            </button>

            {/* Rules list */}
            {!isCollapsed && (
              <div className="divide-y divide-white/5">
                {group.rules.map(rule => {
                  const modeBadge = MODE_BADGES[rule.assignmentMode] ?? {
                    label: rule.assignmentMode,
                    className: 'bg-gray-500/20 text-gray-400',
                  }

                  return (
                    <div
                      key={`${group.userId}-${rule.ruleId}`}
                      className="group px-4 py-3 pl-9 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium ${rule.isActive ? 'text-white' : 'text-gray-500'}`}>
                              {rule.title}
                            </span>
                            {!rule.isActive && (
                              <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">
                                Inactive
                              </span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded ${modeBadge.className}`}>
                              {modeBadge.label}
                            </span>
                          </div>
                          {rule.description && (
                            <p className="text-gray-400 text-sm mt-0.5 truncate">{rule.description}</p>
                          )}
                        </div>

                        <div className="shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link
                            href={`/admin/rules/types/${typeId}/rules/${rule.ruleId}`}
                            className="px-2.5 py-1 text-xs text-gray-300 border border-white/10 rounded hover:bg-white/5 hover:text-white transition-colors"
                          >
                            Details
                          </Link>
                          <Link
                            href={`/admin/rules/types/${typeId}/rules/${rule.ruleId}/edit`}
                            className="px-2.5 py-1 text-xs text-gray-300 border border-white/10 rounded hover:bg-white/5 hover:text-white transition-colors"
                          >
                            Edit
                          </Link>
                          <form action={async () => { await deleteAction(rule.ruleId) }}>
                            <button
                              type="submit"
                              className="px-2.5 py-1 text-xs text-red-400 border border-red-500/20 rounded hover:bg-red-500/10 hover:text-red-300 transition-colors"
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
