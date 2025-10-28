import type { ComponentType, FC } from 'react'

export type NavigationGroup = 'prompt' | 'tools' | 'support'

export interface SettingRoute<TSection extends string = string> {
  sectionId: TSection
  viewId: string
  params?: Record<string, unknown>
}

export interface SettingViewMeta {
  id: string
  title?: string
  description?: string
}

export interface SettingViewDefinition<TSection extends string = string> extends SettingViewMeta {
  componentId: string
}

export interface SettingSectionDefinition<TSection extends string = string> {
  id: TSection
  label: string
  group: NavigationGroup
  icon: ComponentType<{ size?: number | string }>
  title: string
  description: string
  views: SettingViewDefinition<TSection>[]
}

export interface SettingViewComponentProps<TSection extends string = string> {
  route: SettingRoute<TSection>
  openView: (viewId: string, params?: Record<string, unknown>) => void
  goBack: () => void
  navigateToSection: (sectionId: TSection, viewId?: string, params?: Record<string, unknown>) => void
  section: SettingSectionDefinition<TSection>
  view: SettingViewDefinition<TSection>
}

export type SettingViewComponent<TSection extends string = string> = FC<SettingViewComponentProps<TSection>>

export type SettingViewRegistry<TSection extends string = string> = Record<string, SettingViewComponent<TSection>>

export interface ResolvedSettingView<TSection extends string = string> extends SettingViewDefinition<TSection> {
  Component: SettingViewComponent<TSection>
}

