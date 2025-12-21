import {
  HiOutlineColorSwatch,
  HiOutlineDocumentText,
  HiOutlineInformationCircle,
  HiOutlineLightningBolt,
  HiOutlineLink
} from 'react-icons/hi'
import { ImagePromptIcon } from '@/components/icons'
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
  | 'imagePrompt'
  | 'chatOutline'
  | 'theme'
  | 'about'

export const settingSectionDefinitions: SettingSectionDefinition<NavigationSection>[] = [
  {
    id: 'quickFollowup',
    label: t('settingPanel.config.quickFollowup.label'),
    group: 'prompt',
    icon: HiOutlineLightningBolt,
    title: t('settingPanel.config.quickFollowup.title'),
    views: [
      {
        id: 'index',
        title: t('settingPanel.config.quickFollowup.views.index.title'),
        description: t('settingPanel.config.quickFollowup.views.index.description'),
        componentId: 'quick-follow-up/index'
      }
    ]
  },
  {
    id: 'chainPrompt',
    label: t('settingPanel.config.chainPrompt.label'),
    group: 'prompt',
    icon: HiOutlineLink,
    title: t('settingPanel.config.chainPrompt.title'),
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
        description: '',
        componentId: 'chain-prompt/editor'
      }
    ]
  },
  {
    id: 'imagePrompt',
    label: t('settingPanel.config.imagePrompt.label'),
    group: 'prompt',
    icon: ImagePromptIcon as any,
    title: t('settingPanel.config.imagePrompt.title'),
    views: [
      {
        id: 'index',
        title: t('settingPanel.config.imagePrompt.views.index.title'),
        componentId: 'default/index'
      }
    ]
  },
  {
    id: 'chatOutline',
    label: t('settingPanel.config.chatOutline.label'),
    group: 'tools',
    icon: HiOutlineDocumentText,
    title: t('settingPanel.config.chatOutline.title'),
    views: [
      {
        id: 'index',
        title: t('settingPanel.config.chatOutline.views.index.title'),
        description: t('settingPanel.config.chatOutline.views.index.description'),
        componentId: 'chat-outline/index'
      }
    ]
  },
  {
    id: 'theme',
    label: t('settingPanel.config.theme.label'),
    group: 'tools',
    icon: HiOutlineColorSwatch,
    title: t('settingPanel.config.theme.title'),
    views: [
      {
        id: 'index',
        title: t('settingPanel.config.theme.views.index.title'),
        componentId: 'default/index'
      }
    ]
  },
  {
    id: 'about',
    label: t('settingPanel.config.about.label'),
    group: 'support',
    icon: HiOutlineInformationCircle,
    title: t('settingPanel.config.about.title'),
    description: '',
    views: [
      {
        id: 'index',
        title: t('settingPanel.config.about.views.index.title'),
        description: '',
        componentId: 'about/index'
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

