import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingViewComponentProps } from '../../types'

const runtime = vi.hoisted(() => ({
  createSnapshot: vi.fn(),
  updateSettings: vi.fn(),
  measure: vi.fn(),
  listSnapshots: vi.fn(),
  snapshot: {
    identity: { status: 'available', identity: { accountScopeId: 'account-scope-0001', source: 'observed', email: 'user@example.com' } },
    projection: { settings: { enabled: true, hideOrganizedChats: false } },
    syncState: {
      state: 'needs-attention', warning: 'quota-exceeded', currentUsageBytes: 123,
      usageBudgetBytes: 1000, currentTotalBytes: 223, quotaBytes: 2000,
      projectedUsageBytes: 1200, usagePercent: 12.3, showCapacityNotice: false,
    },
  },
}))

vi.mock('@/entrypoints/content/folders/runtime', () => ({ folderRuntime: {
  subscribe: () => () => undefined,
  getSnapshot: () => runtime.snapshot,
  createSnapshot: runtime.createSnapshot,
  updateSettings: runtime.updateSettings,
  measureBrowserSyncUsage: runtime.measure,
  listSnapshots: runtime.listSnapshots,
} }))
vi.mock('@/utils/i18n', () => ({ tt: (_id: string, fallback: string) => fallback }))
vi.mock('@chakra-ui/react', async () => {
  const React = await import('react')
  const Container = ({ children, id }: React.PropsWithChildren<{ id?: string }>) => <div id={id}>{children}</div>
  const Button = ({ children, onClick, disabled, 'aria-expanded': expanded }: React.PropsWithChildren<{
    onClick?: React.MouseEventHandler<HTMLButtonElement>; disabled?: boolean; 'aria-expanded'?: boolean
  }>) => <button onClick={onClick} disabled={disabled} aria-expanded={expanded}>{children}</button>
  const Input = () => <input />
  const SwitchRoot = ({ children, checked, disabled, readOnly, onCheckedChange }: React.PropsWithChildren<{
    checked: boolean; disabled: boolean; readOnly?: boolean; onCheckedChange: (event: { checked: boolean }) => void
  }>) => <label><input type="checkbox" checked={checked} disabled={disabled} readOnly={readOnly}
    onClick={(event) => { if (readOnly) event.preventDefault() }}
    onChange={(event) => { if (!readOnly) onCheckedChange({ checked: event.target.checked }) }} />{children}</label>
  return {
    Box: Container, Badge: Container, Container, Button, HStack: Container, Stack: Container, Text: Container,
    Separator: Container, Input,
    Field: { Root: Container, Label: Container, HelperText: Container },
    Switch: { Root: SwitchRoot, Control: Container, Thumb: Container, Label: Container, HiddenInput: () => null },
    Dialog: { Root: () => null, Backdrop: Container, Positioner: Container, Content: Container, Header: Container, Title: Container, Body: Container, Footer: Container },
  }
})

import { FoldersSettingsView } from './index'

const props: SettingViewComponentProps = {
  route: { sectionId: 'folders', viewId: 'index' },
  section: { id: 'folders', label: 'Folders', title: 'Folders', group: 'tools', icon: () => null, views: [] },
  view: { id: 'index', componentId: 'folders' },
  openView: vi.fn(), goBack: vi.fn(), navigateToSection: vi.fn(),
}

