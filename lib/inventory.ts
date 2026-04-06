export const STREAK_FREEZE = {
  itemType: 'STREAK_FREEZE',
  maxQuantity: 3,
  earningInterval: 14,
  graceWindowDays: 2,
} as const

export type StreakFreezeMetadata = {
  earningCounter: number
}

export function parseStreakFreezeMetadata(metadata: string | null): StreakFreezeMetadata {
  if (!metadata) return { earningCounter: 0 }
  try {
    const parsed = JSON.parse(metadata)
    return { earningCounter: parsed.earningCounter ?? 0 }
  } catch {
    return { earningCounter: 0 }
  }
}
