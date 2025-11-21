export const QUICK_FOLLOW_ICON_KEYS = [
  'sparkles',
  'translate',
  'bulb',
  'book',
  'code',
  'chat',
  'pen',
  'check',
  'gear',
  'globe',
  'clipboard',
  'question',
  'star',
  'share',
  'download',
  'search',
  'filter',
  'refresh',
  'copy',
  'link',
  'image',
  'video',
  'calendar',
  'tag'
] as const

export type QuickFollowIconKey = (typeof QUICK_FOLLOW_ICON_KEYS)[number]

export const DEFAULT_QUICK_FOLLOW_ICON_KEY: QuickFollowIconKey = QUICK_FOLLOW_ICON_KEYS[0]

