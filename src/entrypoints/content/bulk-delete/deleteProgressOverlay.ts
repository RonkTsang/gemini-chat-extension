import { t } from '@/utils/i18n'

const OVERLAY_ATTR = 'data-gpk-bulk-delete-progress-overlay'
const SCROLL_DURATION = 200
const SUCCESS_CHECK_DURATION = 1040
const FADE_OUT_DURATION = 180

export interface DeleteProgressOverlay {
  advance(): void
  discard(): void
  finish(): Promise<void>
  destroy(): void
}

export function createDeleteProgressOverlay(titles: string[]): DeleteProgressOverlay {
  const overlay = document.createElement('section')
  overlay.setAttribute(OVERLAY_ATTR, 'true')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')

  const panel = document.createElement('div')
  panel.dataset.gpkBulkDeleteProgressPanel = 'true'

  const stage = document.createElement('div')
  stage.dataset.gpkBulkDeleteProgressStage = 'true'

  const processing = document.createElement('div')
  processing.dataset.gpkBulkDeleteProgressProcessing = 'true'

  const header = document.createElement('header')
  header.dataset.gpkBulkDeleteProgressHeader = 'true'

  const title = document.createElement('h2')
  title.dataset.gpkBulkDeleteProgressHeading = 'true'
  title.textContent = t('bulkDelete.deleteProgressTitle')

  const progress = document.createElement('div')
  progress.dataset.gpkBulkDeleteProgressCount = 'true'
  progress.setAttribute('aria-live', 'polite')

  const progressBar = document.createElement('div')
  progressBar.dataset.gpkBulkDeleteProgressBar = 'true'
  progressBar.setAttribute('role', 'progressbar')
  progressBar.setAttribute('aria-valuemin', '0')
  progressBar.setAttribute('aria-valuemax', String(titles.length))

  const progressBarValue = document.createElement('div')
  progressBarValue.dataset.gpkBulkDeleteProgressBarValue = 'true'
  progressBar.append(progressBarValue)

  const escapeHint = document.createElement('p')
  escapeHint.dataset.gpkBulkDeleteProgressEscapeHint = 'true'
  escapeHint.textContent = t('bulkDelete.deleteProgressEscapeHint')

  header.append(title, progress, progressBar)

  const viewport = document.createElement('div')
  viewport.dataset.gpkBulkDeleteProgressViewport = 'true'
  viewport.setAttribute('aria-label', t('bulkDelete.deleteProgressTitle'))

  const track = document.createElement('ul')
  track.dataset.gpkBulkDeleteProgressTrack = 'true'
  titles.forEach(title => track.append(createQueueRow(title)))
  const queueRows = Array.from(track.children) as HTMLElement[]
  viewport.append(track)

  processing.append(header, viewport, escapeHint)
  stage.append(processing, createSuccessState())
  panel.append(stage)
  overlay.append(panel)
  document.body.appendChild(overlay)

  let completed = 0
  let destroyed = false
  let nextRowIndex = 0
  let removing = false
  let activeAnimations = 0
  let finishRequested = false
  let successStarted = false
  let leaving = false
  const pendingDelays = new Set<() => void>()
  const pendingRemovals = new Set<HTMLElement>()
  const finishResolvers = new Set<() => void>()

  const updateProgress = () => {
    progress.textContent = t('bulkDelete.deleteProgress', [String(completed), String(titles.length)])
    progressBar.setAttribute('aria-valuenow', String(completed))
    progressBarValue.style.transform = `scaleX(${completed / titles.length})`
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

  const fadeOutAndDestroy = async () => {
    if (leaving || destroyed) {
      return
    }

    leaving = true
    overlay.classList.add('is-leaving')
    await delay(FADE_OUT_DURATION)
    if (!destroyed) {
      destroy()
    }
  }

  const showSuccess = async () => {
    if (successStarted || destroyed) {
      return
    }

    successStarted = true
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    stage.classList.add('is-transitioning')

    if (reduceMotion) {
      stage.classList.add('is-complete')
      await delay(180)
    } else {
      await delay(160)
      if (destroyed) {
        return
      }
      stage.classList.add('is-complete')
      await delay(SUCCESS_CHECK_DURATION)
    }

    await fadeOutAndDestroy()
  }

  const settleIfFinished = () => {
    if (!finishRequested || destroyed || activeAnimations > 0 || removing || pendingRemovals.size > 0) {
      return
    }

    if (completed === titles.length) {
      void showSuccess()
      return
    }

    void fadeOutAndDestroy()
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
  const row = document.createElement('li')
  row.dataset.gpkBulkDeleteProgressRow = 'true'

  const label = document.createElement('span')
  label.dataset.gpkBulkDeleteProgressTitle = 'true'
  label.textContent = title

  row.append(label)
  return row
}

function createSuccessState(): HTMLElement {
  const success = document.createElement('div')
  success.dataset.gpkBulkDeleteProgressSuccess = 'true'
  success.setAttribute('role', 'status')
  success.setAttribute('aria-label', t('bulkDelete.deleteProgressComplete'))

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.dataset.gpkBulkDeleteProgressSuccessMark = 'true'
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('viewBox', '0 0 133 133')

  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  group.dataset.gpkBulkDeleteProgressSuccessGroup = 'true'

  const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  fill.dataset.gpkBulkDeleteProgressSuccessFill = 'true'
  fill.setAttribute('cx', '66.5')
  fill.setAttribute('cy', '66.5')
  fill.setAttribute('r', '54.5')

  const outline = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  outline.dataset.gpkBulkDeleteProgressSuccessOutline = 'true'
  outline.setAttribute('cx', '66.5')
  outline.setAttribute('cy', '66.5')
  outline.setAttribute('r', '54.5')

  const check = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
  check.dataset.gpkBulkDeleteProgressSuccessCheck = 'true'
  check.setAttribute('points', '41 70 56 85 92 49')

  group.append(fill, outline, check)
  svg.append(group)
  success.append(svg)
  return success
}
