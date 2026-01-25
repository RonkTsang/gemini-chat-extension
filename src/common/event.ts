import { NavigationSection } from "@/components/setting-panel/config";
import type { MediaItem } from "@/utils/stuffMediaParser";

export const GEM_EXT_EVENTS = {
  URL_CHANGE: 'gem-ext:urlchange',
  STUFF_MEDIA_DATA: 'gem-ext:stuff-media-data',
} as const

export const EVENTS = {
  QUICK_FOLLOW_UP_SHOW: 'quick-follow-up:show',
  QUICK_FOLLOW_UP_HIDE: 'quick-follow-up:hide',
  QUICK_FOLLOW_UP_ADD_QUOTE: 'quick-follow-up:addQuote',
} as const;

export interface URLChangeEvent {
  url: string
  timestamp: number
}

export interface ChatChangeEvent {
  originalUrl: string
  currentUrl: string
  timestamp: number
  isFromNewChat: boolean
}

export interface StuffMediaDataEvent {
  items: MediaItem[]
  nextPageToken?: string
  timestamp: number
}

export interface AppEvents {
  // common
  'urlchange': URLChangeEvent;
  'chatchange': ChatChangeEvent;

  // Stuff Page
  'stuff-media:data-received': StuffMediaDataEvent;

  // Quick Follow Up
  'quick-follow-up:show': {
    text: string;
    event: {
      rangeRect: DOMRect;
      clientX: number;
      clientY: number;
    };
  };
  'quick-follow-up:hide': undefined;

  'quick-follow-up:addQuote': {
    text: string;
  };

  // settings panel
  'settings:open': {
    from: 'prompt-entrance' | 'popup',
    open: boolean
    module?: NavigationSection
  };
  'settings:close': {
    from: 'run-modal' | 'manual',
    reason?: string
  };
  /**
   * Emitted when the settings panel state changes
   * @param data.open - Whether the settings panel is open
   */
  'settings:state-changed': {
    open: boolean
  };

  // Chain Prompt
  'execution:aborted-by-chat-switch': {
    reason: 'chat_switched',
    originalUrl: string,
    currentUrl: string,
    timestamp: number
  };

  // Chat Outline
  'chatoutline:open': {
    source?: string
  };
}