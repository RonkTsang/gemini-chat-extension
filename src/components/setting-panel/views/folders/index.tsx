import {
  Box,
  Button,
  Container,
  HStack,
  Separator,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { folderRuntime } from '@/entrypoints/content/folders/runtime'
import { tt } from '@/utils/i18n'
import type { SettingViewComponent } from '../../types'
import { FolderAccountSection } from './FolderAccountSection'
import { BrowserSyncSummary } from './BrowserSyncSummary'
import { SettingsSection } from './SettingsSection'
import { RecoverySection } from './RecoverySection'
import { settingsToaster } from '../../toaster'

type DetailsKey = 'storage'
type DetailsRequest = { accountScopeId: string; loading: boolean; error?: string }

type PreferenceKey = 'enabled' | 'hideOrganizedChats'
type PendingPreference = { accountScopeId: string; value: boolean }

const FolderDebugPanel = import.meta.env.DEV ? lazy(() => import('./FolderDebugPanel')) : undefined

export const FoldersSettingsView: SettingViewComponent = ({ isPanelOpen, route }) => {
  const state = useSyncExternalStore(folderRuntime.subscribe, folderRuntime.getSnapshot, folderRuntime.getSnapshot)
  const [working, setWorking] = useState<string>()
  const [pendingPreferences, setPendingPreferences] = useState<Partial<Record<PreferenceKey, PendingPreference>>>({})
  const pendingPreferencesRef = useRef<Partial<Record<PreferenceKey, PendingPreference>>>({})
  const panelOpen = useRef(isPanelOpen !== false)
  const [detailsRequests, setDetailsRequests] = useState<Partial<Record<DetailsKey, DetailsRequest>>>({})
  const detailsRequestsRef = useRef<Partial<Record<DetailsKey, DetailsRequest>>>({})
  const projection = state.projection
  const identity = state.identity
  const accountScopeId = identity.status === 'available' ? identity.identity.accountScopeId : undefined

  useEffect(() => {
    panelOpen.current = isPanelOpen !== false
    return () => { panelOpen.current = false }
  }, [isPanelOpen])

  const storageRequest = detailsRequests.storage?.accountScopeId === accountScopeId ? detailsRequests.storage : undefined

  const readDetails = async <Result,>(key: DetailsKey, read: () => Promise<Result>, onSuccess?: (result: Result) => void) => {
    const pending = detailsRequestsRef.current[key]
    if (!accountScopeId || (pending?.accountScopeId === accountScopeId && pending.loading)) return
    const request: DetailsRequest = { accountScopeId, loading: true }
    detailsRequestsRef.current[key] = request
    setDetailsRequests({ ...detailsRequestsRef.current })
    const isCurrent = () => {
      const currentIdentity = folderRuntime.getSnapshot().identity
      return detailsRequestsRef.current[key] === request
        && currentIdentity.status === 'available'
        && currentIdentity.identity.accountScopeId === accountScopeId
    }
    let requestError: string | undefined
    try {
      const result = await read()
      if (isCurrent()) onSuccess?.(result)
    } catch (nextError) {
      if (isCurrent()) requestError = nextError instanceof Error ? nextError.message : tt('folders_save_failed', 'Could not complete this action.')
    } finally {
      if (detailsRequestsRef.current[key] === request) {
        detailsRequestsRef.current[key] = { ...request, loading: false, error: requestError }
        setDetailsRequests({ ...detailsRequestsRef.current })
      }
    }
  }

  useEffect(() => {
    if (!accountScopeId || isPanelOpen === false) return
    void readDetails('storage', () => folderRuntime.measureBrowserSyncUsage())
  }, [accountScopeId, isPanelOpen])

  const run = async (name: string, action: () => Promise<void>) => {
    setWorking(name)
    try {
      await action()
    } catch (nextError) {
      if (panelOpen.current) settingsToaster.create({ type: 'error', closable: true, title: nextError instanceof Error ? nextError.message : tt('folders_save_failed', 'Could not complete this action.') })
    } finally {
      setWorking(undefined)
    }
  }

  const savePreference = async (key: PreferenceKey, value: boolean) => {
    if (!accountScopeId || pendingPreferencesRef.current[key]?.accountScopeId === accountScopeId) return
    const pending = { accountScopeId, value }
    pendingPreferencesRef.current[key] = pending
    setPendingPreferences({ ...pendingPreferencesRef.current })
    try {
      await folderRuntime.updateSettings({ [key]: value })
    } catch (nextError) {
      const identity = folderRuntime.getSnapshot().identity
      if (panelOpen.current && identity.status === 'available' && identity.identity.accountScopeId === accountScopeId) {
        settingsToaster.create({ type: 'error', closable: true, title: nextError instanceof Error ? nextError.message : tt('folders_save_failed', 'Could not complete this action.') })
      }
    } finally {
      if (pendingPreferencesRef.current[key] === pending) {
        delete pendingPreferencesRef.current[key]
        setPendingPreferences({ ...pendingPreferencesRef.current })
      }
    }
  }

  const pendingEnabled = pendingPreferences.enabled?.accountScopeId === accountScopeId ? pendingPreferences.enabled : undefined
  const pendingHide = pendingPreferences.hideOrganizedChats?.accountScopeId === accountScopeId ? pendingPreferences.hideOrganizedChats : undefined

  const unavailable = identity.status !== 'available'
  const capacityNoticeUsagePercent = state.syncState?.usagePercent
  const busy = working !== undefined

  return (
    <Box
      position="relative"
      height="100%"
      display="flex"
      flexDirection="column"
      data-view="folders-settings"
      color="gemOnSurface"
    >
      <Box flex="1" minHeight={0} overflow="auto">
        <Container maxWidth="740px" px={0}>
          <Stack align="stretch" gap={8} pb={2}>
            <FolderAccountSection identity={identity} error={state.error} isPanelOpen={isPanelOpen} routeParams={route.params} busy={busy} />

            <SettingsSection id="folders-preferences-title" title={tt('folders_settings', 'Folder settings')} hideTitle>
              <Switch.Root
                checked={pendingEnabled?.value ?? projection?.settings.enabled ?? false}
                disabled={unavailable || !projection || busy}
                readOnly={!!pendingEnabled}
                aria-busy={!!pendingEnabled}
                onCheckedChange={(event) => void savePreference('enabled', event.checked)}
                display="flex" width="100%" justifyContent="space-between" alignItems="center" gap={4} py={4}
              >
                <Switch.HiddenInput />
                <Switch.Label fontSize="sm" fontWeight="medium">{tt('folders_enabled', 'Enable Folders')}</Switch.Label>
                <Switch.Control flexShrink={0}><Switch.Thumb /></Switch.Control>
              </Switch.Root>
              <Separator borderColor="gemOnSurface/6" />
              <Switch.Root
                checked={pendingHide?.value ?? projection?.settings.hideOrganizedChats ?? false}
                disabled={unavailable || !projection || busy}
                readOnly={!!pendingHide}
                aria-busy={!!pendingHide}
                onCheckedChange={(event) => void savePreference('hideOrganizedChats', event.checked)}
                display="flex" width="100%" justifyContent="space-between" alignItems="center" gap={4} py={4}
              >
                <Switch.HiddenInput aria-describedby="folders-hide-help" />
                <Stack as="span" gap={1} flex={1} minWidth={0}>
                  <Switch.Label fontSize="sm" fontWeight="medium">{tt('folders_hide_organized', 'Hide chats already added to a Folder')}</Switch.Label>
                  <Text as="span" id="folders-hide-help" fontSize="xs" color="gemOnSurfaceVariant" lineHeight="tall">
                    {tt('folders_hide_organized_help', 'Only hides matching rows in Gemini Recents. It never deletes Gemini chats.')}
                  </Text>
                </Stack>
                <Switch.Control flexShrink={0}><Switch.Thumb /></Switch.Control>
              </Switch.Root>
            </SettingsSection>

            <SettingsSection id="folders-sync-title" title={tt('folders_browser_sync', 'Browser Sync')}>
              <BrowserSyncSummary
                accountScopeId={accountScopeId}
                isPanelOpen={isPanelOpen}
                unavailable={unavailable}
                syncState={state.syncState}
                measuring={storageRequest?.loading ?? false}
                measurementError={storageRequest?.error}
                onRetry={() => folderRuntime.syncNow()}
                onDismissCapacity={() => {
                  if (capacityNoticeUsagePercent !== undefined) {
                    void run('dismiss-capacity', () => folderRuntime.dismissCapacityNotice(capacityNoticeUsagePercent))
                  }
                }}
              />
            </SettingsSection>

            <RecoverySection
              key={accountScopeId ?? 'unavailable'}
              accountScopeId={accountScopeId}
              isPanelOpen={isPanelOpen}
              warning={state.syncState?.localRecoveryWarning}
              automaticSnapshotFailed={state.syncState?.localAutomaticSnapshotFailed}
            />
            {FolderDebugPanel ? (
              <Suspense fallback={null}>
                <FolderDebugPanel key={accountScopeId ?? 'unavailable'} accountScopeId={accountScopeId} isPanelOpen={isPanelOpen} folderCount={state.syncState?.folderCount} chatCount={state.syncState?.chatCount} />
              </Suspense>
            ) : null}
          </Stack>
        </Container>
      </Box>

    </Box>
  )
}

FoldersSettingsView.displayName = 'FoldersSettingsView'
