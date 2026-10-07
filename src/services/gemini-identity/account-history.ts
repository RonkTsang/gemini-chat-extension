import { nanoid } from 'nanoid'
import { ZodError } from 'zod'
import { folderAccountHistoryResponseSchema, type FolderAccountHistory, type FolderAccountHistoryCommand } from '@/domain/folder/account-history'
import { ExtensionRpcClient } from '@/integrations/extension-rpc/client'
import type { ExtensionRpcRequest } from '@/integrations/extension-rpc/contract'
import { tt } from '@/utils/i18n'

const rpc = new ExtensionRpcClient()

async function request(command: FolderAccountHistoryCommand): Promise<FolderAccountHistory> {
  const requestId = nanoid()
  const failureMessage = command.method === 'get'
    ? tt('folders_account_history_error', 'Could not load account history. Try again.')
    : tt('folders_account_save_error', 'Could not save this email. Try again.')
  const envelope: ExtensionRpcRequest<FolderAccountHistoryCommand['params']> = {
    namespace: 'folder-accounts', protocolVersion: 1, requestId, ...command,
  }
  try {
    const response = await rpc.request(envelope, folderAccountHistoryResponseSchema)
    if (!response.ok || response.requestId !== requestId) throw new Error(failureMessage)
    return response.data
  } catch (error) {
    if (error instanceof ZodError) throw new Error(failureMessage, { cause: error })
    throw error
  }
}

export const folderAccountHistory = {
  get: () => request({ method: 'get', params: {} }),
  remember: (email: string, accountScopeId: string) => request({ method: 'remember', params: { email, accountScopeId } }),
  forget: (accountScopeId: string) => request({ method: 'forget', params: { accountScopeId } }),
}
