import { gemAvatarRepository } from '@/data/repositories'
import type {
  GemAvatarPage,
  PreparedGemAvatarAsset,
} from '@/domain/gem-avatar/types'
import { eventBus } from '@/utils/eventbus'

import {
  createDeleteButton,
  createUploaderElement,
  ensureLogoAvatar,
  ensureMatchingTargets,
  ensureMessageAvatar,
  findDirectInjectedAvatar,
  findFirstElement,
  getImageSource,
  removeDirectInjectedAvatar,
  removeInjectedAvatars,
  setAvatarImage,
} from './dom'
import {
  describeElementForLog,
  describePageForLog,
  logGemAvatarEvent,
} from './logger'
import { getGemAvatarRouteKey, parseGemAvatarPage } from './route'
import {
  CHAT_RELEVANT_SELECTOR,
  CHAT_ROOT_RETRY_DELAY_MS,
  CHAT_ROOT_RETRY_LIMIT,
  CHAT_ROOT_SELECTORS,
  CHAT_ROUTE_SETTLE_RETRY_DELAY_MS,
  CHAT_ROUTE_SETTLE_RETRY_LIMIT,
  EDIT_LOGO_SELECTOR,
  EDIT_PREVIEW_CHAT_ROOT_SELECTOR,
  EDIT_PREVIEW_LOGO_SELECTOR,
  EDIT_PREVIEW_SCROLLER_CLASS,
  EDIT_ROOT_SELECTORS,
  HEADER_LOGO_SELECTOR,
  HEADER_ROOT_SELECTORS,
  INJECTED_ATTR,
  LIST_ROOT_SELECTORS,
  LIST_ROW_LINK_SELECTOR,
  LIST_ROW_LOGO_SELECTOR,
  LIST_ROW_SELECTOR,
  LOGO_AVATAR_CLASS,
  MODEL_MESSAGE_TARGET_SELECTOR,
  USER_AVATAR_SELECTOR,
  USER_MESSAGE_TARGET_SELECTOR,
} from './selectors'
import './style.css'

interface ObserverState {
  observer: MutationObserver | null
  root: Element | null
}

function pageUsesSameContext(a: GemAvatarPage, b: GemAvatarPage): boolean {
  return getGemAvatarRouteKey(a) === getGemAvatarRouteKey(b)
}

function isCreateOrEditPage(page: GemAvatarPage): boolean {
  return page.kind === 'create' || page.kind === 'edit'
}

function getCurrentEditAvatarUrl(
  page: GemAvatarPage,
  pendingPreviewUrl: string | null,
  activeGemAvatarUrl: string | null,
): string | null {
  if (page.kind === 'create') {
    return pendingPreviewUrl
  }
  if (page.kind === 'edit') {
    return pendingPreviewUrl ?? activeGemAvatarUrl
  }
  return null
}

class GemAvatarModule {
  private isStarted = false
  private currentPage: GemAvatarPage = { kind: 'other' }
  private unsubscribeUrlChange: (() => void) | null = null
  private chatState: ObserverState = { observer: null, root: null }
  private headerState: ObserverState = { observer: null, root: null }
  private editState: ObserverState = { observer: null, root: null }
  private listState: ObserverState = { observer: null, root: null }
  private pendingAvatar: PreparedGemAvatarAsset | null = null
  private pendingPreviewUrl: string | null = null
  private activeGemAvatarUrl: string | null = null
  private listAvatarUrls = new Map<string, string>()
  private listCheckedRows = new WeakSet<Element>()
  private scheduledListRows = new Set<Element>()
  private scheduledChatScopes = new Set<Element>()
  private chatFrameId: number | null = null
  private headerFrameId: number | null = null
  private editFrameId: number | null = null
  private listFrameId: number | null = null
  private chatRootRetryTimer: number | null = null
  private chatRootRetryAttempts = 0
  private chatRouteSettleTimer: number | null = null
  private chatRouteSettleAttempts = 0

  start(): void {
    if (this.isStarted) return

    this.isStarted = true
    this.unsubscribeUrlChange = eventBus.on('urlchange', (event) => {
      logGemAvatarEvent('urlchange-received', {
        eventUrl: event.url,
        href: window.location.href,
      })
      void this.syncToCurrentUrl()
    })
    void this.syncToCurrentUrl()
  }

