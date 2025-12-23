/**
 * Default Template Index
 * Index and export of default templates
 */

import type { ChainPrompt } from '@/domain/chain-prompt/types'

export interface DefaultTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategory
  tags: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedTime: string
  variables: ChainPrompt['variables']
  steps: ChainPrompt['steps']
  preview?: {
    thumbnail?: string
    exampleOutput?: string
  }
}

export type TemplateCategory = 
  | 'content-creation'
  | 'business-office'

// Import all template data
import { contentCreationTemplates } from './content-creation.js'
import { businessOfficeTemplates } from './business-office.js'

export const defaultTemplates: DefaultTemplate[] = [
  ...contentCreationTemplates,
  ...businessOfficeTemplates
]

export const templatesByCategory = {
  'content-creation': contentCreationTemplates,
  'business-office': businessOfficeTemplates
}

export function getTemplatesByCategory(category: TemplateCategory): DefaultTemplate[] {
  return templatesByCategory[category] || []
}

export function getTemplateById(id: string): DefaultTemplate | undefined {
  return defaultTemplates.find(template => template.id === id)
}

export function searchTemplates(query: string): DefaultTemplate[] {
  const lowerQuery = query.toLowerCase()
  return defaultTemplates.filter(template => 
    template.name.toLowerCase().includes(lowerQuery) ||
    template.description.toLowerCase().includes(lowerQuery) ||
    template.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  )
}
