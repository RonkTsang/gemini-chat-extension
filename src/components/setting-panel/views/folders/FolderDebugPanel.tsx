import { Button, Field, HStack, NativeSelect, Stack, Text } from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import { LuBug } from 'react-icons/lu'

import type { FolderLocalStorageStatus } from '@/domain/folder/types'
import type { BrowserSyncStatusProjection } from '@/entrypoints/content/folders/client'
import { BrowserSyncSummary } from './BrowserSyncSummary'
import { LocalStorageDetails } from './LocalStorageDetails'
import { FolderStorageDebug } from './FolderStorageDebug'

const scenarios = [
  { id: 'recovery-healthy', label: 'Recovery · Healthy' },
  { id: 'recovery-cleanup', label: 'Recovery · Automatic cleanup succeeded' },
  { id: 'recovery-too-large', label: 'Recovery · Single point too large' },
  { id: 'recovery-budget', label: 'Recovery · Protected points hold budget' },
  { id: 'recovery-failed', label: 'Recovery · Automatic restore point failed' },
  { id: 'recovery-save-failed', label: 'Recovery · Current change not saved' },
  { id: 'recovery-protection-failed', label: 'Recovery · Pre-operation protection failed' },
  { id: 'sync-green', label: 'Browser Sync · 75% available (green)' },
  { id: 'sync-yellow', label: 'Browser Sync · 25% available (yellow)' },
  { id: 'sync-red', label: 'Browser Sync · 5% available (red)' },
  { id: 'sync-pending', label: 'Browser Sync · Local changes pending' },
  { id: 'sync-quota', label: 'Browser Sync · Capacity exceeded' },
  { id: 'sync-failed', label: 'Browser Sync · Write failed' },
  { id: 'sync-capacity', label: 'Browser Sync · Low capacity notice' },
  { id: 'sync-measurement-failed', label: 'Browser Sync · Capacity check failed' },
  { id: 'sync-checking', label: 'Browser Sync · Checking status' },
  { id: 'sync-manual', label: 'Browser Sync · Account identified manually' },
  { id: 'sync-unavailable', label: 'Browser Sync · Account unavailable' },
] as const

type Scenario = typeof scenarios[number]['id']

interface FolderDebugPanelProps {
  accountScopeId?: string
  folderCount?: number
  chatCount?: number
  isPanelOpen?: boolean
}

