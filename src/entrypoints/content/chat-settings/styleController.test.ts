import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_CHAT_SETTINGS } from '@/services/chatSettings'
import {
  applyChatSettingsStyles,
  clearChatSettingsStyles,
} from './styleController'

const CHAT_SETTINGS_SCOPE =
  'chat-window:not(.preview-chat-window):not(.in-gems-mode)'

describe('Chat layout style controller', () => {
  afterEach(() => {
    clearChatSettingsStyles()
  })

  it('applies independent chat and input widths', () => {
    applyChatSettingsStyles({
      ...DEFAULT_CHAT_SETTINGS,
      chatWidthMode: 'percent',
      chatWidthPercent: 65,
      inputWidthMode: 'px',
      inputWidthPx: 1200,
      syncInputWidth: false,
    })

    const root = document.documentElement
    const css = document.getElementById('gpk-chat-settings-style')?.textContent
    expect(root.hasAttribute('data-gpk-chat-width')).toBe(true)
    expect(root.style.getPropertyValue('--gpk-chat-width')).toBe('65%')
    expect(root.hasAttribute('data-gpk-input-width')).toBe(true)
    expect(root.style.getPropertyValue('--gpk-input-width')).toBe('1200px')
    expect(css).toContain(
      `:root[data-gpk-chat-width] ${CHAT_SETTINGS_SCOPE} infinite-scroller > div.conversation-container user-query {\n  max-width: 100% !important;\n}`,
    )
    expect(css).toContain(
      `:root[data-gpk-input-width] ${CHAT_SETTINGS_SCOPE} input-container > fieldset {`,
    )
  })

  it('syncs Input Width to Chat Width and restores native styles in Default', () => {
    applyChatSettingsStyles({
      ...DEFAULT_CHAT_SETTINGS,
      chatWidthMode: 'px',
      chatWidthPx: 1440,
      inputWidthMode: 'percent',
      inputWidthPercent: 80,
      syncInputWidth: true,
    })

    expect(
      document.documentElement.style.getPropertyValue('--gpk-input-width'),
    ).toBe('1440px')

    applyChatSettingsStyles(DEFAULT_CHAT_SETTINGS)

    expect(document.documentElement.hasAttribute('data-gpk-chat-width'))
      .toBe(false)
    expect(document.documentElement.hasAttribute('data-gpk-input-width'))
      .toBe(false)
  })

  it('scopes alignment, full-width, and table compatibility rules', () => {
    applyChatSettingsStyles({
      ...DEFAULT_CHAT_SETTINGS,
      userMessageAlignment: 'left',
      userMessageFullWidth: true,
    })

    const root = document.documentElement
    const css = document.getElementById('gpk-chat-settings-style')?.textContent
    expect(root.hasAttribute('data-gpk-user-message-left')).toBe(true)
    expect(root.hasAttribute('data-gpk-user-message-full-width')).toBe(true)
    expect(css).toContain(
      'infinite-scroller > div.conversation-container table-block',
    )
    expect(css).toContain('overflow-x: auto !important')
    expect(css).not.toContain('overflow-x: hidden')
    expect(css).toContain(
      `:root[data-gpk-user-message-left] ${CHAT_SETTINGS_SCOPE} user-query-content .file-preview-container {\n  justify-content: flex-start !important;\n  margin-inline-start: unset !important;\n}`,
    )
    expect(css).not.toContain(
      'user-query-content file-preview-container {',
    )
    expect(css).toContain(
      `:root[data-gpk-user-message-left] ${CHAT_SETTINGS_SCOPE} user-query-content .query-content {\n  margin-inline-start: unset !important;\n  padding-inline-start: unset !important;\n  justify-content: flex-start !important;\n}`,
    )
    expect(css).toContain(
      `:root[data-gpk-user-message-left] ${CHAT_SETTINGS_SCOPE} user-query-content > div.user-query-container > .gpk-gem-avatar-message-user {\n  left: -12px !important;\n  right: auto !important;\n  transform: translateX(-100%) !important;\n}`,
    )
    expect(css).toContain(
      `${CHAT_SETTINGS_SCOPE} user-query user-query-content span.user-query-bubble-with-background`,
    )
  })
})
