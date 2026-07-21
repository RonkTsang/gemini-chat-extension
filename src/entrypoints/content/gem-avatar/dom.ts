import {
  EDIT_PREVIEW_SCROLLER_CLASS,
  INJECTED_ATTR,
  LOGO_AVATAR_CLASS,
  LOGO_AVATAR_CLICKABLE_CLASS,
  MESSAGE_AVATAR_CLICKABLE_CLASS,
  RECENT_CHAT_LOGO_AVATAR_CLASS,
} from './selectors'

interface LogoAvatarOptions {
  editGemId?: string
}

interface MessageAvatarOptions {
  editGemId?: string
}

export function findFirstElement(selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (element) return element
  }
  return null
}

export function getImageSource(image: HTMLImageElement | null): string | null {
  const source = image?.currentSrc || image?.src || image?.getAttribute('src')
  return source?.trim() || null
}

function createEditIconSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('fill', 'currentColor')
  path.setAttribute('d', 'M4 17.46V20h2.54L17.6 8.94l-2.54-2.54L4 17.46Zm15.56-10.48c.59-.59.59-1.54 0-2.12L18.14 3.44a1.5 1.5 0 0 0-2.12 0l-1.1 1.1 2.54 2.54 1.1-1.1Z')
  svg.append(path)
  return svg
}

function createCloseIconSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  path.setAttribute('stroke-width', '3')
  path.setAttribute('d', 'M18 6 6 18M6 6l12 12')
  svg.append(path)
  return svg
}

export function createUploaderElement(): HTMLElement {
  const uploader = document.createElement('gem-avatar-uploader')
  uploader.className = 'gpk-gem-avatar-uploader'
  uploader.setAttribute('role', 'button')
  uploader.setAttribute('tabindex', '0')
  uploader.setAttribute('aria-label', 'Upload Gem avatar')
  uploader.append(createEditIconSvg())
  return uploader
}

export function createDeleteButton(): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'gpk-gem-avatar-delete'
  button.setAttribute('aria-label', 'Delete Gem avatar')
  button.append(createCloseIconSvg())
  return button
}

function getGemEditUrl(gemId: string): string {
  return new URL(`/gems/edit/${encodeURIComponent(gemId)}`, window.location.origin).href
}

export function setAvatarImage(avatar: HTMLElement, src: string | null): void {
  let image = avatar.querySelector('img')
  if (!src) {
    image?.remove()
    avatar.removeAttribute('data-gpk-gem-avatar-src')
    return
  }

  if (!image) {
    image = document.createElement('img')
    image.alt = ''
    image.decoding = 'async'
    image.loading = 'lazy'
    avatar.append(image)
  }

  if (avatar.getAttribute('data-gpk-gem-avatar-src') !== src) {
    image.src = src
    avatar.setAttribute('data-gpk-gem-avatar-src', src)
  }
}

export function findDirectInjectedAvatar(
  target: Element,
  className: string,
): HTMLElement | null {
  return Array.from(target.children).find((child) => (
    child instanceof HTMLElement && child.classList.contains(className)
  )) as HTMLElement | null
}

export function removeDirectInjectedAvatar(target: Element, className: string): void {
  findDirectInjectedAvatar(target, className)?.remove()
}

function configureAvatarEditPageInteraction(
  avatar: HTMLElement,
  editGemId: string | undefined,
  clickableClassName: string,
): void {
  if (!editGemId) {
    avatar.classList.remove(clickableClassName)
    avatar.removeAttribute('role')
    avatar.removeAttribute('tabindex')
    avatar.removeAttribute('title')
    avatar.removeAttribute('aria-label')
    avatar.setAttribute('aria-hidden', 'true')
    avatar.onclick = null
    avatar.onkeydown = null
    return
  }

  const openEditPage = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    window.open(getGemEditUrl(editGemId), '_blank', 'noopener,noreferrer')
  }

  avatar.classList.add(clickableClassName)
  avatar.removeAttribute('aria-hidden')
  avatar.setAttribute('role', 'link')
  avatar.setAttribute('tabindex', '0')
  avatar.setAttribute('title', 'Open Gem editor')
  avatar.setAttribute('aria-label', 'Open Gem editor')
  avatar.onclick = openEditPage
  avatar.onkeydown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    openEditPage(event)
  }
}

export function ensureMessageAvatar(
  target: Element,
  variant: 'user' | 'model',
  src: string,
  size: 'normal' | 'compact' = 'normal',
  options: MessageAvatarOptions = {},
): void {
  if (!(target instanceof HTMLElement)) return

  const className = variant === 'user'
    ? 'gpk-gem-avatar-message-user'
    : 'gpk-gem-avatar-message-model'
  const existing = findDirectInjectedAvatar(target, className)
  const avatar = existing ?? document.createElement('gem-avatar')

  avatar.className = [
    'gpk-gem-avatar',
    'gpk-gem-avatar-message',
    className,
    size === 'compact' ? 'gpk-gem-avatar-message-compact' : '',
  ].join(' ')
  avatar.setAttribute(INJECTED_ATTR, 'true')
  avatar.setAttribute('aria-hidden', 'true')
  setAvatarImage(avatar, src)
  configureAvatarEditPageInteraction(
    avatar,
    options.editGemId,
    MESSAGE_AVATAR_CLICKABLE_CLASS,
  )

  target.classList.add('gpk-gem-avatar-anchor')
  if (!existing) {
    target.append(avatar)
  }
}

export function ensureLogoAvatar(
  target: Element,
  src: string,
  className: string,
  options: LogoAvatarOptions = {},
): void {
  if (!(target instanceof HTMLElement)) return

  const existing = findDirectInjectedAvatar(target, LOGO_AVATAR_CLASS)
  const avatar = existing ?? document.createElement('gem-avatar')
  const classNames = ['gpk-gem-avatar', LOGO_AVATAR_CLASS, className]

  if (target.closest('recent-chat-list-item')) {
    classNames.push(RECENT_CHAT_LOGO_AVATAR_CLASS)
  }

  avatar.className = classNames.join(' ')
  avatar.setAttribute(INJECTED_ATTR, 'true')
  avatar.setAttribute('aria-hidden', 'true')
  setAvatarImage(avatar, src)
  configureAvatarEditPageInteraction(
    avatar,
    options.editGemId,
    LOGO_AVATAR_CLICKABLE_CLASS,
  )

  target.classList.add('gpk-gem-avatar-logo-anchor')
  if (!existing) {
    target.append(avatar)
  }
}

export function removeInjectedAvatars(root: ParentNode = document): void {
  root.querySelectorAll(`[${INJECTED_ATTR}="true"]`).forEach((node) => {
    node.remove()
  })

  const cleanupClass = (className: string): void => {
    if (root instanceof Element && root.classList.contains(className)) {
      root.classList.remove(className)
    }
    root.querySelectorAll(`.${className}`).forEach((element) => {
      element.classList.remove(className)
    })
  }

  cleanupClass('gpk-gem-avatar-anchor')
  cleanupClass('gpk-gem-avatar-logo-anchor')
  cleanupClass(EDIT_PREVIEW_SCROLLER_CLASS)
}

export function ensureMatchingTargets(
  scope: ParentNode | Element,
  selector: string,
  callback: (element: Element) => void,
): void {
  if (scope instanceof Element && scope.matches(selector)) {
    callback(scope)
  }
  scope.querySelectorAll(selector).forEach(callback)
}
