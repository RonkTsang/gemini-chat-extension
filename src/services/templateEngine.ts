/**
 * Template Engine
 * 处理 {{VAR}} 与 {{StepN.output}} 的变量替换、上下文绑定与校验
 */

export interface TemplateContext {
  variables: Record<string, string>
  stepOutputs: Map<number, string>
}

export interface ValidationResult {
  valid: boolean
  missingVariables: string[]
  invalidReferences: string[]
}

export class TemplateEngine {
  // 匹配 {{VAR}} 或 {{StepN.output}} 的正则
  private readonly VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g
  private readonly STEP_OUTPUT_PATTERN = /^Step(\d+)\.output$/

  /**
   * 从模板中提取所有占位符
   */
  extractPlaceholders(template: string): string[] {
    const matches = template.matchAll(this.VARIABLE_PATTERN)
    const placeholders: string[] = []
    
    for (const match of matches) {
      const placeholder = match[1].trim()
      if (!placeholders.includes(placeholder)) {
        placeholders.push(placeholder)
      }
    }
    
    return placeholders
  }

  /**
   * 校验模板在给定上下文中是否有效
   * @param template 模板字符串
   * @param context 上下文（变量 + 步骤输出）
   * @param currentStepIndex 当前步骤索引（从 0 开始），用于检查是否引用了未来步骤
   */
  validate(template: string, context: TemplateContext, currentStepIndex?: number): ValidationResult {
    const placeholders = this.extractPlaceholders(template)
    const missingVariables: string[] = []
    const invalidReferences: string[] = []
    
    for (const placeholder of placeholders) {
      const stepMatch = placeholder.match(this.STEP_OUTPUT_PATTERN)
      
      if (stepMatch) {
        // 步骤输出引用
        const stepIndex = parseInt(stepMatch[1]) - 1 // 转为 0-based
        
        // 检查是否引用了未来步骤
        if (currentStepIndex !== undefined && stepIndex >= currentStepIndex) {
          invalidReferences.push(`${placeholder} (cannot reference current or future steps)`)
          continue
        }
        
        // 检查步骤输出是否存在
        if (!context.stepOutputs.has(stepIndex)) {
          missingVariables.push(placeholder)
        }
      } else {
        // 普通变量引用
        if (!(placeholder in context.variables)) {
          missingVariables.push(placeholder)
        }
      }
    }
    
    return {
      valid: missingVariables.length === 0 && invalidReferences.length === 0,
      missingVariables,
      invalidReferences
    }
  }

  /**
   * 渲染模板，将占位符替换为实际值
   * @throws Error 如果模板无效或缺少变量
   */
  render(template: string, context: TemplateContext, currentStepIndex?: number): string {
    const validation = this.validate(template, context, currentStepIndex)
    
    if (!validation.valid) {
      const errors: string[] = []
      if (validation.missingVariables.length > 0) {
        errors.push(`Missing variables: ${validation.missingVariables.join(', ')}`)
      }
      if (validation.invalidReferences.length > 0) {
        errors.push(`Invalid references: ${validation.invalidReferences.join(', ')}`)
      }
      throw new Error(errors.join('; '))
    }
    
    return template.replace(this.VARIABLE_PATTERN, (match, placeholder) => {
      const trimmed = placeholder.trim()
      const stepMatch = trimmed.match(this.STEP_OUTPUT_PATTERN)
      
      if (stepMatch) {
        const stepIndex = parseInt(stepMatch[1]) - 1
        return context.stepOutputs.get(stepIndex) ?? match
      } else {
        return context.variables[trimmed] ?? match
      }
    })
  }

  /**
   * 渲染模板，将占位符替换为实际值
   * @returns { rendered: string, validation: ValidationResult }
   */
  renderWithValidation(template: string, context: TemplateContext, currentStepIndex?: number): { prompt: string, validation: ValidationResult } {
    const validation = this.validate(template, context, currentStepIndex)
    
    const rendered = template.replace(this.VARIABLE_PATTERN, (match, placeholder) => {
      const trimmed = placeholder.trim()
      const stepMatch = trimmed.match(this.STEP_OUTPUT_PATTERN)
      
      if (stepMatch) {
        const stepIndex = parseInt(stepMatch[1]) - 1
        return context.stepOutputs.get(stepIndex) ?? match
      } else {
        return context.variables[trimmed] ?? match
      }
    })

    return {
      prompt: rendered,
      validation
    };
  }

  /**
   * 获取当前步骤可用的变量列表（用于 UI 提示）
   * @param variables 输入变量
   * @param currentStepIndex 当前步骤索引（从 0 开始）
   */
  getAvailableVariables(variables: Record<string, string>, currentStepIndex: number): string[] {
    // 屏蔽“前 n 步”输出变量，仅返回用户定义的输入变量
    return Object.keys(variables)
  }
}

export const templateEngine = new TemplateEngine()


