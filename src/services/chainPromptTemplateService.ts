/**
 * Default Template Service
 * Default template service layer, handling template retrieval, searching, and importing
 */

import type { ChainPrompt } from '@/domain/chain-prompt/types'
import { chainPromptRepository } from '@/data/repositories'
import { 
  defaultTemplates, 
  getTemplatesByCategory, 
  getTemplateById, 
  searchTemplates,
  type DefaultTemplate,
  type TemplateCategory 
} from '@/data/templates/chainPrompt'

export class DefaultTemplateService {
  /**
   * Get all default templates
   */
  async getAllTemplates(): Promise<DefaultTemplate[]> {
    return defaultTemplates
  }

  /**
   * Get templates by category
   */
  async getTemplatesByCategory(category: TemplateCategory): Promise<DefaultTemplate[]> {
    return getTemplatesByCategory(category)
  }

  /**
   * Search templates
   */
  async searchTemplates(query: string): Promise<DefaultTemplate[]> {
    return searchTemplates(query)
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id: string): Promise<DefaultTemplate | undefined> {
    return getTemplateById(id)
  }

  /**
   * Import template to user library
   */
  async importTemplate(
    templateId: string, 
    customName?: string
  ): Promise<ChainPrompt> {
    const template = await this.getTemplateById(templateId)
    if (!template) {
      throw new Error('Template not found')
    }

    // Construct user Chain Prompt data
    const userPromptData = {
      name: customName || template.name,
      description: template.description,
      variables: template.variables,
      steps: template.steps
    }

    // Create user Chain Prompt
    const userPrompt = await chainPromptRepository.create(userPromptData)
    
    return userPrompt
  }
}

export const defaultTemplateService = new DefaultTemplateService()
