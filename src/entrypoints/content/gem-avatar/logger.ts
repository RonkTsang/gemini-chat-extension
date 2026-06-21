import type { GemAvatarPage } from '@/domain/gem-avatar/types'
import { logDevEvent } from '@/utils/devLogger'

const GEM_AVATAR_LOG_LABEL = '[GemAvatar]'

export function describePageForLog(page: GemAvatarPage): string {
  if (page.kind === 'chat') {
    return page.chatId
      ? `chat:${page.gemId}/${page.chatId}`
      : `chat:${page.gemId}`
  }
  if (page.kind === 'edit') {
    return `edit:${page.gemId}`
  }
  return page.kind
}

export function describeElementForLog(element: Element | null): string | null {
  if (!element) return null

  const tag = element.tagName.toLowerCase()
  const id = element.id ? `#${element.id}` : ''
  const testId = element.getAttribute('data-test-id')
  const testIdText = testId ? `[data-test-id="${testId}"]` : ''
  return `${tag}${id}${testIdText}`
}

export function logGemAvatarEvent(
  event: string,
  details: Record<string, unknown> = {},
): void {
  logDevEvent('info', GEM_AVATAR_LOG_LABEL, event, details)
}
