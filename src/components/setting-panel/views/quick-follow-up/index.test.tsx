import { ChakraProvider } from '@chakra-ui/react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { system } from '@/components/ui/system'
import { useQuickFollowStore } from '@/stores/quickFollowStore'
import { toaster } from '@/components/ui/toaster'
import { QuickFollowSettingsView } from './index'

const setSelectionDisplayMode = vi.hoisted(() => vi.fn())
vi.mock('@/data/repositories', () => ({ quickFollowRepository: { setSelectionDisplayMode } }))
vi.mock('wxt/browser', () => ({ browser: {} }))
vi.mock('@/components/ui/toaster', () => ({ toaster: { create: vi.fn() } }))
vi.mock('@/utils/i18n', () => ({ t: (key: string) => key }))
vi.mock('./PreviewSection', () => ({ PreviewSection: () => null }))
vi.mock('./PromptListItem', () => ({ PromptListItem: () => null }))
vi.mock('./PromptEditModal', () => ({ PromptEditModal: () => null }))

let root: Root
let container: HTMLDivElement
const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let previousActEnvironment: boolean | undefined

function option(mode: 'cards' | 'compact' | 'auto'): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(`input[type="radio"][value="${mode}"]`)!
}

async function mount() {
  await act(async () => root.render(<ChakraProvider value={system}><QuickFollowSettingsView /></ChakraProvider>))
}

async function clickOption(mode: 'cards' | 'compact' | 'auto') {
  await act(async () => option(mode).closest('label')!.click())
}

beforeEach(() => {
  previousActEnvironment = reactGlobal.IS_REACT_ACT_ENVIRONMENT
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  useQuickFollowStore.setState({
    prompts: [], isHydrated: true, isHydrating: false,
    settings: { enabled: true, orderedIds: [], selectionDisplayMode: 'cards' },
  })
  setSelectionDisplayMode.mockReset().mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
})

describe('selection display mode settings with Chakra controls', () => {
  it('keeps the segment item identity and checked state intact inside each tooltip', async () => {
    await mount()
    for (const mode of ['cards', 'compact', 'auto'] as const) {
      const label = option(mode).closest('label')!
      expect(label.dataset.scope).toBe('segment-group')
      expect(label.dataset.part).toBe('item')
      expect(label.id).toContain(`radio:${mode}`)
      expect(label.htmlFor).toBe(option(mode).id)
      expect(label.parentElement?.dataset.scope).toBe('tooltip')
      expect(label.dataset.state).toBe(mode === 'cards' ? 'checked' : 'unchecked')
    }
  })

  it('switches display modes with label clicks and updates Chakra selected styling', async () => {
    await mount()
    await clickOption('compact')
    expect(setSelectionDisplayMode).toHaveBeenLastCalledWith('compact')
    expect(option('compact').checked).toBe(true)
    expect(option('compact').closest('label')?.dataset.state).toBe('checked')
    expect(option('cards').closest('label')?.dataset.state).toBe('unchecked')
    await clickOption('auto')
    expect(setSelectionDisplayMode).toHaveBeenLastCalledWith('auto')
    expect(option('auto').checked).toBe(true)
    await clickOption('cards')
    expect(setSelectionDisplayMode).toHaveBeenLastCalledWith('cards')
    expect(option('cards').closest('label')?.dataset.state).toBe('checked')
  })

  it('disables both options while saving and shows the new selection only after success', async () => {
    let finish: () => void = () => undefined
    setSelectionDisplayMode.mockReturnValue(new Promise<void>(resolve => {
      finish = resolve
    }))
    await mount()
    await clickOption('compact')
    expect(option('cards').disabled).toBe(true)
    expect(option('compact').disabled).toBe(true)
    expect(option('cards').closest('label')?.dataset.state).toBe('checked')
    await act(async () => finish())
    expect(option('compact').disabled).toBe(false)
    expect(option('compact').closest('label')?.dataset.state).toBe('checked')
  })

  it('keeps the previous selected appearance and reports a failed save', async () => {
    setSelectionDisplayMode.mockRejectedValue(new Error('write failed'))
    await mount()
    await clickOption('compact')
    expect(option('cards').closest('label')?.dataset.state).toBe('checked')
    expect(option('compact').closest('label')?.dataset.state).toBe('unchecked')
    expect(option('compact').disabled).toBe(false)
    expect(toaster.create).toHaveBeenCalledWith({ type: 'error', title: 'write failed' })
  })
})
