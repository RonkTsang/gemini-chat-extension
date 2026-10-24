import tippy, { type Instance } from 'tippy.js'

import { t } from '@/utils/i18n'
import { hasQuoteAnchor, readQueryLines, readRawQuery, resolveQueryText } from './dom'
import { effectiveComment, parseDisplayMessage, type SelectionItem } from './protocol'

const I18N = 'quickFollow.multiSelection'
const HISTORY_VIEW_CLASS = 'gpk-follow-history'
const CARD_CLASS = 'gpk-follow-card'

type CardCallbacks = {
  onComment: (id: string) => void
  onJumpToSource: (id: string) => boolean | void
  onRemove: (id: string) => boolean | void
}

type HistoryState = {
  queryText: HTMLElement
  lines: HTMLElement[]
  displays: string[]
  raw: string
  view: HTMLElement
  tooltip: Instance[]
  priorAttributes: Record<string, string | null>
}

type DraftCard = {
  item: SelectionItem
  signature: string
  index: number
  root: HTMLElement
  heading: HTMLElement
  preview: HTMLElement
  commentButton: HTMLButtonElement
  tooltip: Instance
  editButton?: HTMLButtonElement
  removeButton: HTMLButtonElement
}

const historyStates = new WeakMap<Element, HistoryState>()
let activeCardTooltip: Instance | null = null
const tooltipEscapeCleanup = new WeakMap<Instance, () => void>()

function setActiveCardTooltip(instance: Instance): void {
  if (activeCardTooltip && activeCardTooltip !== instance) activeCardTooltip.hide()
  activeCardTooltip = instance
  if (tooltipEscapeCleanup.has(instance)) return
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    instance.hide()
  }
  const cleanup = () => document.removeEventListener('keydown', onEscape, true)
  tooltipEscapeCleanup.set(instance, cleanup)
  document.addEventListener('keydown', onEscape, true)
}

function clearActiveCardTooltip(instance: Instance): void {
  tooltipEscapeCleanup.get(instance)?.()
  tooltipEscapeCleanup.delete(instance)
  if (activeCardTooltip === instance) activeCardTooltip = null
}

export function closeActiveFollowUpPopovers(): void {
  activeCardTooltip?.hide()
}

export function mountDraftCards(
  inputEditor: HTMLElement,
  callbacks: CardCallbacks
): { render(items: readonly SelectionItem[]): void; setDisabled(disabled: boolean): void; destroy(): void } {
  const container = document.createElement('div')
  container.className = 'gpk-follow-draft-cards'
  container.setAttribute('role', 'list')
  container.setAttribute('aria-label', t(`${I18N}.selectedText`))
  inputEditor.insertAdjacentElement('beforebegin', container)

  const cards = new Map<string, DraftCard>()
  let disabled = false

  const render = (items: readonly SelectionItem[]) => {
    const hasNewCard = items.some(item => !cards.has(item.id))
    const ids = new Set(items.map(item => item.id))
    for (const [id, card] of cards) {
      if (ids.has(id)) continue
      card.tooltip.destroy()
      card.root.remove()
      cards.delete(id)
    }

    items.forEach((item, index) => {
      const signature = `${item.selectedText}\0${effectiveComment(item)}`
      const current = cards.get(item.id)
      if (current?.signature === signature && current.root.isConnected) {
        current.item = item
        if (current.index !== index) {
          current.index = index
          current.root.dataset.selectionIndex = String(index + 1)
          current.heading.textContent = t(`${I18N}.selectionNumber`, String(index + 1))
        }
        placeCardAt(container, current.root, index)
        return
      }
      if (current) {
        current.tooltip.destroy()
        current.root.remove()
      }

      const built = buildCard(item, index, false)
      const draftCard: DraftCard = {
        item,
        signature,
        index,
        root: built.root,
        heading: built.heading,
        preview: built.preview,
        editButton: built.editButton,
        commentButton: built.commentButton!,
        removeButton: built.removeButton!,
        tooltip: tippy(built.preview, {
          content: createFullContent(item),
          trigger: 'mouseenter focus',
          placement: 'top',
          interactive: true,
          offset: [0, 18],
          interactiveBorder: 4,
          interactiveDebounce: 0,
          delay: [100, 0],
          duration: [100, 60],
          maxWidth: 'min(460px, calc(100vw - 24px))',
          appendTo: () => document.body,
          theme: 'gpk-follow',
          onShow: setActiveCardTooltip,
          onHidden: clearActiveCardTooltip,
          onDestroy: clearActiveCardTooltip
        })
      }
      applyDisabledState(draftCard, disabled)
      if (item.anchor) {
        draftCard.preview.setAttribute('role', 'button')
        draftCard.preview.setAttribute('aria-label', `${t(`${I18N}.selectedText`)} ${item.selectedText}`)
        draftCard.preview.tabIndex = 0
        const jump = () => {
          if (!disabled) callbacks.onJumpToSource(item.id)
        }
        draftCard.preview.addEventListener('click', event => {
          event.stopPropagation()
          jump()
        })
        draftCard.preview.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          jump()
        })
      }
      draftCard.commentButton.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        callbacks.onComment(item.id)
      })
      draftCard.editButton?.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        callbacks.onComment(item.id)
      })
      draftCard.removeButton.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        callbacks.onRemove(draftCard.item.id)
      })
      cards.set(item.id, draftCard)
      placeCardAt(container, draftCard.root, index)
    })
    if (hasNewCard) container.scrollLeft = container.scrollWidth
  }

  const destroy = () => {
    activeCardTooltip?.hide()
    activeCardTooltip = null
    for (const card of cards.values()) card.tooltip.destroy()
    cards.clear()
    container.remove()
  }

  const setDisabled = (value: boolean) => {
    disabled = value
    for (const card of cards.values()) applyDisabledState(card, disabled)
  }

  return { render, setDisabled, destroy }
}

