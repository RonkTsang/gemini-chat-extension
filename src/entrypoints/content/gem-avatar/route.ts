import type { GemAvatarPage } from '@/domain/gem-avatar/types'

function decodePathSegment(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseGemAvatarPage(input: string | URL): GemAvatarPage {
  const pathname = typeof input === 'string'
    ? new URL(input, window.location.origin).pathname
    : input.pathname

  if (/^\/gems\/create\/?$/.test(pathname)) {
    return { kind: 'create' }
  }

  if (/^\/gems\/view\/?$/.test(pathname)) {
    return { kind: 'list' }
  }

  const editMatch = pathname.match(/^\/gems\/edit\/([^/]+)\/?$/)
  if (editMatch) {
    const gemId = decodePathSegment(editMatch[1])
    return gemId ? { kind: 'edit', gemId } : { kind: 'other' }
  }

  const chatMatch = pathname.match(/^\/gem\/([^/]+)(?:\/([^/]+))?\/?$/)
  if (chatMatch) {
    const gemId = decodePathSegment(chatMatch[1])
    const chatId = decodePathSegment(chatMatch[2])
    return gemId ? { kind: 'chat', gemId, chatId } : { kind: 'other' }
  }

  return { kind: 'other' }
}

export function getGemAvatarRouteKey(page: GemAvatarPage): string {
  if (page.kind === 'chat') {
    return `${page.kind}:${page.gemId}:${page.chatId ?? ''}`
  }
  if (page.kind === 'edit') {
    return `${page.kind}:${page.gemId}`
  }
  return page.kind
}
