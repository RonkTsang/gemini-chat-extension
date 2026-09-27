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
  details: DevLogDetails | (() => DevLogDetails) = {},
): void {
  if (!import.meta.env.DEV) {
    return
  }

  // Resolve diagnostic details only in development builds.
  const resolvedDetails = typeof details === 'function' ? details() : details
  logDevMessage(level, label, JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...resolvedDetails,
  }))
}