  stop(): void {
    if (!this.isStarted) return

    this.unsubscribeUrlChange?.()
    this.unsubscribeUrlChange = null
    this.disconnectAllObservers()
    this.cancelScheduledWork()
    removeInjectedAvatars()
    this.clearPendingAvatar()
    this.clearActiveGemAvatar()
    this.clearListAvatarUrls()
    this.currentPage = { kind: 'other' }
    this.isStarted = false
  }

  private async syncToCurrentUrl(): Promise<void> {
    if (!this.isStarted) return

    const nextPage = parseGemAvatarPage(window.location.href)
    const sameContext = pageUsesSameContext(this.currentPage, nextPage)
    const previousPage = this.currentPage

    logGemAvatarEvent('route-sync', {
      previousPage: describePageForLog(previousPage),
      nextPage: describePageForLog(nextPage),
      sameContext,
    })

    if (!sameContext) {
      this.disconnectAllObservers()
      this.cancelScheduledWork()
      removeInjectedAvatars()
      this.clearActiveGemAvatar()
      this.clearListAvatarUrls()
    }

    if (
      previousPage.kind === 'create'
      && nextPage.kind === 'edit'
      && this.pendingAvatar
    ) {
      await gemAvatarRepository.savePrepared(nextPage.gemId, this.pendingAvatar)
      this.clearPendingAvatar()
    } else if (!isCreateOrEditPage(nextPage)) {
      this.clearPendingAvatar()
    }

    this.currentPage = nextPage

    if (nextPage.kind === 'chat') {
      this.activeGemAvatarUrl = await gemAvatarRepository.resolveObjectUrl(nextPage.gemId)
      logGemAvatarEvent('chat-avatar-resolved', {
        page: describePageForLog(nextPage),
        hasAvatar: Boolean(this.activeGemAvatarUrl),
      })
      if (!this.activeGemAvatarUrl) {
        removeInjectedAvatars()
      }
      this.resetChatRouteSettleRetry()
      this.installChatObserver()
      this.scheduleChatRootRetryIfNeeded()
      this.scheduleChatRouteSettleRetry()
      this.installHeaderObserver()
      this.ensureChatAvatars()
      this.ensureHeaderAvatar()
      return
    }

    if (nextPage.kind === 'edit') {
      this.activeGemAvatarUrl = await gemAvatarRepository.resolveObjectUrl(nextPage.gemId)
      this.installEditObserver()
      this.ensureEditAvatar()
      return
    }

    if (nextPage.kind === 'create') {
      this.installEditObserver()
      this.ensureEditAvatar()
      return
    }

    if (nextPage.kind === 'list') {
      this.installListObserver()
      this.ensureListAvatars()
      return
    }

    removeInjectedAvatars()
  }

  private installChatObserver(): void {
    const root = findFirstElement(CHAT_ROOT_SELECTORS)
    if (!root) {
      logGemAvatarEvent('chat-observer-root-missing')
      return
    }
    if (this.chatState.root === root && this.chatState.observer) {
      return
    }

    this.chatState.observer?.disconnect()
    const observer = new MutationObserver((mutations) => {
      const scopes = this.collectChatScopes(mutations)
      if (scopes.length === 0) return
      scopes.forEach((scope) => this.scheduledChatScopes.add(scope))
      this.scheduleChatFlush()
    })
    observer.observe(root, { childList: true, subtree: true })
    this.chatState = { observer, root }
    this.chatRootRetryAttempts = 0
    logGemAvatarEvent('chat-observer-installed', {
      root: describeElementForLog(root),
    })
  }

  private installHeaderObserver(): void {
    const root = findFirstElement(HEADER_ROOT_SELECTORS)
    if (!root) return
    if (this.headerState.root === root && this.headerState.observer) return

    this.headerState.observer?.disconnect()
    const observer = new MutationObserver((mutations) => {
      if (!this.mutationsContainElement(mutations, HEADER_LOGO_SELECTOR)) return
      this.scheduleHeaderFlush()
    })
    observer.observe(root, { childList: true, subtree: true })
    this.headerState = { observer, root }
  }

