export const PROMPT_TYPES = {
  TEXT: 'TEXT',
  RADIO: 'RADIO',
  CHECKBOX: 'CHECKBOX',
  RANGE: 'RANGE',
} as const

export type PromptType = typeof PROMPT_TYPES[keyof typeof PROMPT_TYPES]
