import { nanoid } from 'nanoid'

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

function serializeError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return { message: String(error) }
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
  console.info(LOG_PREFIX, traceDetails(traceId, step, details))
}

export function logFolderTraceError(
  traceId: string,
  step: string,
  error: unknown,
  details?: FolderTraceDetails,
): void {
  console.error(LOG_PREFIX, {
    ...traceDetails(traceId, step, details),
    error: serializeError(error),
  })
}
