import {
  HiOutlineChatAlt,
  HiOutlineColorSwatch,
  HiOutlineDocumentText,
  HiOutlineHeart,
  HiOutlineLightningBolt,
  HiOutlineLink
} from 'react-icons/hi'
import type {
  NavigationGroup,
  ResolvedSettingView,
  SettingSectionDefinition,
  SettingViewComponent,
  SettingViewRegistry
} from './types'
import { t } from '@/utils/i18n'

export type NavigationSection =
  | 'chainPrompt'
  | 'quickFollowup'
  | 'chatOutline'
  | 'theme'
  | 'support'
  | 'feedback'

export const settingSectionDefinitions: SettingSectionDefinition<NavigationSection>[] = [
  {
    id: 'chainPrompt',
    label: t('settingPanel.config.chainPrompt.label'),
    group: 'prompt',
    icon: HiOutlineLink,
    title: t('settingPanel.config.chainPrompt.title'),
    description: t('settingPanel.config.chainPrompt.description'),
    views: [
      {
        id: 'index',
        title: t('settingPanel.config.chainPrompt.views.index.title'),
        description: t('settingPanel.config.chainPrompt.views.index.description'),
        componentId: 'chain-prompt/index'
      },
      {
        id: 'editor',
        title: t('settingPanel.config.chainPrompt.views.editor.title'),
        componentId: 'chain-prompt/editor'
      }
    ]
  },
  {
    id: 'quickFollowup',
    label: t('settingPanel.config.quickFollowup.label'),
    group: 'prompt',
    icon: HiOutlineLightningBolt,
    title: t('settingPanel.config.quickFollowup.title'),
    description: t('settingPanel.config.quickFollowup.description'),
    views: [
      {
        id: 'index',
        title: t('settingPanel.config.quickFollowup.views.index.title'),
        description: t('settingPanel.config.quickFollowup.views.index.description'),
        componentId: 'quick-follow-up/index'
      },
      {
        id: 'detail',
        title: t('settingPanel.config.quickFollowup.views.detail.title'),
        description: t('settingPanel.config.quickFollowup.views.detail.description'),
        componentId: 'default/detail'
      }
    ]
  },
  {
    id: 'chatOutline',
    label: t('settingPanel.config.chatOutline.label'),
    group: 'tools',
    icon: HiOutlineDocumentText,
    title: t('settingPanel.config.chatOutline.title'),
    description: t('settingPanel.config.chatOutline.description'),
    views: [
      {
        id: 'index',
        title: t('settingPanel.config.chatOutline.views.index.title'),
        description: t('settingPanel.config.chatOutline.views.index.description'),
        componentId: 'default/index'
      },
      {
        id: 'detail',
        title: t('settingPanel.config.chatOutline.views.detail.title'),
        description: t('settingPanel.config.chatOutline.views.detail.description'),
        componentId: 'default/detail'
      }
    ]
  },
  {
    id: 'theme',
    label: t('settingPanel.config.theme.label'),
    group: 'tools',
    icon: HiOutlineColorSwatch,
    title: t('settingPanel.config.theme.title'),
    description: t('settingPanel.config.theme.description'),
    views: [
      {
        id: 'index',
        title: t('settingPanel.config.theme.views.index.title'),
        description: t('settingPanel.config.theme.views.index.description'),
        componentId: 'default/index'
      },
      {
        id: 'detail',
        title: t('settingPanel.config.theme.views.detail.title'),
        description: t('settingPanel.config.theme.views.detail.description'),
        componentId: 'default/detail'
      }
    ]
  },
  {
    id: 'support',
    label: t('settingPanel.config.support.label'),
    group: 'support',
    icon: HiOutlineHeart,
    title: t('settingPanel.config.support.title'),
    description: t('settingPanel.config.support.description'),
    views: [
      {
        id: 'index',
        title: t('settingPanel.config.support.views.index.title'),
        description: t('settingPanel.config.support.views.index.description'),
        componentId: 'default/index'
      },
      {
        id: 'detail',
        title: t('settingPanel.config.support.views.detail.title'),
        description: t('settingPanel.config.support.views.detail.description'),
        componentId: 'default/detail'
      }
    ]
  },
  {
    id: 'feedback',
    label: t('settingPanel.config.feedback.label'),
    group: 'support',
    icon: HiOutlineChatAlt,
    title: t('settingPanel.config.feedback.title'),
    description: t('settingPanel.config.feedback.description'),
    views: [
      {
        id: 'index',
        title: t('settingPanel.config.feedback.views.index.title'),
        description: t('settingPanel.config.feedback.views.index.description'),
        componentId: 'default/index'
      },
      {
        id: 'detail',
        title: t('settingPanel.config.feedback.views.detail.title'),
        description: t('settingPanel.config.feedback.views.detail.description'),
        componentId: 'default/detail'
      }
    ]
  }
]

export const navigationGroups: Record<NavigationGroup, NavigationSection[]> = settingSectionDefinitions.reduce(
  (groups, section) => {
    groups[section.group] = groups[section.group] ? [...groups[section.group], section.id] : [section.id]
    return groups
  },
  {} as Record<NavigationGroup, NavigationSection[]>
)

const viewRegistry: SettingViewRegistry<NavigationSection> = {}

export function registerView(
  componentId: string,
  component: SettingViewComponent<NavigationSection>
) {
  viewRegistry[componentId] = component
}

export function getSectionDefinition(
  sectionId: NavigationSection
): SettingSectionDefinition<NavigationSection> | undefined {
  return settingSectionDefinitions.find((section) => section.id === sectionId)
}

export function getViewDefinition(
  sectionId: NavigationSection,
  viewId: string
): ResolvedSettingView<NavigationSection> | undefined {
  const section = getSectionDefinition(sectionId)
  if (!section) {
    return undefined
  }

  const viewDefinition = section.views.find((view) => view.id === viewId)
  if (!viewDefinition) {
    return undefined
  }

  const Component = viewRegistry[viewDefinition.componentId]
  if (!Component) {
    return undefined
  }

  return {
    ...viewDefinition,
    Component
  }
}

export function listViewComponentIds(): string[] {
  return settingSectionDefinitions.flatMap((section) => section.views.map((view) => view.componentId))
}

