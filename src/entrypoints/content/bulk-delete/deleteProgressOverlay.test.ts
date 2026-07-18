import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDeleteProgressOverlay } from './deleteProgressOverlay'

vi.mock('@/utils/i18n', () => ({
  t: (id: string, substitutions?: string[]) => id === 'bulkDelete.deleteProgress'
    ? `Completed ${substitutions?.[0]} / ${substitutions?.[1]}`
    : id === 'bulkDelete.deleteProgressTitle'
      ? 'Deleting chats'
    : id === 'bulkDelete.deleteProgressEscapeHint'
        ? 'Press Esc to stop and exit'
        : id === 'bulkDelete.deleteProgressComplete'
          ? 'Deletion complete'
        : id,
}))

describe('delete progress overlay', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('holds the strike for 200ms, then scrolls the fixed queue for 200ms', async () => {
    vi.useFakeTimers()
    const overlay = createDeleteProgressOverlay(['First chat', 'Second chat', 'Third chat'])
    const root = document.querySelector<HTMLElement>('[data-gpk-bulk-delete-progress-overlay]')!
    const track = root.querySelector<HTMLElement>('[data-gpk-bulk-delete-progress-track]')!

    const first = track.firstElementChild as HTMLElement
    overlay.advance()
    expect(first.classList.contains('is-striking')).toBe(true)

    await vi.advanceTimersByTimeAsync(200)
    expect(track.classList.contains('is-scrolling')).toBe(true)

    await vi.advanceTimersByTimeAsync(200)

    expect(track.children).toHaveLength(2)
    expect(track.firstElementChild?.textContent).toBe('Second chat')
    expect(root.querySelector('[data-gpk-bulk-delete-progress-count]')?.textContent).toBe('Completed 1 / 3')
    overlay.destroy()
  })

  it('separates the overall progress from the chat queue and explains Esc', () => {
    const overlay = createDeleteProgressOverlay(['First chat', 'Second chat'])
    const root = document.querySelector<HTMLElement>('[data-gpk-bulk-delete-progress-overlay]')!
    const progressBar = root.querySelector<HTMLElement>('[data-gpk-bulk-delete-progress-bar]')!

    expect(root.getAttribute('role')).toBe('dialog')
    expect(root.querySelector('[data-gpk-bulk-delete-progress-heading]')?.textContent).toBe('Deleting chats')
    expect(root.querySelector('[data-gpk-bulk-delete-progress-escape-hint]')?.textContent).toBe('Press Esc to stop and exit')
    expect(root.querySelector('[data-gpk-bulk-delete-progress-track]')?.tagName).toBe('UL')
    expect(root.querySelector('[data-gpk-bulk-delete-progress-viewport]')?.nextElementSibling).toBe(root.querySelector('[data-gpk-bulk-delete-progress-escape-hint]'))
    expect(progressBar.getAttribute('aria-valuenow')).toBe('0')

    overlay.advance()

    expect(progressBar.getAttribute('aria-valuenow')).toBe('1')
    expect(root.querySelector<HTMLElement>('[data-gpk-bulk-delete-progress-bar-value]')?.style.transform).toBe('scaleX(0.5)')
    overlay.destroy()
  })

  it('morphs into a success mark after every queued deletion succeeds', async () => {
    vi.useFakeTimers()
    const overlay = createDeleteProgressOverlay(['Only chat'])
    const root = document.querySelector<HTMLElement>('[data-gpk-bulk-delete-progress-overlay]')!

    overlay.advance()
    const finish = overlay.finish()

    await vi.advanceTimersByTimeAsync(200)
    expect(root.querySelector('[data-gpk-bulk-delete-progress-stage]')?.classList.contains('is-transitioning')).toBe(true)

    await vi.advanceTimersByTimeAsync(160)
    expect(root.querySelector('[data-gpk-bulk-delete-progress-stage]')?.classList.contains('is-complete')).toBe(true)
    expect(root.querySelector('[data-gpk-bulk-delete-progress-success]')?.getAttribute('aria-label')).toBe('Deletion complete')

    await vi.advanceTimersByTimeAsync(1040)
    expect(root.classList.contains('is-leaving')).toBe(true)

    await vi.advanceTimersByTimeAsync(180)
    await finish

    expect(document.querySelector('[data-gpk-bulk-delete-progress-overlay]')).toBeNull()
    overlay.destroy()
  })

  it('allows later deletions to strike while an earlier item is waiting to scroll', async () => {
    vi.useFakeTimers()
    const overlay = createDeleteProgressOverlay(['First chat', 'Second chat'])
    const track = document.querySelector<HTMLElement>('[data-gpk-bulk-delete-progress-track]')!

    overlay.advance()
    overlay.advance()

    expect(track.children[0].classList.contains('is-striking')).toBe(true)
    expect(track.children[1].classList.contains('is-striking')).toBe(true)

    const finish = overlay.finish()
    await vi.advanceTimersByTimeAsync(1780)
    await finish

    expect(document.querySelector('[data-gpk-bulk-delete-progress-overlay]')).toBeNull()
  })

  it('does not show the success mark when a queue item is discarded', async () => {
    vi.useFakeTimers()
    const overlay = createDeleteProgressOverlay(['First chat', 'Second chat'])
    const root = document.querySelector<HTMLElement>('[data-gpk-bulk-delete-progress-overlay]')!
    const stage = root.querySelector<HTMLElement>('[data-gpk-bulk-delete-progress-stage]')!

    overlay.advance()
    overlay.discard()
    const finish = overlay.finish()

    await vi.advanceTimersByTimeAsync(580)
    await finish

    expect(stage.classList.contains('is-complete')).toBe(false)
    expect(document.querySelector('[data-gpk-bulk-delete-progress-overlay]')).toBeNull()
  })
})
