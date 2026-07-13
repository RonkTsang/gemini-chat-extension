import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDeleteProgressOverlay } from './deleteProgressOverlay'

vi.mock('@/utils/i18n', () => ({
  t: (id: string, substitutions?: string[]) => id === 'bulkDelete.deleteProgress'
    ? `Completed ${substitutions?.[0]} / ${substitutions?.[1]}`
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

  it('waits for the final strike before removing the overlay', async () => {
    vi.useFakeTimers()
    const overlay = createDeleteProgressOverlay(['Only chat'])

    overlay.advance()
    const finish = overlay.finish()
    expect(document.querySelector('[data-gpk-bulk-delete-progress-overlay]')).not.toBeNull()

    await vi.advanceTimersByTimeAsync(200)
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
    await vi.advanceTimersByTimeAsync(400)
    await finish

    expect(document.querySelector('[data-gpk-bulk-delete-progress-overlay]')).toBeNull()
  })
})
