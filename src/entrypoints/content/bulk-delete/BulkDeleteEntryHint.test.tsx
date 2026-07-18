import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markFeatureHintSeen, shouldShowFeatureHint } from '@/components/feature-hint/storage'
import { BulkDeleteEntryHint } from './BulkDeleteEntryHint'

vi.mock('@/components/feature-hint/storage', () => ({
  markFeatureHintSeen: vi.fn(),
  shouldShowFeatureHint: vi.fn(),
}))

vi.mock('@/utils/i18n', () => ({
  t: (id: string) => ({
    'bulkDelete.entryLabel': 'Bulk delete',
    'bulkDelete.entryHint.title': 'Bulk Delete',
    'bulkDelete.entryHint.description': 'Select several chats, then clear unwanted conversations in one go.',
    'bulkDelete.entryHint.dismiss': 'Dismiss',
  }[id] ?? id),
}))

let root: Root
let container: HTMLDivElement

async function renderHint(onToggle = vi.fn()) {
  await act(async () => {
    root.render(<BulkDeleteEntryHint active={false} onToggle={onToggle} />)
    await Promise.resolve()
  })
  return onToggle
}

describe('BulkDeleteEntryHint', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean
    }).IS_REACT_ACT_ENVIRONMENT = true
    vi.mocked(shouldShowFeatureHint).mockResolvedValue(true)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.querySelector('[data-gpk-bulk-delete-entry-hint]')?.remove()
    vi.clearAllMocks()
  })

  it('introduces Bulk Delete with its value proposition on first use', async () => {
    await renderHint()

    const hint = document.querySelector<HTMLElement>('[data-gpk-bulk-delete-entry-hint]')
    expect(hint?.textContent).toContain('Bulk Delete')
    expect(hint?.textContent).toContain('clear unwanted conversations')
    expect(hint?.parentElement).toBe(container.querySelector('.gpk-bulk-delete-entry-anchor'))
    expect(shouldShowFeatureHint).toHaveBeenCalledWith('bulk-delete-entry', '1')
  })

  it('marks the hint as seen when the entry is used', async () => {
    const onToggle = await renderHint()
    const entry = container.querySelector<HTMLButtonElement>('.gpk-bulk-delete-entry-button')

    await act(async () => {
      entry?.click()
      await Promise.resolve()
    })

    expect(onToggle).toHaveBeenCalledOnce()
    expect(markFeatureHintSeen).toHaveBeenCalledWith('bulk-delete-entry', '1')
    expect(document.querySelector('[data-gpk-bulk-delete-entry-hint]')).toBeNull()
  })

  it('marks the hint as seen when it is dismissed', async () => {
    await renderHint()
    const closeButton = document.querySelector<HTMLButtonElement>('[data-gpk-bulk-delete-entry-hint-close]')

    await act(async () => {
      closeButton?.click()
      await Promise.resolve()
    })

    expect(markFeatureHintSeen).toHaveBeenCalledWith('bulk-delete-entry', '1')
    expect(document.querySelector('[data-gpk-bulk-delete-entry-hint]')).toBeNull()
  })

  it('marks the hint as seen when its content is clicked', async () => {
    await renderHint()
    const hintContent = document.querySelector<HTMLElement>('[data-gpk-bulk-delete-entry-hint-copy]')
    const bodyClick = vi.fn()
    document.body.addEventListener('click', bodyClick)

    await act(async () => {
      hintContent?.click()
      await Promise.resolve()
    })

    document.body.removeEventListener('click', bodyClick)
    expect(markFeatureHintSeen).toHaveBeenCalledWith('bulk-delete-entry', '1')
    expect(bodyClick).not.toHaveBeenCalled()
    expect(document.querySelector('[data-gpk-bulk-delete-entry-hint]')).toBeNull()
  })
})
