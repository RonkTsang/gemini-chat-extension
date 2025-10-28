/**
 * Default Template Service
 * 默认模板服务层，处理模板的获取、搜索和导入
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
   * 获取所有默认模板
   */
  async getAllTemplates(): Promise<DefaultTemplate[]> {
    return defaultTemplates
  }

  /**
   * 按分类获取模板
   */
  async getTemplatesByCategory(category: TemplateCategory): Promise<DefaultTemplate[]> {
    return getTemplatesByCategory(category)
  }

  /**
   * 搜索模板
   */
  async searchTemplates(query: string): Promise<DefaultTemplate[]> {
    return searchTemplates(query)
  }

  /**
   * 根据ID获取模板
   */
  async getTemplateById(id: string): Promise<DefaultTemplate | undefined> {
    return getTemplateById(id)
  }

  /**
   * 导入模板到用户库
   */
  async importTemplate(
    templateId: string, 
    customName?: string
  ): Promise<ChainPrompt> {
    const template = await this.getTemplateById(templateId)
    if (!template) {
      throw new Error('Template not found')
    }

    // 构建用户 Chain Prompt 数据
    const userPromptData = {
      name: customName || template.name,
      description: template.description,
      variables: template.variables,
      steps: template.steps
    }

    // 创建用户 Chain Prompt
    const userPrompt = await chainPromptRepository.create(userPromptData)
    
    return userPrompt
  }
}

export const defaultTemplateService = new DefaultTemplateService()
