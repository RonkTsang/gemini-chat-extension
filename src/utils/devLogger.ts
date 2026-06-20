type DevLogLevel = 'debug' | 'info' | 'warn' | 'error'

type DevLogDetails = Record<string, unknown>

export function logDevMessage(level: DevLogLevel, label: string, payload: unknown): void {
  if (!import.meta.env.DEV) {
    return
  }

  console[level](label, payload)
}

export function logDevEvent(
  level: Exclude<DevLogLevel, 'debug'>,
  label: string,
  event: string,
  details: DevLogDetails = {},
): void {
  if (!import.meta.env.DEV) {
    return
  }

  logDevMessage(level, label, JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details,
  }))
}