function applyDisabledState(card: DraftCard, disabled: boolean): void {
  card.root.classList.toggle('gpk-follow-card-disabled', disabled)
  card.root.setAttribute('aria-disabled', String(disabled))
  card.commentButton.disabled = disabled
  if (card.editButton) card.editButton.disabled = disabled
  card.removeButton.disabled = disabled
}

function placeCardAt(container: HTMLElement, card: HTMLElement, index: number): void {
  const current = container.children.item(index)
  if (current === card) return
  container.insertBefore(card, current)
}

type BuiltCard = { root: HTMLElement; heading: HTMLElement; preview: HTMLElement; commentButton?: HTMLButtonElement; editButton?: HTMLButtonElement; removeButton?: HTMLButtonElement }

function buildCard(item: Pick<SelectionItem, 'id' | 'selectedText' | 'comment' | 'commentDraft'> | { selectedText: string; comment: string }, index: number, readonly: boolean): BuiltCard {
  const root = document.createElement('article')
  root.className = CARD_CLASS
  root.setAttribute('role', 'listitem')
  root.dataset.selectionIndex = String(index + 1)

  const heading = document.createElement('span')
  heading.className = 'gpk-follow-card-heading'
  heading.textContent = t(`${I18N}.selectionNumber`, String(index + 1))
  const preview = document.createElement('div')
  preview.className = 'gpk-follow-card-preview'
  preview.tabIndex = 0
  preview.setAttribute('aria-label', `${t(`${I18N}.selectedText`)} ${item.selectedText}`)

  const selected = document.createElement('div')
  selected.className = 'gpk-follow-card-selected'
  selected.textContent = item.selectedText
  preview.append(selected)

  const comment = 'commentDraft' in item ? effectiveComment(item) : item.comment
  root.classList.toggle('gpk-follow-card-has-comment', Boolean(comment))
  if (comment) {
    const commentLabel = document.createElement('div')
    commentLabel.className = 'gpk-follow-card-label gpk-follow-card-comment-label'
    commentLabel.textContent = t(`${I18N}.userComment`)
    const commentText = document.createElement('div')
    commentText.className = 'gpk-follow-card-comment'
    commentText.textContent = comment
    preview.append(commentLabel, commentText)
  }
  const footer = document.createElement('div')
  footer.className = 'gpk-follow-card-footer'
  root.append(preview, footer)

  if (readonly || !('id' in item)) {
    footer.append(makeIcon('comment'), heading)
    return { root, heading, preview }
  }

  const actions = document.createElement('div')
  actions.className = 'gpk-follow-card-actions'
  const commentButton = makeIconButton('comment', t(`${I18N}.commentPlaceholder`))
  commentButton.classList.add('gpk-follow-card-caption-button')
  commentButton.appendChild(heading)
  footer.appendChild(commentButton)
  let editButton: HTMLButtonElement | undefined
  if (comment) {
    editButton = makeIconButton('edit', t(`${I18N}.editComment`))
    actions.appendChild(editButton)
  }
  const removeButton = makeIconButton('remove', t(`${I18N}.removeSelection`))
  actions.appendChild(removeButton)
  root.appendChild(actions)
  return { root, heading, preview, commentButton, editButton, removeButton }
}

