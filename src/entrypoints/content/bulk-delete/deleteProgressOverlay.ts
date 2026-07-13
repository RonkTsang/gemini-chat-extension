import { t } from '@/utils/i18n'

const OVERLAY_ATTR = 'data-gpk-bulk-delete-progress-overlay'
const SCROLL_DURATION = 200

export interface DeleteProgressOverlay {
  advance(): void
  discard(): void
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
  const queueRows = Array.from(track.children) as HTMLElement[]
  viewport.append(track)

  const progress = document.createElement('div')
  progress.dataset.gpkBulkDeleteProgressCount = 'true'

  overlay.append(viewport, progress)
  document.body.appendChild(overlay)

  let completed = 0
  let destroyed = false
  let nextRowIndex = 0
  let removing = false
  let activeAnimations = 0
  let finishRequested = false
  const pendingDelays = new Set<() => void>()
  const pendingRemovals = new Set<HTMLElement>()
  const finishResolvers = new Set<() => void>()

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

  const removeRow = async (row: HTMLElement): Promise<void> => {
    const next = row.nextElementSibling
    if (next) {
      const rowGap = Number.parseFloat(window.getComputedStyle(track).rowGap) || 0
      const scrollDistance = row.getBoundingClientRect().height + rowGap
      track.style.setProperty('--gpk-bulk-delete-scroll-distance', `${scrollDistance}px`)
      track.classList.add('is-scrolling')
      await delay(SCROLL_DURATION)
      if (destroyed) {
        return
      }
    }

    row.remove()
    track.classList.remove('is-scrolling')
    track.style.removeProperty('--gpk-bulk-delete-scroll-distance')
  }

  const settleIfFinished = () => {
    if (!finishRequested || destroyed || activeAnimations > 0 || removing || pendingRemovals.size > 0) {
      return
    }
    destroy()
  }

  const removePendingRows = async () => {
    if (removing || destroyed) {
      return
    }

    removing = true
    while (!destroyed) {
      const row = track.firstElementChild as HTMLElement | null
      if (!row || !pendingRemovals.has(row)) {
        break
      }
      pendingRemovals.delete(row)
      await removeRow(row)
      activeAnimations--
    }
    removing = false
    settleIfFinished()
  }

  const enqueueRemoval = (row: HTMLElement) => {
    pendingRemovals.add(row)
    void removePendingRows()
  }

  const claimNextRow = (): HTMLElement | null => {
    return queueRows[nextRowIndex++] ?? null
  }

  const destroy = () => {
    if (destroyed) {
      return
    }
    destroyed = true
    pendingDelays.forEach(finish => finish())
    pendingDelays.clear()
    finishResolvers.forEach(resolve => resolve())
    finishResolvers.clear()
    overlay.remove()
  }

  const finish = (): Promise<void> => new Promise((resolve) => {
    if (destroyed) {
      resolve()
      return
    }
    finishRequested = true
    finishResolvers.add(resolve)
    settleIfFinished()
  })

  updateProgress()

  return {
    advance(): void {
      const row = claimNextRow()
      if (!row || destroyed) {
        return
      }

      completed++
      updateProgress()
      activeAnimations++
      row.classList.add('is-striking')

      void delay(200).then(() => {
        if (!destroyed) {
          enqueueRemoval(row)
        }
      })
    },
    discard(): void {
      const row = claimNextRow()
      if (!row || destroyed) {
        return
      }
      activeAnimations++
      enqueueRemoval(row)
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