// This module is loaded only in development. All preview actions stay local.
export default function FolderDebugPanel({ accountScopeId, folderCount, chatCount, isPanelOpen }: FolderDebugPanelProps) {
  const [open, setOpen] = useState(false)
  const [scenario, setScenario] = useState<Scenario>('recovery-healthy')
  const [feedback, setFeedback] = useState<string>()
  const [capacityDismissed, setCapacityDismissed] = useState(false)
  const [storageOpen, setStorageOpen] = useState(false)
  useEffect(() => {
    if (isPanelOpen !== false) return
    setOpen(false)
    setScenario('recovery-healthy')
    setFeedback(undefined)
    setCapacityDismissed(false)
    setStorageOpen(false)
  }, [isPanelOpen])
  const isSync = scenario.startsWith('sync-')
  const previewAction = (action: string) => setFeedback(`Preview only: ${action}. No data or permissions changed.`)
  const recoveryStatus: FolderLocalStorageStatus = {
    snapshotBytes: 0,
    snapshotBudgetBytes: 20 * 1024 * 1024,
    low: false,
    unlimited: true,
    warning: scenario === 'recovery-budget' ? 'budget-exceeded'
      : scenario === 'recovery-too-large' ? 'snapshot-too-large'
      : scenario === 'recovery-failed' ? 'snapshot-failed' : undefined,
    automaticSnapshotFailed: ['recovery-budget', 'recovery-too-large', 'recovery-failed'].includes(scenario),
  }
  const used = scenario === 'sync-green' ? 250 : scenario === 'sync-red' ? 950 : scenario === 'sync-quota' ? 1000 : 750
  const syncStatus: BrowserSyncStatusProjection = {
    mode: 'browser-sync',
    state: scenario === 'sync-quota' || scenario === 'sync-failed' ? 'needs-attention'
      : scenario === 'sync-pending' ? 'local-changes-pending' : 'accepted-by-browser-storage',
    warning: scenario === 'sync-quota' ? 'quota-exceeded' : scenario === 'sync-failed' ? 'write-failed' : undefined,
    currentUsageBytes: used,
    usageBudgetBytes: 1000,
    currentTotalBytes: used,
    quotaBytes: 2000,
    folderCount: folderCount ?? 10,
    chatCount: chatCount ?? 52,
    showCapacityNotice: scenario === 'sync-capacity' && !capacityDismissed,
  }

  return (
    <Stack gap={3} data-control="folder-debug">
      <Button alignSelf="end" size="xs" height="28px" variant="ghost" color="gemOnSurfaceVariant" aria-expanded={open} aria-controls="folders-debug-preview" onClick={() => {
        setOpen(!open)
        setFeedback(undefined)
      }}><LuBug aria-hidden="true" />Debug</Button>
      {open ? (
        <Stack id="folders-debug-preview" gap={3} p={4} borderWidth="1px" borderStyle="dashed" borderColor="gemOnSurface/20" borderRadius="xl">
          <Text fontSize="xs" color="gemOnSurfaceVariant">Development tools · Storage data is real; scenario previews are simulated. Preview actions do not change real data or permissions.</Text>
          <Button alignSelf="start" size="xs" height="28px" variant="ghost" disabled={!accountScopeId} aria-expanded={storageOpen} aria-controls="folders-debug-storage" onClick={() => setStorageOpen(!storageOpen)}>Storage data</Button>
          {storageOpen && accountScopeId ? <Stack id="folders-debug-storage"><FolderStorageDebug key={accountScopeId} accountScopeId={accountScopeId} /></Stack> : null}
          <Field.Root>
            <Field.Label htmlFor="folders-debug-scenario" fontSize="xs">Scenario</Field.Label>
            <NativeSelect.Root size="sm" width="100%">
              <NativeSelect.Field id="folders-debug-scenario" value={scenario} onChange={(event) => {
                const selected = scenarios.find((item) => item.id === event.target.value)
                if (!selected) return
                setScenario(selected.id)
                setFeedback(undefined)
                setCapacityDismissed(false)
              }}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Stack px={4} borderWidth="1px" borderColor="gemOnSurface/8" borderRadius="2xl" data-control="folder-debug-result">
            {isSync ? (
              <BrowserSyncSummary
                key={scenario}
                accountScopeId="debug-preview"
                unavailable={scenario === 'sync-unavailable'}
                syncState={scenario === 'sync-checking' ? undefined : syncStatus}
                measuring={scenario === 'sync-checking'}
                measurementError={scenario === 'sync-measurement-failed' ? 'debug-preview' : undefined}
                onRetry={async () => { previewAction('retry sync') }}
                onDismissCapacity={() => { setCapacityDismissed(true); previewAction('dismiss capacity notice') }}
              />
            ) : (
              <Stack pt={4}>
                <Text fontSize="sm" fontWeight="medium">Data and recovery</Text>
                <LocalStorageDetails status={recoveryStatus} busy={false} onRetry={() => previewAction('retry restore point')} onExport={() => previewAction('export backup')} />
                {scenario === 'recovery-save-failed' ? <Text role="alert" pb={4} fontSize="xs" color="fg.error">This change was not saved.</Text> : null}
                {scenario === 'recovery-protection-failed' ? <Text role="alert" pb={4} fontSize="xs" color="fg.error">Could not save a restore point before this operation. The operation was not performed.</Text> : null}
                {scenario === 'recovery-healthy' || scenario === 'recovery-cleanup' ? <Text pb={4} fontSize="xs" color="gemOnSurfaceVariant">{scenario === 'recovery-cleanup' ? 'Old history was cleaned up; the restore point was saved.' : 'Restore points are healthy.'}</Text> : null}
              </Stack>
            )}
          </Stack>
          {feedback ? <Text role="status" aria-live="polite" fontSize="xs" color="gemOnSurfaceVariant">{feedback}</Text> : null}
          <HStack justify="end">
            <Button size="xs" height="28px" variant="ghost" onClick={() => { setOpen(false); setFeedback(undefined) }}>Close preview</Button>
          </HStack>
        </Stack>
      ) : null}
    </Stack>
  )
}