  private installEditObserver(): void {
    const root = findFirstElement(EDIT_ROOT_SELECTORS)
    if (!root) return
    if (this.editState.root === root && this.editState.observer) return

    this.editState.observer?.disconnect()
    const observer = new MutationObserver((mutations) => {
      if (!this.mutationsContainElement(mutations, [
        EDIT_LOGO_SELECTOR,
        EDIT_PREVIEW_CHAT_ROOT_SELECTOR,
        EDIT_PREVIEW_LOGO_SELECTOR,
        CHAT_RELEVANT_SELECTOR,
      ].join(','))) return
      this.scheduleEditFlush()
    })
    observer.observe(root, { childList: true, subtree: true })
    this.editState = { observer, root }
  }

  private installListObserver(): void {
    const root = findFirstElement(LIST_ROOT_SELECTORS)
    if (!root) return
    if (this.listState.root === root && this.listState.observer) return

    this.listState.observer?.disconnect()
    const observer = new MutationObserver((mutations) => {
      const rows = this.collectListRows(mutations)
      if (rows.length === 0) return
      rows.forEach((row) => this.scheduledListRows.add(row))
      this.scheduleListFlush()
    })
    observer.observe(root, { childList: true, subtree: true })
    this.listState = { observer, root }
  }

  private collectChatScopes(mutations: MutationRecord[]): Element[] {
    const scopes: Element[] = []

    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return
        if (node.matches(CHAT_RELEVANT_SELECTOR)) {
          scopes.push(node)
        }
        node.querySelectorAll(CHAT_RELEVANT_SELECTOR).forEach((element) => {
          scopes.push(element)
        })
      })
    }

    return scopes
  }

  private mutationsContainElement(
    mutations: MutationRecord[],
    selector: string,
  ): boolean {
    return mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => {
      if (!(node instanceof Element)) return false
      return node.matches(selector) || Boolean(node.querySelector(selector))
    }))
  }

  private collectListRows(mutations: MutationRecord[]): Element[] {
    const rows: Element[] = []

    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return
        if (node.matches(LIST_ROW_SELECTOR)) {
          rows.push(node)
        }
        node.querySelectorAll(LIST_ROW_SELECTOR).forEach((row) => {
          rows.push(row)
        })
      })
    }

    return rows
  }

  private scheduleChatFlush(): void {
    if (this.chatFrameId !== null) return
    this.chatFrameId = requestAnimationFrame(() => {
      this.chatFrameId = null
      const scopes = [...this.scheduledChatScopes]
      this.scheduledChatScopes.clear()
      scopes.forEach((scope) => this.ensureChatAvatars(scope))
    })
  }

  private scheduleChatRootRetryIfNeeded(): void {
    if (
      this.currentPage.kind !== 'chat'
      || this.chatState.root
      || this.chatRootRetryTimer !== null
      || this.chatRootRetryAttempts >= CHAT_ROOT_RETRY_LIMIT
    ) {
      return
    }

    this.chatRootRetryTimer = window.setTimeout(() => {
      this.chatRootRetryTimer = null
      if (this.currentPage.kind !== 'chat') return

      this.chatRootRetryAttempts += 1
      this.installChatObserver()
      if (this.chatState.root) {
        this.ensureChatAvatars()
        return
      }
      this.scheduleChatRootRetryIfNeeded()
    }, CHAT_ROOT_RETRY_DELAY_MS)
  }

  private resetChatRouteSettleRetry(): void {
    if (this.chatRouteSettleTimer !== null) {
      window.clearTimeout(this.chatRouteSettleTimer)
      this.chatRouteSettleTimer = null
    }
    this.chatRouteSettleAttempts = 0
  }

  private scheduleChatRouteSettleRetry(): void {
    if (
      this.currentPage.kind !== 'chat'
      || this.chatRouteSettleTimer !== null
      || this.chatRouteSettleAttempts >= CHAT_ROUTE_SETTLE_RETRY_LIMIT
    ) {
      return
    }

    this.chatRouteSettleTimer = window.setTimeout(() => {
      this.chatRouteSettleTimer = null
      if (this.currentPage.kind !== 'chat') return

      const previousRoot = this.chatState.root
      this.chatRouteSettleAttempts += 1
      this.installChatObserver()
      this.ensureChatAvatars()
      this.ensureHeaderAvatar()

      if (previousRoot !== this.chatState.root) {
        logGemAvatarEvent('chat-observer-root-refreshed-after-route-settle', {
          previousRoot: describeElementForLog(previousRoot),
          nextRoot: describeElementForLog(this.chatState.root),
          attempt: this.chatRouteSettleAttempts,
        })
      }

      this.scheduleChatRouteSettleRetry()
    }, CHAT_ROUTE_SETTLE_RETRY_DELAY_MS)
  }

  private scheduleHeaderFlush(): void {
    if (this.headerFrameId !== null) return
    this.headerFrameId = requestAnimationFrame(() => {
      this.headerFrameId = null
      this.ensureHeaderAvatar()
    })
  }

  private scheduleEditFlush(): void {
    if (this.editFrameId !== null) return
    this.editFrameId = requestAnimationFrame(() => {
      this.editFrameId = null
      this.ensureEditAvatar()
    })
  }

  private scheduleListFlush(): void {
    if (this.listFrameId !== null) return
    this.listFrameId = requestAnimationFrame(() => {
      this.listFrameId = null
      const rows = [...this.scheduledListRows]
      this.scheduledListRows.clear()
      void this.ensureListAvatars(rows)
    })
  }

  private ensureChatAvatars(scope: ParentNode | Element | null = this.chatState.root): void {
    if (!scope || this.currentPage.kind !== 'chat' || !this.activeGemAvatarUrl) {
      return
    }

    const gemId = this.currentPage.gemId
    const userAvatarUrl = getImageSource(
      document.querySelector<HTMLImageElement>(USER_AVATAR_SELECTOR),
    )

    ensureMatchingTargets(scope, USER_MESSAGE_TARGET_SELECTOR, (target) => {
      if (userAvatarUrl) {
        ensureMessageAvatar(target, 'user', userAvatarUrl)
      }
    })
    ensureMatchingTargets(scope, MODEL_MESSAGE_TARGET_SELECTOR, (target) => {
      ensureMessageAvatar(target, 'model', this.activeGemAvatarUrl!, 'normal', {
        editGemId: gemId,
      })
    })
  }

  private ensureHeaderAvatar(): void {
    if (this.currentPage.kind !== 'chat' || !this.activeGemAvatarUrl) {
      return
    }

    const root = this.headerState.root ?? document
    root.querySelectorAll(HEADER_LOGO_SELECTOR).forEach((logo) => {
      ensureLogoAvatar(logo, this.activeGemAvatarUrl!, 'gpk-gem-avatar-header', {
        editGemId: this.currentPage.kind === 'chat'
          ? this.currentPage.gemId
          : undefined,
      })
    })
  }

  private ensureEditAvatar(): void {
    if (!isCreateOrEditPage(this.currentPage)) return

    const previewUrl = getCurrentEditAvatarUrl(
      this.currentPage,
      this.pendingPreviewUrl,
      this.activeGemAvatarUrl,
    )

    document.querySelectorAll(EDIT_LOGO_SELECTOR).forEach((logo) => {
      this.ensureEditPreview(logo, previewUrl)
    })
    if (!previewUrl) {
      this.removeEditPreviewAvatars()
      return
    }

    this.ensureEditPreviewLogos(previewUrl)
    this.ensureEditPreviewChatAvatars(previewUrl)
  }

  private ensureEditPreviewLogos(previewUrl: string | null): void {
    if (!previewUrl) return

    document.querySelectorAll(EDIT_PREVIEW_LOGO_SELECTOR).forEach((logo) => {
      ensureLogoAvatar(logo, previewUrl, 'gpk-gem-avatar-edit-preview-logo')
    })
  }

  private ensureEditPreviewChatAvatars(previewUrl: string | null): void {
    if (!previewUrl) return

    const userAvatarUrl = getImageSource(
      document.querySelector<HTMLImageElement>(USER_AVATAR_SELECTOR),
    )
    document.querySelectorAll(EDIT_PREVIEW_CHAT_ROOT_SELECTOR).forEach((root) => {
      if (root instanceof HTMLElement) {
        root.classList.add(EDIT_PREVIEW_SCROLLER_CLASS)
      }
      ensureMatchingTargets(root, USER_MESSAGE_TARGET_SELECTOR, (target) => {
        if (userAvatarUrl) {
          ensureMessageAvatar(target, 'user', userAvatarUrl, 'compact')
        }
      })
      ensureMatchingTargets(root, MODEL_MESSAGE_TARGET_SELECTOR, (target) => {
        ensureMessageAvatar(target, 'model', previewUrl, 'compact')
      })
    })
  }

  private removeEditPreviewAvatars(): void {
    document.querySelectorAll(EDIT_PREVIEW_LOGO_SELECTOR).forEach((logo) => {
      const avatar = findDirectInjectedAvatar(logo, LOGO_AVATAR_CLASS)
      if (avatar?.classList.contains('gpk-gem-avatar-edit-preview-logo')) {
        avatar.remove()
      }
    })
    document.querySelectorAll(EDIT_PREVIEW_CHAT_ROOT_SELECTOR).forEach((root) => {
      if (root instanceof HTMLElement) {
        root.classList.remove(EDIT_PREVIEW_SCROLLER_CLASS)
      }
      ensureMatchingTargets(root, MODEL_MESSAGE_TARGET_SELECTOR, (target) => {
        removeDirectInjectedAvatar(target, 'gpk-gem-avatar-message-model')
      })
    })
  }

  private async ensureListAvatars(
    rows: Iterable<Element> | null = null,
  ): Promise<void> {
    if (this.currentPage.kind !== 'list') return

    const targets = rows
      ? [...rows]
      : [...document.querySelectorAll(LIST_ROW_SELECTOR)]

    await Promise.all(targets.map((row) => this.ensureListRowAvatar(row)))
  }

  private async ensureListRowAvatar(row: Element): Promise<void> {
    if (this.listCheckedRows.has(row)) return

    const gemId = this.getGemIdFromListRow(row)
    const logo = row.querySelector(LIST_ROW_LOGO_SELECTOR)
    if (!gemId || !logo) return

    this.listCheckedRows.add(row)
    const avatarUrl = await this.resolveListAvatarUrl(gemId)
    if (!avatarUrl || this.currentPage.kind !== 'list') return

    ensureLogoAvatar(logo, avatarUrl, 'gpk-gem-avatar-list')
  }

  private getGemIdFromListRow(row: Element): string | null {
    const link = row.querySelector<HTMLAnchorElement>(LIST_ROW_LINK_SELECTOR)
    const href = link?.getAttribute('href') || link?.href
    if (!href) return null

    try {
      const url = new URL(href, window.location.origin)
      const match = url.pathname.match(/^\/gem\/([^/]+)\/?$/)
      return match?.[1] ? decodeURIComponent(match[1]) : null
    } catch {
      return null
    }
  }

  private async resolveListAvatarUrl(gemId: string): Promise<string | null> {
    const existing = this.listAvatarUrls.get(gemId)
    if (existing) return existing

    const avatar = await gemAvatarRepository.getByGemId(gemId)
    if (!avatar) return null

    const objectUrl = URL.createObjectURL(avatar.blob)
    this.listAvatarUrls.set(gemId, objectUrl)
    return objectUrl
  }

  private ensureEditPreview(logo: Element, previewUrl: string | null): void {
    if (!(logo instanceof HTMLElement)) return

    let preview = findDirectInjectedAvatar(logo, 'gpk-gem-avatar-preview')
    if (!preview) {
      preview = document.createElement('gem-avatar-preview')
      preview.className = 'gpk-gem-avatar-preview'
      preview.setAttribute(INJECTED_ATTR, 'true')

      const avatar = document.createElement('gem-avatar')
      avatar.className = 'gpk-gem-avatar gpk-gem-avatar-edit'
      avatar.setAttribute('aria-hidden', 'true')

      const uploader = createUploaderElement()
      const deleteButton = createDeleteButton()

      const input = document.createElement('input')
      input.className = 'gpk-gem-avatar-file-input'
      input.type = 'file'
      input.accept = 'image/png,image/jpeg,image/webp'
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        input.value = ''
        if (file) {
          void this.handleAvatarFile(file)
        }
      })

      const openFilePicker = (event: Event) => {
        event.preventDefault()
        event.stopPropagation()
        input.click()
      }
      uploader.addEventListener('click', openFilePicker)
      uploader.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        openFilePicker(event)
      })
      deleteButton.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        void this.handleDeleteAvatar()
      })

      preview.append(avatar, uploader, deleteButton, input)
      logo.classList.add('gpk-gem-avatar-logo-anchor')
      logo.append(preview)
    }

    const avatar = preview.querySelector<HTMLElement>('gem-avatar')
    if (avatar) {
      setAvatarImage(avatar, previewUrl)
    }

    const deleteButton = preview.querySelector<HTMLButtonElement>('.gpk-gem-avatar-delete')
    if (deleteButton) {
      deleteButton.hidden = this.currentPage.kind !== 'edit' || !previewUrl
    }
  }

  private async handleAvatarFile(file: File): Promise<void> {
    try {
      const prepared = await gemAvatarRepository.prepare(file)

      if (this.currentPage.kind === 'edit') {
        await gemAvatarRepository.savePrepared(this.currentPage.gemId, prepared)
        this.activeGemAvatarUrl = await gemAvatarRepository.resolveObjectUrl(this.currentPage.gemId)
        this.clearPendingAvatar()
      } else if (this.currentPage.kind === 'create') {
        this.setPendingAvatar(prepared)
      }

      this.ensureEditAvatar()
    } catch (error) {
      console.warn('[GemAvatar] Failed to upload Gem avatar:', error)
      window.alert('Choose a PNG, JPEG, or WebP image up to 3 MB.')
    }
  }

  private async handleDeleteAvatar(): Promise<void> {
    if (this.currentPage.kind !== 'edit' || !this.activeGemAvatarUrl) return

    try {
      await gemAvatarRepository.deleteByGemId(this.currentPage.gemId)
      this.activeGemAvatarUrl = null
      this.clearPendingAvatar()
      this.ensureEditAvatar()
    } catch (error) {
      console.warn('[GemAvatar] Failed to delete Gem avatar:', error)
      window.alert('Could not delete this Gem avatar. Try again.')
    }
  }

  private setPendingAvatar(prepared: PreparedGemAvatarAsset): void {
    this.clearPendingAvatar()
    this.pendingAvatar = prepared
    this.pendingPreviewUrl = URL.createObjectURL(prepared.blob)
  }

  private clearPendingAvatar(): void {
    if (this.pendingPreviewUrl) {
      URL.revokeObjectURL(this.pendingPreviewUrl)
    }
    this.pendingAvatar = null
    this.pendingPreviewUrl = null
  }

  private clearActiveGemAvatar(): void {
    gemAvatarRepository.revokeActiveObjectUrl()
    this.activeGemAvatarUrl = null
  }

  private disconnectAllObservers(): void {
    this.chatState.observer?.disconnect()
    this.headerState.observer?.disconnect()
    this.editState.observer?.disconnect()
    this.listState.observer?.disconnect()
    this.chatState = { observer: null, root: null }
    this.headerState = { observer: null, root: null }
    this.editState = { observer: null, root: null }
    this.listState = { observer: null, root: null }
  }

  private cancelScheduledWork(): void {
    if (this.chatFrameId !== null) {
      cancelAnimationFrame(this.chatFrameId)
      this.chatFrameId = null
    }
    if (this.headerFrameId !== null) {
      cancelAnimationFrame(this.headerFrameId)
      this.headerFrameId = null
    }
    if (this.editFrameId !== null) {
      cancelAnimationFrame(this.editFrameId)
      this.editFrameId = null
    }
    if (this.listFrameId !== null) {
      cancelAnimationFrame(this.listFrameId)
      this.listFrameId = null
    }
    if (this.chatRootRetryTimer !== null) {
      window.clearTimeout(this.chatRootRetryTimer)
      this.chatRootRetryTimer = null
    }
    if (this.chatRouteSettleTimer !== null) {
      window.clearTimeout(this.chatRouteSettleTimer)
      this.chatRouteSettleTimer = null
    }
    this.chatRootRetryAttempts = 0
    this.chatRouteSettleAttempts = 0
    this.scheduledChatScopes.clear()
    this.scheduledListRows.clear()
  }

  private clearListAvatarUrls(): void {
    this.listAvatarUrls.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    this.listAvatarUrls.clear()
    this.listCheckedRows = new WeakSet<Element>()
  }
}

export const gemAvatarModule = new GemAvatarModule()
export { parseGemAvatarPage }
