/**
 * Template Engine
 * Handles variable replacement for {{VAR}} and {{StepN.output}}, context binding, and validation
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
  // Regex pattern for matching {{VAR}} or {{StepN.output}}
  private readonly VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g
  private readonly STEP_OUTPUT_PATTERN = /^Step(\d+)\.output$/

  /**
   * Extract all placeholders from the template
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
   * Validate if the template is valid in the given context
   * @param template Template string
   * @param context Context (variables + step outputs)
   * @param currentStepIndex Current step index (0-based), used to check if future steps are referenced
   */
  validate(template: string, context: TemplateContext, currentStepIndex?: number): ValidationResult {
    const placeholders = this.extractPlaceholders(template)
    const missingVariables: string[] = []
    const invalidReferences: string[] = []
    
    for (const placeholder of placeholders) {
      const stepMatch = placeholder.match(this.STEP_OUTPUT_PATTERN)
      
      if (stepMatch) {
        // Step output reference
        const stepIndex = parseInt(stepMatch[1]) - 1 // Convert to 0-based
        
        // Check if referencing future steps
        if (currentStepIndex !== undefined && stepIndex >= currentStepIndex) {
          invalidReferences.push(`${placeholder} (cannot reference current or future steps)`)
          continue
        }
        
        // Check if step output exists
        if (!context.stepOutputs.has(stepIndex)) {
          missingVariables.push(placeholder)
        }
      } else {
        // Regular variable reference
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
   * Render template, replace placeholders with actual values
   * @throws Error if template is invalid or variables are missing
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
   * Render template, replace placeholders with actual values
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
   * Get list of available variables for the current step (for UI hints)
   * @param variables Input variables
   * @param currentStepIndex Current step index (0-based)
   */
  getAvailableVariables(variables: Record<string, string>, currentStepIndex: number): string[] {
    // Mask "Step N output" variables, return only user-defined input variables
    return Object.keys(variables)
  }
}

export const templateEngine = new TemplateEngine()