describe('Folders Settings storage measurements', () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    runtime.createSnapshot.mockReset().mockResolvedValue(undefined)
    runtime.snapshot.projection.settings = { enabled: true, hideOrganizedChats: false }
    runtime.updateSettings.mockReset().mockResolvedValue(undefined)
    runtime.measure.mockReset().mockResolvedValue(undefined)
    runtime.listSnapshots.mockReset().mockResolvedValue([])
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('measures on each visible entry, not hidden mount or ordinary status rerender', async () => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen={false} />))
    expect(runtime.measure).not.toHaveBeenCalled()
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(runtime.measure).toHaveBeenCalledTimes(1)
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(runtime.measure).toHaveBeenCalledTimes(1)
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen={false} />))
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(runtime.measure).toHaveBeenCalledTimes(2)
  })

  it('measures when opening details and explicitly refreshing, with distinct actual and projected labels', async () => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const details = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'View storage details')!
    await act(async () => details.click())
    expect(runtime.measure).toHaveBeenCalledTimes(2)
    const panel = host.querySelector('#folders-storage-details')!
    expect(panel.textContent).toContain('Current Folder sync storage: 123 B')
    expect(panel.textContent).toContain('Estimated Folder storage after writing: 1200 B')
    expect(panel.textContent).toContain('Total extension sync storage: 223 B / 2000 B')
    const refresh = Array.from(panel.querySelectorAll('button')).find((button) => button.textContent === 'Refresh')!
    await act(async () => refresh.click())
    expect(runtime.measure).toHaveBeenCalledTimes(3)
    await act(async () => details.click())
    expect(runtime.measure).toHaveBeenCalledTimes(3)
  })

  it('shows and hides restore history without fetching again on collapse', async () => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const history = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Restore history')!
    expect(history.getAttribute('aria-expanded')).toBe('false')
    await act(async () => history.click())
    expect(runtime.listSnapshots).toHaveBeenCalledTimes(1)
    expect(history.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('#folders-restore-history')?.textContent).toContain('No restore points yet.')
    await act(async () => history.click())
    expect(runtime.listSnapshots).toHaveBeenCalledTimes(1)
    expect(history.getAttribute('aria-expanded')).toBe('false')
    expect(host.querySelector('#folders-restore-history')).toBeNull()
  })
  it('keeps unrelated controls and expanded details stable while a preference saves', async () => {
    let finish!: () => void
    runtime.updateSettings.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const details = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'View storage details')!
    await act(async () => details.click())
    const panel = host.querySelector('#folders-storage-details')!
    const toggles = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    await act(async () => toggles[0].click())
    expect(runtime.updateSettings).toHaveBeenCalledWith({ enabled: false })
    expect(toggles[0].checked).toBe(false)
    expect(toggles[0].disabled).toBe(false)
    expect(toggles[0].readOnly).toBe(true)
    await act(async () => toggles[0].click())
    expect(runtime.updateSettings).toHaveBeenCalledTimes(1)
    expect(toggles[0].checked).toBe(false)
    expect(toggles[1].disabled).toBe(false)
    expect(Array.from(host.querySelectorAll('button')).every((button) => !button.disabled)).toBe(true)
    expect(host.querySelector('#folders-storage-details')).toBe(panel)
    expect(runtime.measure).toHaveBeenCalledTimes(2)
    await act(async () => {
      runtime.snapshot.projection.settings.enabled = false
      finish()
    })
    expect(toggles[0].checked).toBe(false)
    expect(toggles[0].disabled).toBe(false)
    expect(toggles[0].readOnly).toBe(false)
    expect(host.querySelector('#folders-storage-details')).toBe(panel)
  })

  it('rolls back the switch and allows retry when saving fails', async () => {
    runtime.updateSettings.mockRejectedValueOnce(new Error('Save failed'))
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => toggle.click())
    expect(toggle.checked).toBe(true)
    expect(toggle.disabled).toBe(false)
    expect(host.textContent).toContain('Save failed')
  })

  it('expands and collapses storage during a delayed read without disabling the page or clearing feedback', async () => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const create = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Create')!
    await act(async () => create.click())
    const feedback = Array.from(host.querySelectorAll('div')).find((node) => node.textContent === 'Restore point created.')!
    let finish!: () => void
    runtime.measure.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const details = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'View storage details')!
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => details.click())
    expect(details.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.disabled).toBe(false)
    expect(create.disabled).toBe(false)
    expect(details.disabled).toBe(false)
    expect(feedback.isConnected).toBe(true)
    const panel = host.querySelector('#folders-storage-details')!
    const refresh = Array.from(panel.querySelectorAll('button')).find((button) => button.textContent === 'Refresh')!
    expect(refresh.disabled).toBe(true)
    await act(async () => details.click())
    expect(host.querySelector('#folders-storage-details')).toBeNull()
    await act(async () => details.click())
    expect(runtime.measure).toHaveBeenCalledTimes(2)
    const reopened = host.querySelector('#folders-storage-details')!
    await act(async () => finish())
    expect(host.querySelector('#folders-storage-details')).toBe(reopened)
    expect(host.querySelector('input[type="checkbox"]')).toBe(toggle)
    expect(feedback.isConnected).toBe(true)
  })

  it('keeps history expansion local while loading and reports read failures in the expanded section', async () => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    let fail!: (error: Error) => void
    runtime.listSnapshots.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    const history = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Restore history')!
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => history.click())
    const panel = host.querySelector('#folders-restore-history')!
    expect(panel).not.toBeNull()
    expect(panel.textContent).toContain('Loading...')
    expect(toggle.disabled).toBe(false)
    expect(Array.from(host.querySelectorAll('button')).every((button) => !button.disabled)).toBe(true)
    await act(async () => fail(new Error('History unavailable')))
    expect(host.querySelector('#folders-restore-history')).toBe(panel)
    expect(panel.textContent).toContain('History unavailable')
    expect(host.querySelector('input[type="checkbox"]')).toBe(toggle)
    await act(async () => history.click())
    expect(host.querySelector('#folders-restore-history')).toBeNull()
  })

})
