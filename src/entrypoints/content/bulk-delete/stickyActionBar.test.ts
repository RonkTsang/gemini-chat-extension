import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStickyActionBar } from './stickyActionBar'

vi.mock('@/utils/i18n', () => ({
  t: (id: string, substitutions?: string | string[]) => {
    const count = Array.isArray(substitutions) ? substitutions[0] : substitutions
    if (id === 'bulkDelete.deleteSelected') {
      return `Delete (${count})`
    }
    if (id === 'bulkDelete.deleteIdle') {
      return 'Delete (0)'
    }
    if (id === 'bulkDelete.deselectAll') {
      return 'Deselect all'
    }
    return id
  },
}))

function setRect(element: HTMLElement, top: number, bottom: number, left = 20, width = 280): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: left,
    y: top,
    top,
    right: left + width,
    bottom,
    left,
    width,
    height: bottom - top,
    toJSON: () => ({}),
  })
}

describe('sticky bulk delete action bar', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('shows compact actions only after the source menu scrolls above the history scroller', () => {
    const onDeselectAll = vi.fn()
    const onDelete = vi.fn()
    const scroller = document.createElement('div')
    const source = document.createElement('div')
    source.style.fontFamily = 'Georgia, serif'
    document.body.append(scroller, source)
    setRect(scroller, 100, 600)
    setRect(source, 120, 180)

    const actionBar = createStickyActionBar({ onDeselectAll, onDelete })
    actionBar.update({
      source,
      scroller,
      selectedCount: 3,
      disabled: false,
    })

    const root = document.querySelector<HTMLElement>('[data-gpk-bulk-delete-sticky-action-bar]')!
    expect(root.classList.contains('is-visible')).toBe(false)

    setRect(source, 20, 80)
    actionBar.update({
      source,
      scroller,
      selectedCount: 3,
      disabled: false,
    })

    expect(root.classList.contains('is-visible')).toBe(true)
    expect(root.style.top).toBe('100px')
    expect(root.style.left).toBe('20px')
    expect((root.firstElementChild as HTMLElement).style.fontFamily).toBe(window.getComputedStyle(source).fontFamily)
    expect(root.querySelector<HTMLButtonElement>('button[data-action="delete"]')?.textContent).toBe('Delete (3)')

    root.querySelector<HTMLButtonElement>('button[data-action="deselect-all"]')?.click()
    root.querySelector<HTMLButtonElement>('button[data-action="delete"]')?.click()
    expect(onDeselectAll).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()

    actionBar.destroy()
    expect(document.querySelector('[data-gpk-bulk-delete-sticky-action-bar]')).toBeNull()
  })
})
