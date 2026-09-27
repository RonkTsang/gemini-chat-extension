import { logDevEvent } from '../devLogger'

export function logLibraryTrace(stage: string, details: () => Record<string, unknown>): void {
  logDevEvent('info', '[LibraryTrace]', stage, details)
}
