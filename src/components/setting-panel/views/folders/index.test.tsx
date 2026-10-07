import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingViewComponentProps } from '../../types'

const runtime = vi.hoisted(() => ({
  toastCreate: vi.fn(),
  exportJson: vi.fn(),
  importJson: vi.fn(),
  restore: vi.fn(),
  syncNow: vi.fn(),
  createSnapshot: vi.fn(),
  localStorage: vi.fn(),
  updateSettings: vi.fn(),
  measure: vi.fn(),
  listSnapshots: vi.fn(),
  accountHistory: vi.fn(), selectAccount: vi.fn(), forgetAccount: vi.fn(), confirmEmail: vi.fn(),
  snapshot: {
    identity: { status: 'available', identity: { accountScopeId: 'account-scope-0001', source: 'observed', email: 'user@example.com', avatarUrl: undefined as string | undefined, selection: undefined as 'manual' | 'history' | 'recent' | undefined } },
    projection: { settings: { enabled: true, hideOrganizedChats: false } },
    syncState: {
      state: 'needs-attention', warning: 'quota-exceeded', currentUsageBytes: 123,
      usageBudgetBytes: 1000, currentTotalBytes: 223, quotaBytes: 2000,
      projectedUsageBytes: 1200, usagePercent: 12.3, showCapacityNotice: false,
      folderCount: 2, chatCount: 12,
    },
  },
}))

vi.mock('@/entrypoints/content/folders/runtime', () => ({ folderRuntime: {
  subscribe: () => () => undefined,
  getSnapshot: () => runtime.snapshot,
  exportJson: runtime.exportJson,
  importJson: runtime.importJson,
  restore: runtime.restore,
  syncNow: runtime.syncNow,
  createSnapshot: runtime.createSnapshot,
  getLocalStorageStatus: runtime.localStorage,
  updateSettings: runtime.updateSettings,
  measureBrowserSyncUsage: runtime.measure,
  listSnapshots: runtime.listSnapshots,
  getAccountHistory: runtime.accountHistory, selectSavedAccount: runtime.selectAccount, forgetAccount: runtime.forgetAccount, confirmManualEmail: runtime.confirmEmail,
} }))
vi.mock('../../toaster', () => ({ settingsToaster: { create: runtime.toastCreate } }))
vi.mock('@/components/ui/tooltip', () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/utils/i18n', () => ({
  tt: (_id: string, fallback: string) => fallback,
  t: (id: string, substitution?: string) => id === 'folders_sync_remaining' ? `${substitution ?? ''} available` : id,
  getCurrentLocale: () => 'en',
}))
vi.mock('@/components/ui/tooltip', () => ({ Tooltip: ({ children }: React.PropsWithChildren) => children }))
vi.mock('@/components/ui/toggle-tip', async () => {
  const React = await import('react')
  return { ToggleTip: ({ children, content }: React.PropsWithChildren<{ content: React.ReactNode }>) => {
    const [open, setOpen] = React.useState(false)
    return <div><span onClick={() => setOpen(!open)}>{children}</span>{open ? <div data-sync-info>{content}</div> : null}</div>
  } }
})
vi.mock('@chakra-ui/react', async () => {
  const React = await import('react')
  const Container = ({ children, as, id, color, role, tabIndex, 'data-control': control }: React.PropsWithChildren<{
    as?: string; id?: string; color?: string; role?: string; tabIndex?: number; 'data-control'?: string
  }>) => React.createElement(as ?? 'div', { id, role, tabIndex, 'data-control': control, 'data-color': color }, children)
  const Button = React.forwardRef<HTMLButtonElement, React.PropsWithChildren<{
    onClick?: React.MouseEventHandler<HTMLButtonElement>; disabled?: boolean; type?: 'button' | 'submit'; 'aria-expanded'?: boolean; 'aria-label'?: string
  }>>(({ children, onClick, disabled, type = 'button', 'aria-expanded': expanded, 'aria-label': label }, ref) => <button ref={ref} type={type} onClick={onClick} disabled={disabled} aria-expanded={expanded} aria-label={label}>{children}</button>)
  const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => <input {...props} ref={ref} />)
  const SwitchRoot = ({ children, checked, disabled, readOnly, onCheckedChange }: React.PropsWithChildren<{
    checked: boolean; disabled: boolean; readOnly?: boolean; onCheckedChange: (event: { checked: boolean }) => void
  }>) => <label><input type="checkbox" checked={checked} disabled={disabled} readOnly={readOnly}
    onClick={(event) => { if (readOnly) event.preventDefault() }}
    onChange={(event) => { if (!readOnly) onCheckedChange({ checked: event.target.checked }) }} />{children}</label>
  return {
    Box: Container, Badge: Container, Container, Button, IconButton: Button, Flex: Container, HStack: Container, Stack: Container, Text: Container,
    Separator: Container, Input, Portal: Container,
    NativeSelect: { Root: Container, Field: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />, Indicator: () => null },
    Field: { Root: Container, Label: Container, HelperText: Container, ErrorText: Container },
    Switch: { Root: SwitchRoot, Control: Container, Thumb: Container, Label: Container, HiddenInput: () => null },
    Dialog: { Root: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) => open ? <div data-test-dialog>{children}</div> : null, Backdrop: Container, Positioner: Container, Content: Container, Header: Container, Title: Container, Body: Container, Footer: Container },
  }
})

