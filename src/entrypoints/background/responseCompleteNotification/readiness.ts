import type { NotificationReadiness } from '@/services/responseCompleteNotificationSettings'

export function isSendableReadiness(readiness: NotificationReadiness): boolean {
  return readiness === 'allowed' || readiness === 'allowed-but-system-unknown'
}
