'use client'

import { useState } from 'react'

type TaskBannerProps = {
  totalTasks: number
  urgentCount: number
}

export function TaskBanner({ totalTasks, urgentCount }: TaskBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (totalTasks === 0 || dismissed) return null

  const handleViewTasks = () => {
    // On mobile, open the sidebar via custom event
    window.dispatchEvent(new Event('open-sidebar'))
    // On desktop, scroll to the tasks section
    setTimeout(() => {
      document.querySelector('[aria-label="Tasks"]')?.scrollIntoView({ behavior: 'smooth' })
    }, 300)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0"
          aria-hidden="true"
        />
        <span className="text-[13px] text-white truncate">
          You have <strong>{totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}</strong> to review
          {urgentCount > 0 && (
            <span className="text-[12px] text-gray-400"> &middot; {urgentCount} urgent</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleViewTasks}
          className="text-[12px] text-primary hover:text-white transition-colors whitespace-nowrap"
        >
          View tasks
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss task notification"
          className="text-gray-400 hover:text-white transition-colors p-0.5"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
