export const STREAK_FREEZE = {
  itemType: 'STREAK_FREEZE',
  maxQuantity: 3,
  earningInterval: 14,
  graceWindowDays: 2,
} as const

export const STREAK_SHIELD = {
  itemType: 'STREAK_SHIELD',
  maxQuantity: 5,
  earningInterval: 30,
} as const

export type InventoryItemMetadata = {
  earningCounter: number
}

export function parseItemMetadata(metadata: string | null): InventoryItemMetadata {
  if (!metadata) return { earningCounter: 0 }
  try {
    const parsed = JSON.parse(metadata)
    return { earningCounter: parsed.earningCounter ?? 0 }
  } catch {
    return { earningCounter: 0 }
  }
}

// Keep old name as alias for backward compatibility with journal.ts earning logic
export type StreakFreezeMetadata = InventoryItemMetadata
export const parseStreakFreezeMetadata = parseItemMetadata
