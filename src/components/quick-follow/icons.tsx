import type { IconType } from 'react-icons'
import {
  AiOutlineBook,
  AiOutlineBulb,
  AiOutlineCheckCircle,
  AiOutlineCode,
  AiOutlineEdit,
  AiOutlineFileText,
  AiOutlineGlobal,
  AiOutlineMessage,
  AiOutlineQuestionCircle,
  AiOutlineSetting,
  AiOutlineThunderbolt,
  AiOutlineTranslation,
  AiOutlineStar,
  AiOutlineHeart,
  AiOutlineShareAlt,
  AiOutlineDownload,
  AiOutlineSearch,
  AiOutlineFilter,
  AiOutlineReload,
  AiOutlineCopy,
  AiOutlineLink,
  AiOutlinePicture,
  AiOutlineVideoCamera,
  AiOutlineCalendar,
  AiOutlineClockCircle,
  AiOutlineTags
} from 'react-icons/ai'

import {
  QUICK_FOLLOW_ICON_KEYS,
  type QuickFollowIconKey
} from '@/domain/quick-follow/iconKeys'

export interface QuickFollowIconDefinition {
  key: QuickFollowIconKey
  label: string
  Icon: IconType
}

const ICON_MAP: Record<QuickFollowIconKey, QuickFollowIconDefinition> = {
  sparkles: {
    key: 'sparkles',
    label: 'Sparkles',
    Icon: AiOutlineThunderbolt
  },
  translate: {
    key: 'translate',
    label: 'Translate',
    Icon: AiOutlineTranslation
  },
  bulb: {
    key: 'bulb',
    label: 'Idea',
    Icon: AiOutlineBulb
  },
  book: {
    key: 'book',
    label: 'Summarize',
    Icon: AiOutlineBook
  },
  code: {
    key: 'code',
    label: 'Code',
    Icon: AiOutlineCode
  },
  chat: {
    key: 'chat',
    label: 'Explain',
    Icon: AiOutlineMessage
  },
  pen: {
    key: 'pen',
    label: 'Rewrite',
    Icon: AiOutlineEdit
  },
  check: {
    key: 'check',
    label: 'Validate',
    Icon: AiOutlineCheckCircle
  },
  gear: {
    key: 'gear',
    label: 'Adjust',
    Icon: AiOutlineSetting
  },
  globe: {
    key: 'globe',
    label: 'Global',
    Icon: AiOutlineGlobal
  },
  clipboard: {
    key: 'clipboard',
    label: 'Note',
    Icon: AiOutlineFileText
  },
  question: {
    key: 'question',
    label: 'Clarify',
    Icon: AiOutlineQuestionCircle
  },
  star: {
    key: 'star',
    label: 'Star',
    Icon: AiOutlineStar
  },
  share: {
    key: 'share',
    label: 'Share',
    Icon: AiOutlineShareAlt
  },
  download: {
    key: 'download',
    label: 'Download',
    Icon: AiOutlineDownload
  },
  search: {
    key: 'search',
    label: 'Search',
    Icon: AiOutlineSearch
  },
  filter: {
    key: 'filter',
    label: 'Filter',
    Icon: AiOutlineFilter
  },
  refresh: {
    key: 'refresh',
    label: 'Refresh',
    Icon: AiOutlineReload
  },
  copy: {
    key: 'copy',
    label: 'Copy',
    Icon: AiOutlineCopy
  },
  link: {
    key: 'link',
    label: 'Link',
    Icon: AiOutlineLink
  },
  image: {
    key: 'image',
    label: 'Image',
    Icon: AiOutlinePicture
  },
  video: {
    key: 'video',
    label: 'Video',
    Icon: AiOutlineVideoCamera
  },
  calendar: {
    key: 'calendar',
    label: 'Calendar',
    Icon: AiOutlineCalendar
  },
  tag: {
    key: 'tag',
    label: 'Tag',
    Icon: AiOutlineTags
  }
}

export const ICON_CATALOG: QuickFollowIconDefinition[] = QUICK_FOLLOW_ICON_KEYS.map(
  key => ICON_MAP[key]
)

export function getIconDefinition(key: QuickFollowIconKey): QuickFollowIconDefinition {
  return ICON_MAP[key] ?? ICON_MAP.sparkles
}

