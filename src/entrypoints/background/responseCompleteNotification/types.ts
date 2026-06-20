import type { Browser, browser } from 'wxt/browser'
import type { ResponseNotificationContentType } from '@/types/runtime-messages'

export type NotificationsApi = typeof browser.notifications

export type BrowserWithOptionalNotifications = typeof browser & {
  notifications?: NotificationsApi
}

export type BrowserWithOptionalAction = typeof browser & {
  action?: {
    openPopup?: (details?: { windowId?: number }) => Promise<void> | void
  }
  windows: typeof browser.windows & {
    create?: typeof browser.windows.create
  }
}

export type RuntimeMessageSender = Parameters<
  Parameters<typeof browser.runtime.onMessage.addListener>[0]
>[1]

export type WebRequestCompletedListener = Parameters<typeof browser.webRequest.onCompleted.addListener>[0]
export type WebRequestCompletedDetails = Parameters<WebRequestCompletedListener>[0]
export type WebRequestBeforeRequestListener = Parameters<typeof browser.webRequest.onBeforeRequest.addListener>[0]
export type WebRequestBeforeRequestDetails = Parameters<WebRequestBeforeRequestListener>[0]

export type NotificationSource = 'response-complete' | 'test'
export type CompletionKind = 'standard-response' | 'deep-research'
export type DeepResearchPollObservationSource = 'before-request' | 'completed-fallback'
export type DeepResearchHistoryObservationSource = 'history-completed'
export type ImageNotificationPresentation = 'basic-icon' | 'image-template'

export interface ImageNotificationPresentationResult {
  presentation: ImageNotificationPresentation
  platformOs: string
}

export interface NotificationTarget {
  tabId?: number
  title: string
  message: string
  timestamp: number
  source: NotificationSource
  completionKind?: CompletionKind
  responseType: ResponseNotificationContentType
  imageDataUrl?: string
}

export interface ParsedNotificationId {
  source: NotificationSource
  tabId?: number
  timestamp: number
}

export type BrowserTab = Browser.tabs.Tab
