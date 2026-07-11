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

  it('strikes, fades, then scrolls the fixed queue before advancing progress', async () => {
    vi.useFakeTimers()
    const overlay = createDeleteProgressOverlay(['First chat', 'Second chat', 'Third chat'])
    const root = document.querySelector<HTMLElement>('[data-gpk-bulk-delete-progress-overlay]')!
    const track = root.querySelector<HTMLElement>('[data-gpk-bulk-delete-progress-track]')!
    const first = track.firstElementChild as HTMLElement

    const advance = overlay.advance()
    expect(first.classList.contains('is-striking')).toBe(true)

    await vi.advanceTimersByTimeAsync(520)
    expect(first.classList.contains('is-leaving')).toBe(true)

    await vi.advanceTimersByTimeAsync(320)
    expect(track.classList.contains('is-scrolling')).toBe(true)

    await vi.advanceTimersByTimeAsync(460)
    await advance

    expect(track.children).toHaveLength(2)
    expect(track.firstElementChild?.textContent).toBe('Second chat')
    expect(root.querySelector('[data-gpk-bulk-delete-progress-count]')?.textContent).toBe('Completed 1 / 3')
    overlay.destroy()
  })

  it('removes the overlay after the final deletion animation', async () => {
    vi.useFakeTimers()
    const overlay = createDeleteProgressOverlay(['Only chat'])

    const advance = overlay.advance()
    await vi.advanceTimersByTimeAsync(520 + 320 + 260 + 260)
    await advance

    expect(document.querySelector('[data-gpk-bulk-delete-progress-overlay]')).toBeNull()
    overlay.destroy()
  })
})
