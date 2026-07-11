import { t } from '@/utils/i18n'

const OVERLAY_ATTR = 'data-gpk-bulk-delete-progress-overlay'
const STRIKE_DURATION = 320
const FADE_DURATION = 220
const SCROLL_DURATION = 320
const COMPLETE_DURATION = 180

export interface DeleteProgressOverlay {
  advance(): Promise<void>
  discard(): Promise<void>
  finish(): Promise<void>
  destroy(): void
}

export function createDeleteProgressOverlay(titles: string[]): DeleteProgressOverlay {
  const overlay = document.createElement('section')
  overlay.setAttribute(OVERLAY_ATTR, 'true')
  overlay.setAttribute('aria-live', 'polite')

  const viewport = document.createElement('div')
  viewport.dataset.gpkBulkDeleteProgressViewport = 'true'

  const track = document.createElement('div')
  track.dataset.gpkBulkDeleteProgressTrack = 'true'
  titles.forEach(title => track.append(createQueueRow(title)))
  viewport.append(track)

  const progress = document.createElement('div')
  progress.dataset.gpkBulkDeleteProgressCount = 'true'

  overlay.append(viewport, progress)
  document.body.appendChild(overlay)

  let completed = 0
  let destroyed = false
  const pendingDelays = new Set<() => void>()

  const updateProgress = () => {
    progress.textContent = t('bulkDelete.deleteProgress', [String(completed), String(titles.length)])
  }

  const delay = (duration: number): Promise<void> => new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout)
      pendingDelays.delete(finish)
      resolve()
    }
    const timeout = window.setTimeout(finish, duration)
    pendingDelays.add(finish)
  })

  const removeCurrent = async (animate: boolean): Promise<void> => {
    const current = track.firstElementChild as HTMLElement | null
    if (!current || destroyed) {
      return
    }

    if (animate) {
      current.classList.add('is-striking')
      await delay(STRIKE_DURATION)
      if (destroyed) {
        return
      }

      current.classList.add('is-leaving')
      await delay(FADE_DURATION)
      if (destroyed) {
        return
      }
    }

    const next = current.nextElementSibling
    if (next) {
      const rowGap = Number.parseFloat(window.getComputedStyle(track).rowGap) || 0
      const scrollDistance = current.getBoundingClientRect().height + rowGap
      track.style.setProperty('--gpk-bulk-delete-scroll-distance', `${scrollDistance}px`)
      track.classList.add('is-scrolling')
      await delay(SCROLL_DURATION)
      if (destroyed) {
        return
      }
    }

    current.remove()
    track.classList.remove('is-scrolling')
    track.style.removeProperty('--gpk-bulk-delete-scroll-distance')
  }

  const destroy = () => {
    if (destroyed) {
      return
    }
    destroyed = true
    pendingDelays.forEach(finish => finish())
    pendingDelays.clear()
    overlay.remove()
  }

  const finish = async () => {
    if (destroyed) {
      return
    }
    overlay.classList.add('is-complete')
    await delay(COMPLETE_DURATION)
    destroy()
  }

  updateProgress()

  return {
    async advance(): Promise<void> {
      await removeCurrent(true)
      if (destroyed) {
        return
      }

      completed++
      updateProgress()

      if (completed === titles.length) {
        await delay(COMPLETE_DURATION)
        await finish()
      }
    },
    async discard(): Promise<void> {
      await removeCurrent(false)
    },
    finish,
    destroy,
  }
}

function createQueueRow(title: string): HTMLElement {
  const row = document.createElement('div')
  row.dataset.gpkBulkDeleteProgressRow = 'true'

  const label = document.createElement('span')
  label.dataset.gpkBulkDeleteProgressTitle = 'true'
  label.textContent = title

  row.append(label)
  return row
}
