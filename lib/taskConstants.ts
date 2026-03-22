export const PRIORITY = {
  URGENT: 0,
  NORMAL: 1,
  LOW: 2,
} as const

export type PriorityValue = typeof PRIORITY[keyof typeof PRIORITY]

export const PRIORITY_LABELS: Record<PriorityValue, string> = {
  [PRIORITY.URGENT]: 'Urgent',
  [PRIORITY.NORMAL]: 'Normal',
  [PRIORITY.LOW]: 'Low',
}

export const PRIORITY_COLORS: Record<PriorityValue, { border: string; text: string; bg: string }> = {
  [PRIORITY.URGENT]: { border: 'border-red-500', text: 'text-red-400', bg: 'bg-red-500' },
  [PRIORITY.NORMAL]: { border: 'border-primary', text: 'text-primary', bg: 'bg-primary' },
  [PRIORITY.LOW]: { border: 'border-zinc-600', text: 'text-gray-400', bg: 'bg-zinc-600' },
}

export const ASSIGNMENT_MODES = {
  USER: 'USER',
  GROUP: 'GROUP',
  ALL: 'ALL',
} as const
