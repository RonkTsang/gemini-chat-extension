import { Box, Button, Field, Flex, HStack, IconButton, Input, Separator, Stack, Text } from '@chakra-ui/react'
import { useEffect, useId, useRef, useState } from 'react'
import { LuArrowRightLeft, LuCheck, LuChevronUp, LuInfo, LuPlus, LuRefreshCw, LuUserRound, LuX } from 'react-icons/lu'

import { Tooltip } from '@/components/ui/tooltip'
import { folderAccountEmailSchema, type FolderAccountHistory } from '@/domain/folder/account-history'
import { folderRuntime } from '@/entrypoints/content/folders/runtime'
import type { GeminiIdentityResult } from '@/services/gemini-identity'
import { tt } from '@/utils/i18n'
import { settingsToaster } from '../../toaster'

interface FolderAccountSectionProps {
  identity: GeminiIdentityResult
  error?: string
  isPanelOpen?: boolean
  routeParams?: Record<string, unknown>
  busy: boolean
}

const controlStyles = { h: '32px', minH: '32px', borderRadius: 'lg', fontSize: 'sm' } as const

export function FolderAccountSection({ identity, error, isPanelOpen, routeParams, busy: externalBusy }: FolderAccountSectionProps) {
  const account = identity.status === 'available' ? identity.identity : undefined
  const [failedAvatar, setFailedAvatar] = useState<string>()
  const avatarKey = `${account?.accountScopeId}:${account?.avatarUrl}`
  const [expanded, setExpanded] = useState(false)
  const [enteringEmail, setEnteringEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [history, setHistory] = useState<FolderAccountHistory>({ accounts: [] })
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string>()
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [working, setWorking] = useState<string>()
  const pendingWork = useRef<string | undefined>(undefined)
  const historyRequest = useRef(0)
  const panelOpen = useRef(isPanelOpen !== false)
  const emailInput = useRef<HTMLInputElement>(null)
  const firstChoice = useRef<HTMLButtonElement>(null)
  const otherEmail = useRef<HTMLButtonElement>(null)
  const emailId = useId()
  const chooserVisible = !account || expanded
  const formVisible = chooserVisible && (enteringEmail || (!historyLoading && !history.accounts.length))
  const busy = externalBusy || working !== undefined
  const firstSelectable = history.accounts.find((saved) => saved.accountScopeId !== account?.accountScopeId)?.accountScopeId

  useEffect(() => {
    panelOpen.current = isPanelOpen !== false
    return () => { panelOpen.current = false }
  }, [isPanelOpen])

  useEffect(() => {
    setExpanded(false)
    setEnteringEmail(false)
    setEmail('')
    setEmailError(undefined)
    setActionError(undefined)
  }, [account?.accountScopeId, account?.source])

  useEffect(() => {
    if (isPanelOpen !== false && routeParams?.chooseAccount === true && account?.source !== 'observed') setExpanded(true)
  }, [isPanelOpen, routeParams])

  useEffect(() => {
    if (isPanelOpen === false) return
    const request = ++historyRequest.current
    setHistoryLoading(true)
    setHistoryError(undefined)
    void folderRuntime.getAccountHistory().then((next) => {
      if (request !== historyRequest.current) return
      setHistory(next)
      setHistoryLoading(false)
    }, () => {
      if (request !== historyRequest.current) return
      setHistoryError(tt('folders_account_history_error', 'Could not load account history. Try again.'))
      setHistoryLoading(false)
    })
    return () => { ++historyRequest.current }
  }, [isPanelOpen, account?.accountScopeId, chooserVisible, historyRefresh])

  useEffect(() => {
    if (isPanelOpen === false || !chooserVisible || historyLoading) return
    if (formVisible) emailInput.current?.focus()
    else (firstChoice.current ?? otherEmail.current)?.focus()
  }, [isPanelOpen, chooserVisible, historyLoading, formVisible])

  const run = async (name: string, action: () => Promise<void>) => {
    if (externalBusy || pendingWork.current) return
    pendingWork.current = name
    setWorking(name)
    setActionError(undefined)
    try {
      await action()
    } catch (nextError) {
      if (panelOpen.current) {
        const message = nextError instanceof Error ? nextError.message : tt('folders_account_save_error', 'Could not save this email. Try again.')
        if (name === 'email') setEmailError(message)
        else setActionError(message)
      }
    } finally {
      pendingWork.current = undefined
      setWorking(undefined)
    }
  }

  const status = account?.source === 'observed'
    ? tt('folders_account_detected', 'Account identified')
    : account?.selection === 'recent'
      ? tt('folders_account_status_saved', 'Using saved account')
      : tt('folders_account_status_manual', 'Saved on this browser')

  return (
    <Stack as="section" aria-label={tt('folders_account_title', 'Folders account')} data-control="folder-account" gap={4} px={1}>
      {error ? <Text role="alert" color="fg.error" fontSize="sm">{error}</Text> : null}
      <Flex direction={{ base: 'column', sm: 'row' }} align={{ base: 'stretch', sm: 'center' }} justify="space-between" gap={3}>
        <HStack gap={3} flex={1} minW={0}>
          <Box boxSize="40px" flexShrink={0} bg="gemOnSurface/4" color="gemOnSurfaceVariant" borderRadius="xl" overflow="hidden" display="grid" placeItems="center">
            {account?.avatarUrl && failedAvatar !== avatarKey ? (
              <img src={account.avatarUrl} alt="" width={40} height={40}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setFailedAvatar(avatarKey)} />
            ) : <LuUserRound size={20} aria-hidden />}
          </Box>
          <Stack gap={1} minW={0}>
            {account ? (
              <>
                <Text fontSize="md" fontWeight="semibold" lineHeight="short" overflowWrap="anywhere">{account.email}</Text>
                {account.source === 'observed' ? (
                  <HStack gap={1} color="gemOnSurfaceVariant" fontSize="xs"><LuCheck size={12} aria-hidden /><Text>{status}</Text></HStack>
                ) : (
                  <Tooltip content={account.selection === 'recent'
                    ? tt('folders_account_restored', 'Using your last account because the current Gemini email could not be identified.')
                    : tt('folders_manual_scope_notice', 'Your selected email is remembered for future visits.')}>
                    <HStack as="span" tabIndex={0} gap={1} color="gemOnSurfaceVariant" fontSize="xs" alignSelf="start">
                      <Text as="span">{status}</Text><LuInfo size={12} aria-hidden />
                    </HStack>
                  </Tooltip>
                )}
              </>
            ) : <Text fontSize="sm" color="gemOnSurfaceVariant">{tt('folders_account_choose_help', 'Choose your Gemini account to use Folders.')}</Text>}
          </Stack>
        </HStack>
        <HStack gap={2} flexShrink={0} alignSelf={{ base: 'start', sm: 'auto' }}>
          {account?.source === 'manual-confirmed' ? (
            expanded ? (
              <Tooltip content={tt('folders_account_collapse', 'Collapse')}>
                <IconButton size="xs" boxSize="24px" minW="24px" variant="ghost" color="gemOnSurfaceVariant" borderRadius="md"
                  disabled={busy} aria-expanded={true} aria-label={tt('folders_account_collapse', 'Collapse')}
                  onClick={() => { setExpanded(false); setEnteringEmail(false); setEmailError(undefined); setActionError(undefined) }}>
                  <LuChevronUp size={16} />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip content={tt('folders_switch_account', 'Switch account')}>
                <IconButton size="xs" boxSize="24px" minW="24px" variant="ghost" color="gemOnSurfaceVariant" borderRadius="md"
                  disabled={busy} aria-expanded={false} aria-label={tt('folders_switch_account', 'Switch account')}
                  onClick={() => { setExpanded(true); setEnteringEmail(false); setEmailError(undefined); setActionError(undefined) }}>
                  <LuArrowRightLeft size={16} />
                </IconButton>
              </Tooltip>
            )
          ) : null}
          <Tooltip content={tt('folders_refresh', 'Refresh')}>
            <IconButton {...controlStyles} size="sm" w="32px" minW="32px" variant="ghost" color="gemOnSurfaceVariant"
              aria-label={tt('folders_refresh', 'Refresh')} disabled={busy} loading={working === 'reload'}
              onClick={() => void run('reload', async () => { await folderRuntime.reload(); setHistoryRefresh((value) => value + 1) })}>
              <LuRefreshCw size={16} />
            </IconButton>
          </Tooltip>
        </HStack>
      </Flex>
      {actionError ? <Text role="alert" fontSize="xs" color="fg.error">{actionError}</Text> : null}
      {chooserVisible ? (
        <Stack gap={4} p={4} bg="gemOnSurface/4" borderRadius="xl" data-control="account-chooser">
          <Text fontSize="sm" fontWeight="medium">{tt('folders_account_choose', 'Choose an account')}</Text>
          {historyError ? (
            <HStack gap={2}>
              <Text role="alert" fontSize="xs" color="fg.error" flex={1}>{historyError}</Text>
              <Button {...controlStyles} size="sm" variant="ghost" disabled={busy} onClick={() => setHistoryRefresh((value) => value + 1)}>{tt('folders_refresh', 'Refresh')}</Button>
            </HStack>
          ) : null}
          {historyLoading && !history.accounts.length ? <Text role="status" fontSize="xs" color="gemOnSurfaceVariant">{tt('folders_account_loading', 'Loading saved accounts…')}</Text> : null}
          {history.accounts.length ? (
            <Stack gap={2}>
              <Text fontSize="xs" color="gemOnSurfaceVariant">{tt('folders_account_saved_list', 'Saved accounts')}</Text>
              <Stack gap={1} maxH="200px" overflowY="auto" aria-busy={historyLoading}>
                {history.accounts.map((saved) => {
                  const current = saved.accountScopeId === account?.accountScopeId
                  return (
                    <HStack key={saved.accountScopeId} gap={1} minH="40px" px={1} borderRadius="lg" bg={current ? 'gemOnSurface/4' : 'transparent'}>
                      <Button ref={saved.accountScopeId === firstSelectable ? firstChoice : undefined} {...controlStyles} size="sm" variant="ghost"
                        flex={1} minW={0} px={2} justifyContent="start" color="gemOnSurface" disabled={busy || current} _disabled={{ opacity: current ? 1 : 0.4 }}
                        onClick={() => void run(`select:${saved.accountScopeId}`, async () => {
                          await folderRuntime.selectSavedAccount(saved.email)
                          setExpanded(false)
                          setEnteringEmail(false)
                        })}>
                        <LuUserRound size={16} aria-hidden /><Text truncate>{saved.email}</Text>
                      </Button>
                      {current ? <Text fontSize="xs" color="gemOnSurfaceVariant" px={1} flexShrink={0}>{tt('folders_account_selected', 'Current')}</Text> : null}
                      <Tooltip content={tt('folders_forget_account', 'Remove from account history')}>
                        <IconButton size="xs" boxSize="24px" minW="24px" variant="ghost" color="gemOnSurfaceVariant" borderRadius="md" disabled={busy}
                          aria-label={`${tt('folders_forget_account', 'Remove from account history')}: ${saved.email}`}
                          onClick={() => void run(`forget:${saved.accountScopeId}`, async () => {
                            ++historyRequest.current
                            setHistoryLoading(false)
                            setHistory(await folderRuntime.forgetAccount(saved.accountScopeId))
                            setHistoryLoading(false)
                          })}>
                          <LuX size={14} />
                        </IconButton>
                      </Tooltip>
                    </HStack>
                  )
                })}
              </Stack>
              <Text fontSize="xs" color="gemOnSurfaceVariant" lineHeight="tall">{tt('folders_account_forget_help', 'Removing an account here keeps its Folder data.')}</Text>
            </Stack>
          ) : null}
          {!formVisible ? (
            <Button ref={otherEmail} {...controlStyles} size="sm" variant="ghost" alignSelf="start" px={2} disabled={busy}
              onClick={() => { setEnteringEmail(true); setEmailError(undefined) }}>
              <LuPlus size={16} aria-hidden />{tt('folders_account_other_email', 'Use another email')}
            </Button>
          ) : (
            <>
              {history.accounts.length ? <Separator borderColor="gemOnSurface/8" /> : null}
              <form noValidate onSubmit={(event) => {
                event.preventDefault()
                const parsed = folderAccountEmailSchema.safeParse(email)
                if (!parsed.success) { setEmailError(tt('folders_account_email_invalid', 'Enter a valid email address.')); return }
                setEmailError(undefined)
                void run('email', async () => {
                  await folderRuntime.confirmManualEmail(parsed.data)
                  setExpanded(false)
                  setEnteringEmail(false)
                  setEmail('')
                  if (panelOpen.current) settingsToaster.create({ type: 'success', closable: true, title: tt('folders_manual_email_confirmed', 'Email saved and selected.') })
                })
              }}>
                <Field.Root invalid={!!emailError}>
                  <Field.Label htmlFor={emailId} fontSize="xs" color="gemOnSurfaceVariant">{tt('folders_account_email_label', 'Gemini email')}</Field.Label>
                  <Flex width="100%" gap={2} direction={{ base: 'column', sm: 'row' }}>
                    <Input ref={emailInput} id={emailId} {...controlStyles} size="sm" minW={0} flex={1} value={email} disabled={busy}
                      onChange={(event) => { setEmail(event.target.value); setEmailError(undefined) }} placeholder="you@example.com" type="email" autoComplete="email" spellCheck={false} />
                    <Button {...controlStyles} size="sm" type="submit" disabled={busy || !email.trim()} loading={working === 'email'} flexShrink={0} alignSelf={{ base: 'start', sm: 'auto' }}>
                      {tt('folders_account_use_email', 'Use this email')}
                    </Button>
                  </Flex>
                  <Field.ErrorText fontSize="xs">{emailError}</Field.ErrorText>
                  <Field.HelperText fontSize="xs" lineHeight="tall">{tt('folders_manual_email_help', 'Use your current Gemini email to load its Folder settings and enable Browser Sync.')}</Field.HelperText>
                </Field.Root>
              </form>
            </>
          )}
        </Stack>
      ) : null}
    </Stack>
  )
}