function createFullContent(item: { selectedText: string; comment?: string; commentDraft?: string }): HTMLElement {
  const content = document.createElement('div')
  content.className = 'gpk-follow-full-content'
  const selectedLabel = document.createElement('div')
  selectedLabel.className = 'gpk-follow-card-label'
  selectedLabel.textContent = t(`${I18N}.selectedText`)
  const selected = document.createElement('div')
  selected.className = 'gpk-follow-full-text'
  selected.textContent = item.selectedText
  content.append(selectedLabel, selected)
  const comment = item.commentDraft ?? item.comment ?? ''
  if (comment) {
    const commentLabel = document.createElement('div')
    commentLabel.className = 'gpk-follow-card-label gpk-follow-card-comment-label'
    commentLabel.textContent = t(`${I18N}.userComment`)
    const commentText = document.createElement('div')
    commentText.className = 'gpk-follow-full-text'
    commentText.textContent = comment
    content.append(commentLabel, commentText)
  }
  return content
}

function makeIconButton(icon: 'edit' | 'remove' | 'comment', label: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `gpk-follow-card-action gpk-follow-card-action-${icon}`
  button.setAttribute('aria-label', label)
  button.title = label
  button.appendChild(makeIcon(icon))
  return button
}

function makeIcon(icon: 'edit' | 'remove' | 'comment'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const paths = icon === 'edit'
    ? ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z']
    : icon === 'comment'
      ? ['M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z']
      : ['m6 6 12 12', 'M18 6 6 18']
  for (const pathData of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', pathData)
    svg.appendChild(path)
  }
  return svg
}

function trimOuterBlankLines(text: string): string {
  const lines = text.split('\n')
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) start += 1
  while (end > start && !lines[end - 1].trim()) end -= 1
  return lines.slice(start, end).join('\n')
}

