export type DevLogLevel = 'debug' | 'info' | 'warn' | 'error'

type DevLogDetails = Record<string, unknown>

function serializeError(error: unknown): unknown {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack }
  return error
}

export function logDevMessage(level: DevLogLevel, label: string, payload: unknown): void {
  if (!import.meta.env.DEV) {
    return
  }

  console[level](label, payload)
}

export function logDevEvent(
  level: DevLogLevel,
  label: string,
  event: string,
  details: DevLogDetails = {},
): void {
  if (!import.meta.env.DEV) {
    return
  }

  logDevMessage(level, label, {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  })
}

export function logDevError(label: string, event: string, error: unknown, details: DevLogDetails = {}): void {
  logDevEvent('error', label, event, { ...details, error: serializeError(error) })
}
