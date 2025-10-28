import { NavigationSection } from "@/components/setting-panel/config";

// 事件常量
export const GEM_EXT_EVENTS = {
  URL_CHANGE: 'gem-ext:urlchange',
} as const

export interface AppEvents {
  'settings:open': {
    from: 'prompt-entrance' | 'popup',
    open: boolean
    module?: NavigationSection
  };
  'settings:close': {
    from: 'run-modal' | 'manual',
    reason?: string
  };
  'execution:aborted-by-chat-switch': {
    reason: 'chat_switched',
    originalUrl: string,
    currentUrl: string,
    timestamp: number
  };
  'chatoutline:open': {
    source?: string
  };
}