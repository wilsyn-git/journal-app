export type AchievementReward = {
  itemType: string
  quantity: number
}

export type AchievementTier = {
  level: number
  threshold: number
  label: string
  reward: AchievementReward | null
}

export type AchievementDefinition = {
  id: string
  name: string
  icon: string
  metric: string
  tiers: AchievementTier[]
}

export const ACHIEVEMENT_REGISTRY: AchievementDefinition[] = [
  {
    id: 'streak',
    name: 'On a Roll',
    icon: '🔥',
    metric: 'maxStreak',
    tiers: [
      { level: 1, threshold: 7, label: '7-day streak', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 2, threshold: 30, label: '30-day streak', reward: { itemType: 'STREAK_SHIELD', quantity: 1 } },
      { level: 3, threshold: 100, label: '100-day streak', reward: { itemType: 'STREAK_SHIELD', quantity: 1 } },
    ],
  },
  {
    id: 'persistent',
    name: 'Persistent',
    icon: '📅',
    metric: 'totalDaysJournaled',
    tiers: [
      { level: 1, threshold: 30, label: '30 days journaled', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 2, threshold: 100, label: '100 days journaled', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 3, threshold: 365, label: '365 days journaled', reward: { itemType: 'STREAK_SHIELD', quantity: 1 } },
    ],
  },
  {
    id: 'dedicated',
    name: 'Dedicated',
    icon: '✍️',
    metric: 'totalEntries',
    tiers: [
      { level: 1, threshold: 100, label: '100 answers', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 2, threshold: 500, label: '500 answers', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 3, threshold: 1000, label: '1,000 answers', reward: { itemType: 'STREAK_SHIELD', quantity: 1 } },
    ],
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    icon: '🦉',
    metric: 'lateNightEntries',
    tiers: [
      { level: 1, threshold: 5, label: '5 late entries', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
      { level: 2, threshold: 25, label: '25 late entries', reward: { itemType: 'STREAK_FREEZE', quantity: 1 } },
    ],
  },
]
