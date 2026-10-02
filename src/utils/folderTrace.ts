import { nanoid } from 'nanoid'
import { logDevError, logDevEvent } from './devLogger'

const LOG_PREFIX = '[Folders][membership.add]'

export interface FolderTraceDetails {
  accountScopeId?: string
  chatId?: string
  folderId?: string
  membershipId?: string
  [key: string]: unknown
}

function traceDetails(traceId: string, step: string, details?: FolderTraceDetails) {
  return {
    traceId,
    step,
    ...details,
  }
}

/** A correlation id shared by the menu, local write, projection refresh, and sync request. */
export function createFolderTraceId(): string {
  return `membership-add-${nanoid(10)}`
}

export function logFolderTrace(
  traceId: string,
  step: string,
  details?: FolderTraceDetails,
): void {
  logDevEvent('info', LOG_PREFIX, step, traceDetails(traceId, step, details))
}

export function logFolderTraceError(
  traceId: string,
  step: string,
  error: unknown,
  details?: FolderTraceDetails,
): void {
  logDevError(LOG_PREFIX, step, error, traceDetails(traceId, step, details))
}