import { FoldersSettingsView } from './index'
import FolderDebugPanel from './FolderDebugPanel'
import { FolderStorageDebug } from './FolderStorageDebug'

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
    runtime.snapshot.identity.identity.avatarUrl = undefined
    runtime.snapshot.identity.identity.selection = undefined
    runtime.accountHistory.mockReset().mockResolvedValue({ accounts: [] })
    runtime.selectAccount.mockReset().mockResolvedValue(undefined)
    runtime.forgetAccount.mockReset().mockResolvedValue({ accounts: [] })
    runtime.confirmEmail.mockReset().mockResolvedValue(undefined)
    runtime.snapshot.identity.status = 'available'
    runtime.snapshot.identity.identity.accountScopeId = 'account-scope-0001'
    runtime.snapshot.identity.identity.source = 'observed'
    runtime.snapshot.syncState = {
      state: 'needs-attention', warning: 'quota-exceeded', currentUsageBytes: 123,
      usageBudgetBytes: 1000, currentTotalBytes: 223, quotaBytes: 2000,
      projectedUsageBytes: 1200, usagePercent: 12.3, showCapacityNotice: false,
      folderCount: 2, chatCount: 12,
    }
    runtime.toastCreate.mockReset()
    runtime.exportJson.mockReset().mockResolvedValue('{}')
    runtime.importJson.mockReset().mockResolvedValue(undefined)
    runtime.restore.mockReset().mockResolvedValue(undefined)
    runtime.syncNow.mockReset().mockResolvedValue(undefined)
    runtime.localStorage.mockReset().mockResolvedValue({ snapshotCount: 0, snapshotBytes: 0, snapshotBudgetBytes: 20 * 1024 * 1024, low: false, unlimited: false })
    runtime.createSnapshot.mockReset().mockResolvedValue(undefined)
    runtime.snapshot.projection.settings = { enabled: true, hideOrganizedChats: false }
    runtime.updateSettings.mockReset().mockResolvedValue(undefined)
    runtime.measure.mockReset().mockResolvedValue(undefined)
    runtime.listSnapshots.mockReset().mockResolvedValue([])
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  it('uses the account avatar and falls back when loading fails or no avatar is available', async () => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const section = host.querySelector('[data-control="folder-account"]')!
    expect(section.querySelector('img')).toBeNull()
    runtime.snapshot.identity.identity.avatarUrl = 'https://example.com/avatar.png'
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const avatar = section.querySelector('img')!
    expect(avatar.src).toBe('https://example.com/avatar.png')
    await act(async () => avatar.dispatchEvent(new Event('error')))
    expect(section.querySelector('img')).toBeNull()
    expect(section.querySelector('svg')).not.toBeNull()
    runtime.snapshot.identity.identity.avatarUrl = 'https://example.com/new-avatar.png'
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(section.querySelector('img')?.src).toBe('https://example.com/new-avatar.png')
  })

  it('focuses manual email when opening settings without an identified account', async () => {
    runtime.snapshot.identity.status = 'unavailable'
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen={false} />))
    expect(host.querySelector('input[type="email"]')).toBeNull()
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(document.activeElement).toBe(host.querySelector('input[type="email"]'))
  })

  it('prioritizes saved accounts and reveals new email input on request', async () => {
    runtime.snapshot.identity.status = 'unavailable'
    runtime.accountHistory.mockResolvedValue({ accounts: [{ email: 'saved@example.com', accountScopeId: 'account-scope-0002', lastUsedAt: '2026-10-05T00:00:00.000Z' }] })
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(host.querySelector('input[type="email"]')).toBeNull()
    expect(host.textContent).toContain('Saved accounts')
    const saved = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'saved@example.com')!
    await act(async () => saved.click())
    expect(runtime.selectAccount).toHaveBeenCalledExactlyOnceWith('saved@example.com')
  })

  it('shows the restored account and exposes switching and forgetting without deleting Folder data', async () => {
    runtime.snapshot.identity.identity.source = 'manual-confirmed'
    runtime.snapshot.identity.identity.selection = 'recent'
    runtime.accountHistory.mockResolvedValue({ accounts: [{ email: 'saved@example.com', accountScopeId: 'account-scope-0002', lastUsedAt: '2026-10-05T00:00:00.000Z' }] })
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(host.textContent).toContain('Using saved account')
    expect(host.querySelector('input[type="email"]')).toBeNull()
    const switchAccount = host.querySelector<HTMLButtonElement>('button[aria-label="Switch account"]')!
    await act(async () => switchAccount.click())
    expect(host.querySelector('input[type="email"]')).toBeNull()
    const another = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Use another email'))!
    await act(async () => another.click())
    expect(host.querySelector('input[type="email"]')).not.toBeNull()
    const forget = host.querySelector<HTMLButtonElement>('[aria-label="Remove from account history: saved@example.com"]')!
    await act(async () => forget.click())
    expect(runtime.forgetAccount).toHaveBeenCalledExactlyOnceWith('account-scope-0002')
    expect(host.textContent).not.toContain('saved@example.com')
    expect(runtime.snapshot.identity.identity.email).toBe('user@example.com')
  })

  it('opens the account chooser directly when requested by the sidebar', async () => {
    runtime.snapshot.identity.identity.source = 'manual-confirmed'
    await act(async () => root.render(<FoldersSettingsView {...props} route={{ ...props.route, params: { chooseAccount: true } }} isPanelOpen />))
    expect(host.querySelector('input[type="email"]')).not.toBeNull()
  })

  it('validates email inline and submits a normalized address with Enter', async () => {
    runtime.snapshot.identity.status = 'unavailable'
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const input = host.querySelector<HTMLInputElement>('input[type="email"]')!
    const form = input.closest('form')!
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(host.textContent).toContain('Enter a valid email address.')
    expect(runtime.confirmEmail).not.toHaveBeenCalled()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, ' USER@example.com ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(runtime.confirmEmail).toHaveBeenCalledExactlyOnceWith('user@example.com')
  })

  it('marks the selected saved account without offering redundant selection', async () => {
    runtime.snapshot.identity.identity.source = 'manual-confirmed'
    runtime.accountHistory.mockResolvedValue({ accounts: [{ email: 'user@example.com', accountScopeId: 'account-scope-0001', lastUsedAt: '2026-10-05T00:00:00.000Z' }] })
    await act(async () => root.render(<FoldersSettingsView {...props} route={{ ...props.route, params: { chooseAccount: true } }} isPanelOpen />))
    const current = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'user@example.com')!
    expect(current.disabled).toBe(true)
    expect(host.textContent).toContain('Current')
    expect(host.textContent).toContain('Removing an account here keeps its Folder data.')
    expect(host.querySelector('input[type="email"]')).toBeNull()
  })

  it('previews recovery exceptions without changing data or permissions', async () => {
    await act(async () => root.render(<FolderDebugPanel />))
    const button = (label: string) => Array.from(host.querySelectorAll('button')).find((item) => item.textContent === label)!
    expect(host.querySelector('#folders-debug-preview')).toBeNull()
    await act(async () => button('Debug').click())
    const choose = async (value: string) => act(async () => {
      const select = host.querySelector<HTMLSelectElement>('#folders-debug-scenario')!
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(host.querySelector('[data-control="recovery-storage-warning"]')).toBeNull()
    await choose('recovery-failed')
    await act(async () => button('Retry').click())
    expect(host.textContent).toContain('No data or permissions changed.')
    await choose('recovery-too-large')
    expect(host.textContent).toContain('exceeds the recovery limit')
    await act(async () => button('Export backup').click())
    expect(host.textContent).toContain('Preview only: export backup.')
    await choose('recovery-budget')
    expect(host.textContent).toContain('temporarily using the recovery limit')
    await choose('recovery-save-failed')
    expect(host.textContent).toContain('This change was not saved.')
    await choose('recovery-protection-failed')
    expect(host.textContent).toContain('The operation was not performed.')
    await choose('recovery-healthy')
    expect(host.querySelector('[data-control="recovery-storage-warning"]')).toBeNull()
    expect(runtime.exportJson).not.toHaveBeenCalled()
    expect(runtime.createSnapshot).not.toHaveBeenCalled()
    expect(runtime.importJson).not.toHaveBeenCalled()
    expect(runtime.restore).not.toHaveBeenCalled()
    await act(async () => button('Close preview').click())
    expect(host.querySelector('#folders-debug-preview')).toBeNull()
    await act(async () => button('Debug').click())
    await choose('recovery-budget')
    await act(async () => root.render(<FolderDebugPanel isPanelOpen={false} />))
    expect(host.querySelector('#folders-debug-preview')).toBeNull()
    await act(async () => root.render(<FolderDebugPanel isPanelOpen />))
    await act(async () => button('Debug').click())
    expect(host.querySelector<HTMLSelectElement>('#folders-debug-scenario')?.value).toBe('recovery-healthy')
  })

  it('reads actual debug storage on demand and keeps scenario changes separate from measurements', async () => {
    runtime.snapshot.syncState.currentTotalBytes = 1990
    runtime.localStorage.mockResolvedValue({ snapshotCount: 6, snapshotBytes: 1024, snapshotBudgetBytes: 2048, usageBytes: 4096, quotaBytes: 8192, low: false, unlimited: true })
    await act(async () => root.render(<FolderDebugPanel accountScopeId="account-scope-0001" />))
    const button = (label: string) => Array.from(host.querySelectorAll('button')).find((item) => item.textContent === label)!
    await act(async () => button('Debug').click())
    expect(runtime.measure).not.toHaveBeenCalled()
    expect(runtime.localStorage).not.toHaveBeenCalled()
    await act(async () => button('Storage data').click())
    const data = host.querySelector('[data-control="folder-debug-storage"]')!
    expect(data.textContent).toContain('123 B (123 B)')
    expect(data.textContent).toContain('877 B (877 B) · 87.7% available')
    expect(data.textContent).toContain('10 B (10 B) · 1.0% available')
    expect(data.textContent).toContain('1,024 B (1 KiB) · 50.0% available')
    expect(data.textContent).toContain('4,096 B (4 KiB)')
    expect(data.textContent).toContain('unlimitedStorage grantedtrue')
    const select = host.querySelector<HTMLSelectElement>('#folders-debug-scenario')!
    await act(async () => {
      select.value = 'sync-red'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(data.textContent).toContain('123 B (123 B)')
    expect(host.querySelector('[data-control="folder-debug-result"]')?.textContent).toContain('5% available')
    expect(runtime.measure).toHaveBeenCalledTimes(1)
    expect(runtime.localStorage).toHaveBeenCalledTimes(1)
    runtime.snapshot.syncState.currentUsageBytes = 500
    await act(async () => button('Refresh measurements').click())
    expect(data.textContent).toContain('500 B (500 B)')
    expect(runtime.measure).toHaveBeenCalledTimes(2)
    expect(runtime.syncNow).not.toHaveBeenCalled()
  })

  it('keeps successful storage measurements visible when the other measurement fails', async () => {
    runtime.measure.mockRejectedValue(new Error('Sync measurement unavailable'))
    await act(async () => root.render(<FolderStorageDebug accountScopeId="account-scope-0001" />))
    expect(host.textContent).toContain('Sync measurement unavailable')
    expect(host.textContent).toContain('Current account restore points0')
    expect(host.textContent).toContain('Folder usageUnavailable')
    runtime.measure.mockResolvedValue(undefined)
    runtime.localStorage.mockRejectedValue(new Error('Local measurement unavailable'))
    await act(async () => Array.from(host.querySelectorAll('button')).find((item) => item.textContent === 'Refresh measurements')!.click())
    expect(host.textContent).not.toContain('Sync measurement unavailable')
    expect(host.textContent).toContain('Local measurement unavailable')
    expect(host.textContent).toContain('123 B (123 B)')
  })

  it('discards debug measurements completed after the account switches', async () => {
    let resolve: (value: unknown) => void = () => undefined
    runtime.localStorage.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    await act(async () => root.render(<FolderStorageDebug key="old" accountScopeId="account-scope-0001" />))
    runtime.snapshot.identity.identity.accountScopeId = 'account-scope-0002'
    await act(async () => root.render(<FolderStorageDebug key="new" accountScopeId="account-scope-0002" />))
    await act(async () => resolve({ snapshotCount: 99, snapshotBytes: 9999, snapshotBudgetBytes: 10000, low: false, unlimited: false }))
    expect(host.textContent).toContain('Current account restore points0')
    expect(host.textContent).not.toContain('9,999 B')
  })

  it('previews sync capacity colors, failures and actions without sending sync requests', async () => {
    await act(async () => root.render(<FolderDebugPanel folderCount={2} chatCount={12} />))
    const button = (label: string) => Array.from(host.querySelectorAll('button')).find((item) => item.textContent === label)!
    await act(async () => button('Debug').click())
    const choose = async (value: string) => act(async () => {
      const select = host.querySelector<HTMLSelectElement>('#folders-debug-scenario')!
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    for (const [scenario, percent, color] of [
      ['sync-green', '75%', 'fg.success'], ['sync-yellow', '25%', 'fg.warning'], ['sync-red', '5%', 'fg.error'],
    ]) {
      await choose(scenario)
      expect(host.querySelector(`[data-color="${color}"]`)?.textContent).toContain(`${percent} available`)
      expect(host.textContent).toContain('2 folders · 12 organized chats')
    }
    await choose('sync-pending')
    expect(host.textContent).toContain('Saved on this device. Browser Sync will write it when available.')
    await choose('sync-quota')
    await act(async () => button('Retry').click())
    expect(runtime.toastCreate).toHaveBeenCalledWith({ type: 'info', closable: true, title: 'Retry requested.' })
    expect(runtime.syncNow).not.toHaveBeenCalled()
    await choose('sync-failed')
    expect(host.textContent).toContain('Sync needs attention.')
    expect(host.textContent).not.toContain('Retry requested.')
    await choose('sync-capacity')
    expect(host.textContent).toContain('Browser sync space is running low.')
    await act(async () => button('Later').click())
    expect(host.textContent).not.toContain('Browser sync space is running low.')
    await choose('sync-measurement-failed')
    expect(host.textContent).toContain('Available space could not be checked.')
    await choose('sync-checking')
    expect(host.textContent).toContain('Checking sync status…')
    await choose('sync-manual')
    expect(host.textContent).toContain('25% available')
    await choose('sync-unavailable')
    expect(host.textContent).toContain('Unavailable')
    expect(runtime.measure).not.toHaveBeenCalled()
  })

  it('keeps healthy recovery compact and ignores estimated low capacity', async () => {
    runtime.localStorage.mockResolvedValue({ snapshotCount: 6, lastSnapshotAt: '2026-01-02T03:04:00.000Z', snapshotBytes: 1024, snapshotBudgetBytes: 20 * 1024 * 1024, low: false, unlimited: false })
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(host.querySelector('[data-control="restore-points"]')?.textContent).toContain('6 restore points · Last saved')
    expect(host.textContent).not.toContain('Restore points: 1 KiB / 20 MiB')
    expect(host.textContent).not.toContain('Estimated local storage')
    expect(host.textContent).not.toContain('Refresh local storage')
    expect(host.textContent).not.toContain('Allow more local storage')
    runtime.localStorage.mockResolvedValue({ snapshotCount: 6, snapshotBytes: 1024, snapshotBudgetBytes: 20 * 1024 * 1024, low: true, unlimited: false })
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(host.querySelector('[data-control="recovery-storage-warning"]')).toBeNull()
    runtime.localStorage.mockResolvedValue({ snapshotCount: 6, snapshotBytes: 1024, snapshotBudgetBytes: 20 * 1024 * 1024, low: true, unlimited: true })
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(host.textContent).not.toContain('Allow more local storage')
    expect(host.querySelector('[data-control="recovery-storage-warning"]')).toBeNull()
  })

  it('explains the recovery budget without offering an ineffective permission action', async () => {
    runtime.localStorage.mockResolvedValue({ snapshotCount: 6, snapshotBytes: 1024, snapshotBudgetBytes: 1024, low: false, unlimited: true, warning: 'budget-exceeded', automaticSnapshotFailed: true })
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const warning = host.querySelector('[data-control="recovery-storage-warning"]')!
    expect(warning.textContent).toContain('temporarily using the recovery limit')
    expect(warning.textContent).toContain('Retry')
  })

  it('offers export instead of retry for an oversized automatic restore point', async () => {
    runtime.localStorage.mockResolvedValue({ snapshotCount: 0, snapshotBytes: 0, snapshotBudgetBytes: 20 * 1024 * 1024, low: false, unlimited: true, warning: 'snapshot-too-large', automaticSnapshotFailed: true })
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const warning = host.querySelector('[data-control="recovery-storage-warning"]')!
    expect(warning.textContent).toContain('exceeds the recovery limit')
    const actions = Array.from(warning.querySelectorAll('button')).map((button) => button.textContent)
    expect(actions).toEqual(['Export backup'])
    expect(runtime.createSnapshot).not.toHaveBeenCalled()
  })

  it('shows restore rules and space only after opening Info', async () => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(host.textContent).not.toContain('Keep up to 10, with no time expiry.')
    const info = host.querySelector<HTMLButtonElement>('[aria-label="About restore points"]')!
    await act(async () => info.click())
    expect(host.textContent).toContain('Keep up to 10, with no time expiry.')
    expect(host.textContent).toContain('Accounts share restore-point storage')
    expect(host.textContent).not.toContain('KiB')
    expect(runtime.listSnapshots).not.toHaveBeenCalled()
  })

  it('exports with a toast without adding feedback to the backup row', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const row = host.querySelector('[data-control="backup-file"]')!
    const button = Array.from(row.querySelectorAll('button')).find((element) => element.textContent === 'Export backup')!
    await act(async () => button.click())
    expect(runtime.exportJson).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledTimes(1)
    expect(runtime.toastCreate).toHaveBeenCalledWith({ type: 'success', closable: true, title: 'Folder backup exported.' })
    expect(row.textContent).not.toContain('Folder backup exported.')
    expect(host.querySelector('[data-control="restore-points"]')?.textContent).not.toContain('Folder backup exported.')
  })

  it('reports restore success and failure through toasts without adding row or dialog feedback', async () => {
    runtime.listSnapshots.mockResolvedValue([{ id: 'one', createdAt: '2026-01-01T00:00:00.000Z', reason: 'manual', folderCount: 1, chatCount: 1 }])
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const history = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'View history')!
    await act(async () => history.click())
    const restore = host.querySelector<HTMLButtonElement>('#folders-restore-history button')!
    await act(async () => restore.click())
    const dialog = host.querySelector('[data-test-dialog]')!
    const confirm = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Restore')!
    runtime.restore.mockRejectedValueOnce(new Error('Restore failed'))
    await act(async () => confirm.click())
    expect(runtime.toastCreate).toHaveBeenLastCalledWith({ type: 'error', closable: true, title: 'Restore failed' })
    expect(host.querySelector('[data-test-dialog]')).not.toBeNull()
    expect(dialog.textContent).not.toContain('Restore failed')
    await act(async () => confirm.click())
    expect(runtime.toastCreate).toHaveBeenLastCalledWith({ type: 'success', closable: true, title: 'Folder organization restored.' })
    expect(host.querySelector('[data-test-dialog]')).toBeNull()
    expect(host.textContent).not.toContain('Folder organization restored.')
  })

  it('validates an import and shows its file and counts before confirmation', async () => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    const payload = {
      schemaVersion: 1, accountScopeId: 'account-scope-0001', exportedAt: '2026-01-01T00:00:00.000Z',
      settings: { enabled: true, hideOrganizedChats: false }, settingsVersion: '0000000000000:000000:test',
      folders: [], memberships: [], chatReferences: [],
    }
    const file = new File([JSON.stringify(payload)], 'my-folders.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    const dialog = host.querySelector('[data-test-dialog]')!
    expect(dialog.textContent).toContain('my-folders.json')
    expect(dialog.textContent).toContain('(0 folders, 0 chats)')
    expect(runtime.importJson).not.toHaveBeenCalled()
    const confirm = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Import')!
    await act(async () => confirm.click())
    expect(runtime.importJson).toHaveBeenCalledWith(JSON.stringify(payload))
    expect(host.querySelector('[data-test-dialog]')).toBeNull()
    expect(runtime.toastCreate).toHaveBeenCalledWith({ type: 'success', closable: true, title: 'Folder backup imported.' })
    expect(host.textContent).not.toContain('Folder backup imported.')
  })

  it.each([
    { content: '{broken', expected: 'This file is not a valid Folder backup.' },
    { content: JSON.stringify({ schemaVersion: 1, accountScopeId: 'account-scope-0002', exportedAt: '2026-01-01T00:00:00.000Z', settings: { enabled: true, hideOrganizedChats: false }, settingsVersion: '0000000000000:000000:test', folders: [], memberships: [], chatReferences: [] }), expected: 'This backup belongs to a different Gemini account.' },
  ])('rejects invalid or foreign backups before confirmation', async ({ content, expected }) => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([content], 'backup.json', { type: 'application/json' })] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(runtime.toastCreate).toHaveBeenCalledWith({ type: 'error', closable: true, title: expected })
    expect(host.textContent).not.toContain(expected)
    expect(host.querySelector('[data-test-dialog]')).toBeNull()
    expect(runtime.importJson).not.toHaveBeenCalled()
  })

  it('ignores toast completion after switching accounts', async () => {
    let finish!: () => void
    runtime.createSnapshot.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const create = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Create restore point')!
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => create.click())
    expect(create.disabled).toBe(true)
    expect(toggle.disabled).toBe(false)
    runtime.snapshot.identity.identity.accountScopeId = 'account-scope-0002'
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    await act(async () => finish())
    expect(runtime.toastCreate).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('Restore point created.')
  })

  it('ignores operation feedback after closing the panel and resets the pending control', async () => {
    let finish!: () => void
    runtime.createSnapshot.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const create = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Create restore point')!
    await act(async () => create.click())
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen={false} />))
    await act(async () => finish())
    expect(runtime.toastCreate).not.toHaveBeenCalled()
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(create.disabled).toBe(false)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
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

  it('shows cloud sync and remaining space without duplicate statistics or a routine sync button', async () => {
    runtime.snapshot.syncState.state = 'accepted-by-browser-storage'
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const summary = host.querySelector('[data-control="browser-sync-summary"]')!
    expect(summary.textContent).toContain('Cloud sync via your browser')
    expect(summary.textContent).toContain('87.7% available')
    expect(summary.textContent).not.toContain('Current Folder sync storage')
    expect(summary.textContent).not.toContain('Folder sync budget')
    expect(summary.textContent).toContain('2 folders · 12 organized chats')
    expect(summary.textContent).not.toContain('Sync now')
    expect(summary.textContent).not.toContain('Retry')
    expect(host.querySelector('#folders-storage-details')).toBeNull()
  })

  it('limits available space by the shared extension quota and clamps a full storage area to zero', async () => {
    runtime.snapshot.syncState.currentTotalBytes = 1900
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const summary = host.querySelector('[data-control="browser-sync-summary"]')!
    expect(summary.textContent).toContain('10% available')
    runtime.snapshot.syncState.currentTotalBytes = 2100
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(summary.textContent).toContain('0% available')
  })

  it.each([
    { used: 599, percent: '40.1%', color: 'fg.success' },
    { used: 600, percent: '40%', color: 'fg.warning' },
    { used: 899, percent: '10.1%', color: 'fg.warning' },
    { used: 900, percent: '10%', color: 'fg.error' },
  ])('uses $color for $percent remaining capacity', async ({ used, percent, color }) => {
    runtime.snapshot.syncState.currentUsageBytes = used
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const summary = host.querySelector('[data-control="browser-sync-summary"]')!
    const capacity = Array.from(summary.querySelectorAll('[data-color]')).find((element) => element.textContent === `${percent} available`)!
    expect(capacity).toBeDefined()
    expect(capacity.getAttribute('data-color')).toBe(color)
    expect(summary.textContent).not.toContain('KiB')
  })

  it('opens sync requirements on demand with a disabled guide placeholder', async () => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(host.querySelector('[data-sync-info]')).toBeNull()
    const info = host.querySelector<HTMLButtonElement>('[aria-label="About browser sync"]')!
    await act(async () => info.click())
    const panel = host.querySelector('[data-sync-info]')!
    expect(panel.textContent).toContain('In Chrome, sign in and enable sync for extensions.')
    expect(panel.textContent).toContain('Guide coming soon')
    expect(panel.querySelector('button')?.disabled).toBe(true)
    expect(runtime.measure).toHaveBeenCalledTimes(1)
    await act(async () => info.click())
    expect(host.querySelector('[data-sync-info]')).toBeNull()
  })

  it('uses the saved Recents hiding setting and allows changes for a manually identified account', async () => {
    runtime.snapshot.identity.identity.source = 'manual-confirmed'
    runtime.snapshot.projection.settings.hideOrganizedChats = true
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const toggle = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
    expect(toggle.disabled).toBe(false)
    expect(toggle.checked).toBe(true)
    expect(host.querySelector('#folders-hide-help')?.textContent).toContain('Only hides matching rows in Gemini Recents.')
    await act(async () => toggle.click())
    expect(runtime.updateSettings).toHaveBeenCalledExactlyOnceWith({ hideOrganizedChats: false })
  })

  it('shows capacity and allows retry for a manually identified account', async () => {
    runtime.snapshot.identity.identity.source = 'manual-confirmed'
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    expect(host.textContent).toContain('Saved on this browser')
    expect(host.textContent).not.toContain('does not enable Recents hiding or Drive sync')
    const summary = host.querySelector('[data-control="browser-sync-summary"]')!
    expect(summary.textContent).toContain('87.7% available')
    expect(summary.textContent).toContain('New changes are safely saved on this device')
    const retry = Array.from(summary.querySelectorAll('button')).find((button) => button.textContent === 'Retry')!
    await act(async () => retry.click())
    expect(runtime.syncNow).toHaveBeenCalledTimes(1)
  })

  it('shows pending changes and capacity notices for a manually identified account', async () => {
    runtime.snapshot.identity.identity.source = 'manual-confirmed'
    runtime.snapshot.syncState.state = 'local-changes-pending'
    runtime.snapshot.syncState.warning = ''
    runtime.snapshot.syncState.showCapacityNotice = true
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const summary = host.querySelector('[data-control="browser-sync-summary"]')!
    expect(summary.textContent).toContain('Saved on this device. Browser Sync will write it when available.')
    expect(summary.textContent).toContain('Browser sync space is running low.')
    expect(summary.textContent).not.toContain('Browser Sync is unavailable')
  })

  it('toasts retry results without changing the summary or claiming completed cloud delivery', async () => {
    let finish!: () => void
    runtime.syncNow.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const summary = host.querySelector('[data-control="browser-sync-summary"]')!
    const retry = Array.from(summary.querySelectorAll('button')).find((button) => button.textContent === 'Retry')!
    const create = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Create restore point')!
    await act(async () => retry.click())
    expect(runtime.syncNow).toHaveBeenCalledTimes(1)
    expect(retry.disabled).toBe(true)
    expect(create.disabled).toBe(false)
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(false)
    await act(async () => finish())
    expect(runtime.toastCreate).toHaveBeenCalledWith({ type: 'info', closable: true, title: 'Retry requested.' })
    expect(summary.textContent).not.toContain('Retry requested.')
    expect(summary.textContent).not.toContain('Browser Sync checked.')
    expect(retry.disabled).toBe(false)
    runtime.syncNow.mockRejectedValueOnce(new Error('Request failed'))
    await act(async () => retry.click())
    expect(runtime.toastCreate).toHaveBeenCalledWith({ type: 'error', closable: true, title: 'Could not request a retry. Try again.' })
    expect(summary.textContent).not.toContain('Could not request a retry. Try again.')
  })

  it('shows and hides restore history without fetching again on collapse', async () => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const history = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'View history')!
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

  it('shows each restore point count independently of the current organization', async () => {
    runtime.listSnapshots.mockResolvedValue([
      { id: 'one', createdAt: '2026-01-01T00:00:00.000Z', reason: 'manual', folderCount: 1, chatCount: 1 },
      { id: 'two', createdAt: '2026-01-02T00:00:00.000Z', reason: 'automatic', folderCount: 0, chatCount: 0 },
      { id: 'unreadable', createdAt: '2026-01-03T00:00:00.000Z', reason: 'manual' },
    ])
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const history = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'View history')!
    await act(async () => history.click())
    const panel = host.querySelector('#folders-restore-history')!
    expect(panel.textContent).toContain('(1 folder, 1 chat)')
    expect(panel.textContent).toContain('(0 folders, 0 chats)')
    expect(panel.textContent).not.toContain('(2 folders, 12 chats)')
    expect(panel.textContent?.match(/\(0 folders, 0 chats\)/g)).toHaveLength(1)
  })

  it.each(['Retry', 'Create restore point'])('refreshes expanded recovery history after %s succeeds', async (action) => {
    runtime.localStorage.mockResolvedValue({ snapshotCount: 2, snapshotBytes: 1000, snapshotBudgetBytes: 20 * 1024 * 1024, low: false, unlimited: true, warning: 'snapshot-failed', automaticSnapshotFailed: true })
    runtime.listSnapshots.mockResolvedValueOnce([
      { id: 'old', createdAt: '2026-01-01T00:00:00.000Z', reason: 'manual', folderCount: 1, chatCount: 1 },
      { id: 'pruned', createdAt: '2025-12-31T00:00:00.000Z', reason: 'automatic', folderCount: 3, chatCount: 3 },
    ]).mockResolvedValue([
      { id: 'new', createdAt: '2026-01-02T00:00:00.000Z', reason: 'manual', folderCount: 2, chatCount: 2 },
    ])
    runtime.createSnapshot.mockImplementationOnce(async () => {
      runtime.localStorage.mockResolvedValue({ snapshotCount: 1, lastSnapshotAt: '2026-01-02T00:00:00.000Z', snapshotBytes: 500, snapshotBudgetBytes: 20 * 1024 * 1024, low: false, unlimited: true, automaticSnapshotFailed: false })
    })
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const history = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'View history')!
    await act(async () => history.click())
    const panel = host.querySelector('#folders-restore-history')!
    expect(panel.textContent).toContain('(3 folders, 3 chats)')
    const toggle = host.querySelector('input[type="checkbox"]')
    const controls = action === 'Retry' ? host.querySelector('[data-control="recovery-storage-warning"]')! : host
    const button = Array.from(controls.querySelectorAll('button')).find((item) => item.textContent === action)!
    await act(async () => button.click())
    expect(runtime.createSnapshot).toHaveBeenCalledTimes(1)
    expect(runtime.listSnapshots).toHaveBeenCalledTimes(2)
    expect(host.querySelector('#folders-restore-history')).toBe(panel)
    expect(panel.textContent).toContain('(2 folders, 2 chats)')
    expect(panel.textContent).not.toContain('(1 folder, 1 chat)')
    expect(panel.textContent).not.toContain('(3 folders, 3 chats)')
    expect(host.querySelector('[data-control="recovery-storage-warning"]')).toBeNull()
    expect(host.querySelector('input[type="checkbox"]')).toBe(toggle)
    expect(runtime.toastCreate).toHaveBeenCalledWith({ type: 'success', closable: true, title: 'Restore point created.' })
  })

  it('does not load hidden history after a recovery retry succeeds', async () => {
    runtime.localStorage.mockResolvedValue({ snapshotCount: 1, snapshotBytes: 500, snapshotBudgetBytes: 20 * 1024 * 1024, low: false, unlimited: true, warning: 'snapshot-failed', automaticSnapshotFailed: true })
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const retry = host.querySelector<HTMLButtonElement>('[data-control="recovery-storage-warning"] button')!
    await act(async () => retry.click())
    expect(runtime.createSnapshot).toHaveBeenCalledTimes(1)
    expect(runtime.listSnapshots).not.toHaveBeenCalled()
    expect(host.querySelector('#folders-restore-history')).toBeNull()
  })

  it('keeps expanded recovery history intact when a retry fails', async () => {
    runtime.localStorage.mockResolvedValue({ snapshotCount: 1, snapshotBytes: 500, snapshotBudgetBytes: 20 * 1024 * 1024, low: false, unlimited: true, warning: 'snapshot-failed', automaticSnapshotFailed: true })
    runtime.listSnapshots.mockResolvedValue([{ id: 'old', createdAt: '2026-01-01T00:00:00.000Z', reason: 'manual', folderCount: 1, chatCount: 1 }])
    runtime.createSnapshot.mockRejectedValueOnce(new Error('Restore point write failed'))
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const history = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'View history')!
    await act(async () => history.click())
    const panel = host.querySelector('#folders-restore-history')!
    const retry = host.querySelector<HTMLButtonElement>('[data-control="recovery-storage-warning"] button')!
    await act(async () => retry.click())
    expect(runtime.listSnapshots).toHaveBeenCalledTimes(1)
    expect(host.querySelector('#folders-restore-history')).toBe(panel)
    expect(panel.textContent).toContain('(1 folder, 1 chat)')
    expect(runtime.toastCreate).toHaveBeenCalledWith({ type: 'error', closable: true, title: 'Restore point write failed' })
    expect(retry.disabled).toBe(false)
  })

  it('keeps unrelated controls and expanded details stable while a preference saves', async () => {
    let finish!: () => void
    runtime.updateSettings.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const details = host.querySelector<HTMLButtonElement>('[aria-label="About browser sync"]')!
    await act(async () => details.click())
    const panel = host.querySelector('[data-sync-info]')!
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
    expect(toggles[1].readOnly).toBe(false)
    expect(host.querySelector('[data-sync-info]')).toBe(panel)
    expect(runtime.measure).toHaveBeenCalledTimes(1)
    await act(async () => {
      runtime.snapshot.projection.settings.enabled = false
      finish()
    })
    expect(toggles[0].checked).toBe(false)
    expect(toggles[0].disabled).toBe(false)
    expect(toggles[0].readOnly).toBe(false)
    expect(host.querySelector('[data-sync-info]')).toBe(panel)
  })

  it('rolls back the switch and allows retry when saving fails', async () => {
    runtime.updateSettings.mockRejectedValueOnce(new Error('Save failed'))
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await act(async () => toggle.click())
    expect(toggle.checked).toBe(true)
    expect(toggle.disabled).toBe(false)
    expect(runtime.toastCreate).toHaveBeenCalledWith({ type: 'error', closable: true, title: 'Save failed' })
    expect(host.textContent).not.toContain('Save failed')
  })

  it('keeps capacity measurement errors local without clearing other feedback', async () => {
    let fail!: (error: Error) => void
    runtime.measure.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    const create = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Create restore point')!
    await act(async () => create.click())
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(runtime.toastCreate).toHaveBeenCalledWith({ type: 'success', closable: true, title: 'Restore point created.' })
    expect(host.querySelector('[data-control="restore-points"]')?.textContent).not.toContain('Restore point created.')
    await act(async () => fail(new Error('Measurement unavailable')))
    const summary = host.querySelector('[data-control="browser-sync-summary"]')!
    expect(summary.textContent).toContain('Available space could not be checked.')
    expect(summary.textContent).not.toContain('87.7% available')
    expect(runtime.toastCreate).toHaveBeenCalledTimes(1)
    expect(host.textContent).not.toContain('Restore point created.')
    expect(create.disabled).toBe(false)
    expect(toggle.disabled).toBe(false)
    expect(host.querySelector('input[type="checkbox"]')).toBe(toggle)
  })

  it('keeps history expansion local while loading and reports read failures in the expanded section', async () => {
    await act(async () => root.render(<FoldersSettingsView {...props} isPanelOpen />))
    let fail!: (error: Error) => void
    runtime.listSnapshots.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    const history = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'View history')!
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
