export const RESET_MODES = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  INTERVAL: 'INTERVAL',
} as const

export type ResetMode = typeof RESET_MODES[keyof typeof RESET_MODES]

export const RESET_MODE_LABELS: Record<ResetMode, string> = {
  [RESET_MODES.DAILY]: 'Daily',
  [RESET_MODES.WEEKLY]: 'Weekly',
  [RESET_MODES.INTERVAL]: 'Every N Days',
}

export const DAY_LABELS: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}
