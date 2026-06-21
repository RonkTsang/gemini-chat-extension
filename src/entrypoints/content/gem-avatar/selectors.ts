export const INJECTED_ATTR = 'data-gpk-gem-avatar-injected'

export const CHAT_ROOT_SELECTORS = [
  'chat-window #chat-history infinite-scroller[data-test-id="chat-history-container"]',
  '#chat-history infinite-scroller',
  'chat-window',
] as const
export const HEADER_ROOT_SELECTORS = ['chat-window', 'body'] as const
export const EDIT_ROOT_SELECTORS = ['bots-creation-window', 'body'] as const
export const LIST_ROOT_SELECTORS = ['div.bots-section-container', 'body'] as const

export const EDIT_LOGO_SELECTOR = 'bots-creation-window div.title-container > bot-logo'
export const EDIT_PREVIEW_CHAT_ROOT_SELECTOR = 'bots-creation-window infinite-scroller'
export const EDIT_PREVIEW_LOGO_SELECTOR = `${EDIT_PREVIEW_CHAT_ROOT_SELECTOR} bot-logo`
export const HEADER_LOGO_SELECTOR = 'bot-logo'
export const LIST_ROW_SELECTOR = 'div.bots-section-container bot-list-row'
export const LIST_ROW_LINK_SELECTOR = 'a.bot-row[href^="/gem/"], a.bot-row[href*="/gem/"]'
export const LIST_ROW_LOGO_SELECTOR = 'bot-logo'
export const USER_AVATAR_SELECTOR = 'sidenav-mavatar-footer > div.mavatar-footer-row > a > div.mavatar-container > img.mavatar-image'
export const USER_MESSAGE_TARGET_SELECTOR = 'user-query-content > div.user-query-container'
export const MODEL_MESSAGE_TARGET_SELECTOR = 'response-container > div.response-container'

export const LOGO_AVATAR_CLASS = 'gpk-gem-avatar-logo'
export const LOGO_AVATAR_CLICKABLE_CLASS = 'gpk-gem-avatar-logo-clickable'
export const MESSAGE_AVATAR_CLICKABLE_CLASS = 'gpk-gem-avatar-message-clickable'
export const RECENT_CHAT_LOGO_AVATAR_CLASS = 'gpk-gem-avatar-recent-chat-logo'
export const EDIT_PREVIEW_SCROLLER_CLASS = 'gpk-gem-avatar-edit-preview-scroller'

export const CHAT_RELEVANT_SELECTOR = [
  '.conversation-container',
  'user-query',
  'model-response',
  USER_MESSAGE_TARGET_SELECTOR,
  MODEL_MESSAGE_TARGET_SELECTOR,
].join(',')

export const CHAT_ROOT_RETRY_LIMIT = 20
export const CHAT_ROOT_RETRY_DELAY_MS = 250
export const CHAT_ROUTE_SETTLE_RETRY_LIMIT = 12
export const CHAT_ROUTE_SETTLE_RETRY_DELAY_MS = 250