export function renderHistory(
  userQuery: Element,
  legacyPrefix: string,
  callbacks: { onOutlineUpdate?: () => void; onJumpToSource?: (query: Element, selectionIndex: number) => void } = {}
): () => void {
  const existing = historyStates.get(userQuery)
  const currentQueryText = resolveQueryText(userQuery)
  const currentRaw = readRawQuery(userQuery)
  const currentParsed = currentRaw === null ? null : parseDisplayMessage(currentRaw, legacyPrefix)
  const anchorStateMatches = Boolean(currentParsed && existing && callbacks.onJumpToSource)
    && currentParsed!.selections.every((_, index) => {
      const hadJumpAction = Boolean(existing?.view.querySelector(`[data-follow-index="${index}"] [data-follow-jump]`))
      return hadJumpAction === hasQuoteAnchor(userQuery, index)
    })
  if (
    existing
    && existing.view.isConnected
    && existing.queryText === currentQueryText
    && existing.raw === currentRaw
    && (!callbacks.onJumpToSource || anchorStateMatches)
  ) {
    return () => {
      if (historyStates.get(userQuery) === existing) disposeHistoryState(userQuery, existing)
    }
  }
  if (existing) disposeHistoryState(userQuery, existing)
  const queryText = resolveQueryText(userQuery)
  const lines = readQueryLines(userQuery)
  const raw = readRawQuery(userQuery)
  if (!queryText || raw === null) return () => undefined
  const parsed = parseDisplayMessage(raw, legacyPrefix)
  if (!parsed) return () => undefined

  const view = document.createElement('div')
  view.className = HISTORY_VIEW_CLASS
  view.setAttribute('aria-label', t(`${I18N}.selectedText`))
  const list = document.createElement('div')
  list.className = 'gpk-follow-history-cards'
  list.setAttribute('role', 'list')
  const historyTooltips: Instance[] = []
  parsed.selections.forEach((item, index) => {
    const card = buildCard(item, index, true)
    card.root.setAttribute('data-follow-index', String(index))
    list.appendChild(card.root)
    card.root.classList.add('gpk-follow-card-readonly')
    const hasAnchor = hasQuoteAnchor(userQuery, index)
    if (hasAnchor && callbacks.onJumpToSource) {
      card.preview.setAttribute('data-follow-jump', 'true')
      card.preview.setAttribute('role', 'button')
      card.preview.setAttribute('aria-label', t(`${I18N}.selectedText`))
      card.preview.addEventListener('click', event => {
        event.stopPropagation()
        callbacks.onJumpToSource?.(userQuery, index)
      })
      card.preview.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        callbacks.onJumpToSource?.(userQuery, index)
      })
    }
    const instance = tippy(card.preview, {
      content: createFullContent(item),
      trigger: 'mouseenter focus',
      placement: 'top',
      interactive: true,
      offset: [0, 18],
      interactiveBorder: 4,
      interactiveDebounce: 0,
      delay: [100, 0],
      duration: [100, 60],
      maxWidth: 'min(460px, calc(100vw - 24px))',
      appendTo: () => document.body,
      theme: 'gpk-follow',
      onShow: setActiveCardTooltip,
      onHidden: clearActiveCardTooltip,
      onDestroy: clearActiveCardTooltip
    })
    historyTooltips.push(instance)
  })
  view.appendChild(list)
  const request = document.createElement('div')
  request.className = 'gpk-follow-history-request'
  const displayRequest = trimOuterBlankLines(parsed.request)
  request.textContent = displayRequest
  if (displayRequest) view.appendChild(request)

  const displays = lines.map(line => line.style.display)
  const attributeNames = ['data-gpk-follow-history', 'data-is-quote', 'data-quote-text', 'data-question-text']
  const priorAttributes = Object.fromEntries(attributeNames.map(name => [name, userQuery.getAttribute(name)]))
  lines.forEach(line => { line.style.display = 'none' })
  queryText.appendChild(view)
  const state: HistoryState = { queryText, lines, displays, raw, view, tooltip: historyTooltips, priorAttributes }
  historyStates.set(userQuery, state)
  userQuery.setAttribute('data-gpk-follow-history', 'true')
  userQuery.setAttribute('data-is-quote', 'true')
  userQuery.setAttribute('data-quote-text', parsed.selections[0]?.selectedText ?? '')
  userQuery.setAttribute('data-question-text', parsed.request)
  callbacks.onOutlineUpdate?.()

  return () => {
    if (historyStates.get(userQuery) !== state) return
    disposeHistoryState(userQuery, state)
  }
}

export function restoreHistory(userQuery: Element): void {
  const state = historyStates.get(userQuery)
  if (state) disposeHistoryState(userQuery, state)
}

function disposeHistoryState(userQuery: Element, state: HistoryState): void {
  state.tooltip.forEach(instance => instance.destroy())
  state.lines.forEach((line, index) => { line.style.display = state.displays[index] ?? '' })
  state.view.remove()
  for (const [name, value] of Object.entries(state.priorAttributes)) {
    if (value === null) userQuery.removeAttribute(name)
    else userQuery.setAttribute(name, value)
  }
  historyStates.delete(userQuery)
}

export function getOutlineSummary(userQuery: Element, legacyPrefix: string): { questionText: string; quoteText: string; selectionCount: number } {
  const queryText = resolveQueryText(userQuery)
  if (!queryText) return { questionText: '', quoteText: '', selectionCount: 0 }
  const raw = readRawQuery(userQuery) ?? ''
  const parsed = parseDisplayMessage(raw, legacyPrefix)
  if (!parsed) return { questionText: raw, quoteText: '', selectionCount: 0 }
  const quoteText = parsed.selections[0]?.selectedText ?? ''
  const commentText = parsed.selections.map(item => item.comment).find(comment => comment.trim()) ?? ''
  return {
    questionText: parsed.request || commentText || quoteText,
    quoteText,
    selectionCount: parsed.selections.length
  }
}
