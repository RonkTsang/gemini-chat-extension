import { t } from '@/utils/i18n'
import { STICKY_ACTION_BAR_ATTR } from './dom'

interface StickyActionBarHandlers {
  onDeselectAll(): void
  onDelete(): void
}

export interface StickyActionBarState {
  source: HTMLElement | null
  scroller: HTMLElement | null
  selectedCount: number
  disabled: boolean
}

export interface StickyActionBar {
  update(state: StickyActionBarState): void
  destroy(): void
}

export function createStickyActionBar(handlers: StickyActionBarHandlers): StickyActionBar {
  const root = document.createElement('div')
  root.setAttribute(STICKY_ACTION_BAR_ATTR, 'true')
  root.setAttribute('aria-hidden', 'true')

  const bar = document.createElement('div')
  bar.dataset.gpkBulkDeleteStickyActionBarContent = 'true'

  const deselectAll = document.createElement('button')
  deselectAll.type = 'button'
  deselectAll.dataset.action = 'deselect-all'
  deselectAll.textContent = t('bulkDelete.deselectAll')
  deselectAll.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    handlers.onDeselectAll()
  })

  const submit = document.createElement('button')
  submit.type = 'button'
  submit.dataset.action = 'delete'
  submit.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    handlers.onDelete()
  })

  bar.append(deselectAll, submit)
  root.append(bar)
  document.body.append(root)

  let destroyed = false
  let source: HTMLElement | null = null
  let scroller: HTMLElement | null = null
  let selectedCount = 0
  let disabled = false
  let intersectionObserver: IntersectionObserver | null = null
  let resizeObserver: ResizeObserver | null = null
  let scrollFrame: number | null = null

  const isEligible = () => selectedCount > 0 && !disabled && source !== null && scroller !== null

  const setVisible = (visible: boolean) => {
    const nextVisible = visible && isEligible()
    root.classList.toggle('is-visible', nextVisible)
    root.setAttribute('aria-hidden', String(!nextVisible))
  }

  const isSourceAboveScroller = () => {
    if (!source || !scroller) {
      return false
    }
    return source.getBoundingClientRect().bottom <= scroller.getBoundingClientRect().top
  }

  const syncPosition = () => {
    if (!scroller) {
      setVisible(false)
      return
    }
    const rect = scroller.getBoundingClientRect()
    root.style.left = `${rect.left}px`
    root.style.top = `${rect.top}px`
    root.style.width = `${rect.width}px`
    setVisible(isSourceAboveScroller())
  }

  const schedulePositionSync = () => {
    if (scrollFrame !== null) {
      return
    }
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null
      syncPosition()
    })
  }

  const disconnectObservers = () => {
    intersectionObserver?.disconnect()
    intersectionObserver = null
    resizeObserver?.disconnect()
    resizeObserver = null
    scroller?.removeEventListener('scroll', schedulePositionSync)
  }

  const observe = () => {
    disconnectObservers()
    if (!source || !scroller) {
      return
    }

    if (typeof IntersectionObserver === 'function') {
      intersectionObserver = new IntersectionObserver((entries) => {
        const entry = entries.find(candidate => candidate.target === source)
        if (!entry) {
          return
        }
        setVisible(!entry.isIntersecting && isSourceAboveScroller())
      }, { root: scroller, threshold: 0 })
      intersectionObserver.observe(source)
    } else {
      scroller.addEventListener('scroll', schedulePositionSync, { passive: true })
    }

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(syncPosition)
      resizeObserver.observe(scroller)
    }
    window.addEventListener('resize', schedulePositionSync)
  }

  const stopObserving = () => {
    disconnectObservers()
    window.removeEventListener('resize', schedulePositionSync)
  }

  return {
    update(nextState): void {
      if (destroyed) {
        return
      }

      selectedCount = nextState.selectedCount
      disabled = nextState.disabled
      const fontFamily = nextState.source ? window.getComputedStyle(nextState.source).fontFamily : ''
      bar.style.fontFamily = fontFamily
      submit.textContent = selectedCount > 0
        ? t('bulkDelete.deleteSelected', String(selectedCount))
        : t('bulkDelete.deleteIdle')
      submit.disabled = disabled || selectedCount === 0
      deselectAll.disabled = disabled || selectedCount === 0

      if (source !== nextState.source || scroller !== nextState.scroller) {
        stopObserving()
        source = nextState.source
        scroller = nextState.scroller
        observe()
      }
      syncPosition()
    },
    destroy(): void {
      if (destroyed) {
        return
      }
      destroyed = true
      stopObserving()
      if (scrollFrame !== null) {
        window.cancelAnimationFrame(scrollFrame)
        scrollFrame = null
      }
      root.remove()
    },
  }
}
