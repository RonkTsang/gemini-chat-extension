import { storage } from '#imports'

export type ChatWidthMode = 'default' | 'percent' | 'px'
export type WidthSettingTarget = 'chat' | 'input'
export type UserMessageAlignment = 'left' | 'right'

export interface ChatSettings {
  chatWidthMode: ChatWidthMode
  chatWidthPercent: number
  chatWidthPx: number
  inputWidthMode: ChatWidthMode
  inputWidthPercent: number
  inputWidthPx: number
  syncInputWidth: boolean
  userMessageAlignment: UserMessageAlignment
  userMessageFullWidth: boolean
}

export type ChatSettingsPatch = Partial<ChatSettings>

export const CHAT_WIDTH_PERCENT_MIN = 35
export const CHAT_WIDTH_PERCENT_MAX = 100
export const CHAT_WIDTH_PX_MIN = 700
export const CHAT_WIDTH_PX_MAX = 2000

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  chatWidthMode: 'default',
  chatWidthPercent: 50,
  chatWidthPx: 760,
  inputWidthMode: 'default',
  inputWidthPercent: 50,
  inputWidthPx: 760,
  syncInputWidth: true,
  userMessageAlignment: 'right',
  userMessageFullWidth: false,
}

export function createWidthModePatch(
  target: WidthSettingTarget,
  mode: ChatWidthMode,
  syncInputWidth: boolean,
): ChatSettingsPatch {
  if (syncInputWidth) {
    return {
      chatWidthMode: mode,
      inputWidthMode: mode,
    }
  }

  return target === 'chat'
    ? { chatWidthMode: mode }
    : { inputWidthMode: mode }
}

export function createWidthValuePatch(
  target: WidthSettingTarget,
  mode: ChatWidthMode,
  value: number,
  syncInputWidth: boolean,
): ChatSettingsPatch {
  if (mode === 'default') return {}

  if (mode === 'percent') {
    if (syncInputWidth) {
      return {
        chatWidthPercent: value,
        inputWidthPercent: value,
      }
    }

    return target === 'chat'
      ? { chatWidthPercent: value }
      : { inputWidthPercent: value }
  }

  if (syncInputWidth) {
    return {
      chatWidthPx: value,
      inputWidthPx: value,
    }
  }

  return target === 'chat'
    ? { chatWidthPx: value }
    : { inputWidthPx: value }
}

export function createSyncInputWidthPatch(
  settings: ChatSettings,
  syncInputWidth: boolean,
): ChatSettingsPatch {
  if (!syncInputWidth) return { syncInputWidth: false }

  return {
    syncInputWidth: true,
    inputWidthMode: settings.chatWidthMode,
    inputWidthPercent: settings.chatWidthPercent,
    inputWidthPx: settings.chatWidthPx,
  }
}

function normalizeMode(value: unknown): ChatWidthMode {
  return value === 'percent' || value === 'px' || value === 'default'
    ? value
    : 'default'
}

function normalizeAlignment(value: unknown): UserMessageAlignment {
  return value === 'left' || value === 'right' ? value : 'right'
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

export function normalizeChatSettings(raw: unknown): ChatSettings {
  const source = raw && typeof raw === 'object'
    ? raw as Partial<ChatSettings>
    : {}

  const normalized: ChatSettings = {
    chatWidthMode: normalizeMode(source.chatWidthMode),
    chatWidthPercent: normalizeNumber(
      source.chatWidthPercent,
      DEFAULT_CHAT_SETTINGS.chatWidthPercent,
      CHAT_WIDTH_PERCENT_MIN,
      CHAT_WIDTH_PERCENT_MAX,
    ),
    chatWidthPx: normalizeNumber(
      source.chatWidthPx,
      DEFAULT_CHAT_SETTINGS.chatWidthPx,
      CHAT_WIDTH_PX_MIN,
      CHAT_WIDTH_PX_MAX,
    ),
    inputWidthMode: normalizeMode(source.inputWidthMode),
    inputWidthPercent: normalizeNumber(
      source.inputWidthPercent,
      DEFAULT_CHAT_SETTINGS.inputWidthPercent,
      CHAT_WIDTH_PERCENT_MIN,
      CHAT_WIDTH_PERCENT_MAX,
    ),
    inputWidthPx: normalizeNumber(
      source.inputWidthPx,
      DEFAULT_CHAT_SETTINGS.inputWidthPx,
      CHAT_WIDTH_PX_MIN,
      CHAT_WIDTH_PX_MAX,
    ),
    syncInputWidth: typeof source.syncInputWidth === 'boolean'
      ? source.syncInputWidth
      : DEFAULT_CHAT_SETTINGS.syncInputWidth,
    userMessageAlignment: normalizeAlignment(source.userMessageAlignment),
    userMessageFullWidth: typeof source.userMessageFullWidth === 'boolean'
      ? source.userMessageFullWidth
      : DEFAULT_CHAT_SETTINGS.userMessageFullWidth,
  }

  if (normalized.syncInputWidth) {
    normalized.inputWidthMode = normalized.chatWidthMode
    normalized.inputWidthPercent = normalized.chatWidthPercent
    normalized.inputWidthPx = normalized.chatWidthPx
  }

  return normalized
}

export const chatSettingsStorage = storage.defineItem<ChatSettings>(
  'sync:chatSettings',
  {
    fallback: DEFAULT_CHAT_SETTINGS,
  },
)

export async function getChatSettings(): Promise<ChatSettings> {
  return normalizeChatSettings(await chatSettingsStorage.getValue())
}

export async function updateChatSettings(
  patch: ChatSettingsPatch,
): Promise<ChatSettings> {
  const current = await getChatSettings()
  const next = normalizeChatSettings({
    ...current,
    ...patch,
  })
  await chatSettingsStorage.setValue(next)
  return next
}
