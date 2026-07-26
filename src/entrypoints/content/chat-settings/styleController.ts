import {
  normalizeChatSettings,
  type ChatSettings,
  type ChatWidthMode,
} from '@/services/chatSettings'

const STYLE_ID = 'gpk-chat-settings-style'
const CHAT_WIDTH_ATTR = 'data-gpk-chat-width'
const INPUT_WIDTH_ATTR = 'data-gpk-input-width'
const USER_MESSAGE_LEFT_ATTR = 'data-gpk-user-message-left'
const USER_MESSAGE_FULL_WIDTH_ATTR = 'data-gpk-user-message-full-width'

const CHAT_WIDTH_VAR = '--gpk-chat-width'
const INPUT_WIDTH_VAR = '--gpk-input-width'
const CHAT_SETTINGS_SCOPE_SELECTOR =
  'chat-window:not(.preview-chat-window):not(.in-gems-mode)'

const STYLE = `
:root[${CHAT_WIDTH_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} infinite-scroller > div.conversation-container {
  box-sizing: border-box !important;
  max-width: var(${CHAT_WIDTH_VAR}) !important;
}

:root[${CHAT_WIDTH_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} infinite-scroller > div.conversation-container user-query {
  max-width: 100% !important;
}

:root[${CHAT_WIDTH_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} infinite-scroller > div.conversation-container table-block,
:root[${CHAT_WIDTH_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} infinite-scroller > div.conversation-container .table-block {
  box-sizing: border-box !important;
  max-width: 100% !important;
}

:root[${CHAT_WIDTH_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} infinite-scroller > div.conversation-container table-block .table-content,
:root[${CHAT_WIDTH_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} infinite-scroller > div.conversation-container .table-block .table-content {
  max-width: 100% !important;
  overflow-x: auto !important;
}

:root[${INPUT_WIDTH_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} input-container > fieldset {
  box-sizing: border-box !important;
  max-width: var(${INPUT_WIDTH_VAR}) !important;
}

:root[${USER_MESSAGE_LEFT_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} user-query-content {
  justify-content: flex-start !important;
}

:root[${USER_MESSAGE_LEFT_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} user-query-content .file-preview-container {
  justify-content: flex-start !important;
  margin-inline-start: unset !important;
}

:root[${USER_MESSAGE_LEFT_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} user-query-content .file-preview-container user-query-file-carousel {
  justify-content: flex-start !important;
}

:root[${USER_MESSAGE_LEFT_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} user-query-content .query-content {
  margin-inline-start: unset !important;
  padding-inline-start: unset !important;
  justify-content: flex-start !important;
}

:root[${USER_MESSAGE_LEFT_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} user-query-content > div.user-query-container > .gpk-gem-avatar-message-user {
  left: -12px !important;
  right: auto !important;
  transform: translateX(-100%) !important;
}

:root[${USER_MESSAGE_FULL_WIDTH_ATTR}] ${CHAT_SETTINGS_SCOPE_SELECTOR} user-query user-query-content span.user-query-bubble-with-background {
  max-width: 100% !important;
}
`

function widthValue(
  mode: ChatWidthMode,
  percent: number,
  px: number,
): string | null {
  if (mode === 'percent') return `${percent}%`
  if (mode === 'px') return `${px}px`
  return null
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLE
  document.head.appendChild(style)
}

function applyWidth(
  root: HTMLElement,
  attribute: string,
  variable: string,
  value: string | null,
): void {
  root.toggleAttribute(attribute, value !== null)
  if (value === null) {
    root.style.removeProperty(variable)
  } else {
    root.style.setProperty(variable, value)
  }
}

export function applyChatSettingsStyles(raw: ChatSettings): void {
  const settings = normalizeChatSettings(raw)
  const root = document.documentElement
  const chatWidth = widthValue(
    settings.chatWidthMode,
    settings.chatWidthPercent,
    settings.chatWidthPx,
  )
  const inputWidth = settings.syncInputWidth
    ? chatWidth
    : widthValue(
        settings.inputWidthMode,
        settings.inputWidthPercent,
        settings.inputWidthPx,
      )

  ensureStyle()
  applyWidth(root, CHAT_WIDTH_ATTR, CHAT_WIDTH_VAR, chatWidth)
  applyWidth(root, INPUT_WIDTH_ATTR, INPUT_WIDTH_VAR, inputWidth)
  root.toggleAttribute(
    USER_MESSAGE_LEFT_ATTR,
    settings.userMessageAlignment === 'left',
  )
  root.toggleAttribute(
    USER_MESSAGE_FULL_WIDTH_ATTR,
    settings.userMessageFullWidth,
  )
}

export function clearChatSettingsStyles(): void {
  const root = document.documentElement
  root.removeAttribute(CHAT_WIDTH_ATTR)
  root.removeAttribute(INPUT_WIDTH_ATTR)
  root.removeAttribute(USER_MESSAGE_LEFT_ATTR)
  root.removeAttribute(USER_MESSAGE_FULL_WIDTH_ATTR)
  root.style.removeProperty(CHAT_WIDTH_VAR)
  root.style.removeProperty(INPUT_WIDTH_VAR)
  document.getElementById(STYLE_ID)?.remove()
}
