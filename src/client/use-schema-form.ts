'use client'

import { Schema } from 'effect'
import * as React from 'react'

import type {
  AIFormMessage,
  AIFormRule,
  ClarificationQuestion,
  Paths,
} from '../ai/types'
import { stringToNumber, toAmountString } from '../format'
import type { FormFieldDefinition } from '../schema-form'
import {
  generateFormFieldsWithSchemaAnnotations,
  getNestedValue,
  setNestedValue,
} from '../schema-form'
import type { AIFormFillerStatus } from './use-ai-form-filler'
import { useAIFormFiller } from './use-ai-form-filler'

/**
 * @description Conditional hook wrapper for AI form filler
 * Returns undefined when AI config is not provided
 */
function useAIFormFillerConditional<T>(
  config: SchemaFormAIConfig<T> | undefined,
  schema: Schema.Schema.Any,
  data: T | null,
  onComplete: (filledData: Partial<T>) => void,
  onDataChange: (filledData: Partial<T>) => void
): SchemaFormAI | undefined {
  // Always call the hook but with a dummy endpoint when disabled
  // Cast schema to Schema.Schema<T> for internal use (the actual type is inferred correctly)
  const result = useAIFormFiller({
    endpoint: config?.endpoint ?? '__disabled__',
    schema: schema as Schema.Schema<T>,
    initialData: data,
    maxHistory: config?.maxHistory,
    excludeFields: config?.excludeFields,
    rules: config?.rules,
    onComplete,
    onDataChange,
  })

  // Return undefined when AI is not configured
  if (!config) {
    return undefined
  }

  return {
    status: result.status,
    messages: result.messages,
    clarifications: result.clarifications,
    summary: result.summary,
    fill: result.fillFromPrompt,
    answer: result.answerClarification,
    ask: result.askQuestion,
    reset: result.reset,
  }
}

// Re-export types
export type { FormFieldDefinition, AIFormRule, Paths }

/**
 * @description Optional AI configuration for useSchemaForm
 * @template T - The schema type, used for strongly-typed field paths in rules
 */
export interface SchemaFormAIConfig<T = unknown> {
  /**
   * @description API endpoint for AI form filler
   * @example '/api/ai-form-fill'
   */
  endpoint: string
  /**
   * @description Maximum messages to keep in conversation history
   * @default 20
   */
  maxHistory?: number
  /**
   * @description Fields to exclude from AI processing (e.g. hidden fields)
   * These fields will not be sent to the AI and will not be filled by it
   */
  excludeFields?: string[]
  /**
   * @description Custom rules/context for specific fields
   * Allows schema owners to provide additional guidance to the AI
   * Field names are strongly typed based on the schema
   * @example [{ field: "marketing.discoveryQuery", rule: "Use Twitter search syntax..." }]
   */
  rules?: AIFormRule<T>[]
}

/**
 * @description AI-related return fields when AI is enabled
 */
export interface SchemaFormAI {
  status: AIFormFillerStatus
  messages: AIFormMessage[]
  clarifications: ClarificationQuestion[]
  summary: string | null
  fill: (prompt: string) => Promise<void>
  answer: (field: string, value: unknown) => Promise<void>
  ask: (question: string) => Promise<string>
  reset: () => void
}

/**
 * @description Options for useSchemaForm hook
 * @template S - The Effect Schema type (accepts any Schema including those with different Encoded/Type)
 */
export interface UseSchemaFormOptions<
  S extends Schema.Schema.Any,
  T = Schema.Schema.Type<S>,
> {
  schema: S
  initialData?: T | null
  onValidationChange?: (errors: Record<string, string>) => void
  /**
   * @description Optional AI configuration. When provided, enables AI form filling.
   * Field names in rules are strongly typed based on the schema type
   */
  ai?: SchemaFormAIConfig<T>
}

export interface UseSchemaFormReturn<T> {
  data: T | null
  setData: (data: T | null) => void
  validationErrors: Record<string, string>
  hasChanges: boolean
  setHasChanges: (hasChanges: boolean) => void
  updateField: (path: string, value: any) => void
  validateData: (dataToValidate?: T) => boolean
  resetValidation: () => void
  updateFromJson: (jsonString: string) => boolean
  fields: Record<string, FormFieldDefinition>
  /**
   * @description AI-related state and actions. Only present when `ai` config is provided.
   */
  ai?: SchemaFormAI
}

// Types used by the example FormBuilder UI
export interface FormBuilderProps<T = any> {
  form: UseSchemaFormReturn<T>
  className?: string
  title?: string
  collapsible?: boolean
  initialCollapsed?: boolean
}

export interface FormFieldProps {
  field: FormFieldDefinition
  value: any
  onChange: (value: any) => void
  error?: string
  minimal?: boolean
  /**
   * Full form data for evaluating conditional requirements (requiredWhen)
   */
  formData?: any
}

export interface NestedFormProps<T = any> {
  field: FormFieldDefinition
  form: UseSchemaFormReturn<T>
  basePath: string
  level?: number
  initialCollapsed?: boolean
  minimal?: boolean
}

export function useSchemaForm<
  S extends Schema.Schema.Any,
  T = Schema.Schema.Type<S>,
>({
  schema,
  initialData = null,
  onValidationChange,
  ai: aiConfig,
}: UseSchemaFormOptions<S, T>): UseSchemaFormReturn<T> {
  const [data, setDataState] = React.useState<T | null>(initialData)
  const [validationErrors, setValidationErrors] = React.useState<
    Record<string, string>
  >({})
  const [hasChanges, setHasChanges] = React.useState(false)

  // Sync form state when initialData changes (e.g., when async query completes)
  // Only sync if user hasn't made changes yet to avoid overwriting their edits
  React.useEffect(() => {
    if (!hasChanges && initialData !== null && initialData !== undefined) {
      setDataState(initialData)
    }
  }, [initialData, hasChanges])

  const fields = React.useMemo(() => {
    return generateFormFieldsWithSchemaAnnotations(data ?? {}, schema)
  }, [data, schema])

  // Handle AI data changes - update form in real-time
  const handleAIDataChange = React.useCallback(
    (filledData: Partial<T>) => {
      if (filledData) {
        setDataState(filledData as T)
        setHasChanges(true)
      }
    },
    [setDataState, setHasChanges]
  )

  // Conditionally use AI form filler when config is provided
  const aiFillerResult = useAIFormFillerConditional(
    aiConfig,
    schema,
    data,
    handleAIDataChange, // onComplete
    handleAIDataChange // onDataChange - same handler for real-time sync
  )

  /**
   * Parse Effect Schema error messages into human-readable format
   */
  const parseEffectSchemaError = React.useCallback(
    (message: string): string => {
      // Extract the last meaningful error message from nested structure
      // Look for "Expected X, actual Y" pattern
      const expectedActualMatch = message.match(
        /Expected ([^,]+), actual (.+?)(?:\n|$)/i
      )
      if (expectedActualMatch) {
        const [, expected, actual] = expectedActualMatch
        const cleanExpected = expected.trim()
        const cleanActual = actual.trim().replace(/^"(.*)"$/, '$1') // Remove quotes

        // Handle empty string case
        if (cleanActual === '' || cleanActual === '""') {
          return `${cleanExpected} is required`
        }

        return `Expected ${cleanExpected}, but got: ${cleanActual}`
      }

      // Look for refinement failure messages
      const refinementMatch = message.match(
        /Predicate refinement failure[^\n]*\n[^\n]*Expected ([^,\n]+)/i
      )
      if (refinementMatch) {
        const [, expected] = refinementMatch
        return expected.trim()
      }

      // Look for filter failure messages - try to extract the meaningful part
      const filterMatch = message.match(
        /filter[^\n]*\n[^\n]*└─ From side refinement failure[^\n]*\n[^\n]*└─[^\n]*\n[^\n]*└─ \["([^"]+)"\][^\n]*\n[^\n]*└─ ([^\n]+)/i
      )
      if (filterMatch) {
        const [, fieldName, fieldError] = filterMatch
        return `${fieldName}: ${fieldError.trim()}`
      }

      // Extract the last line that has actual content (often the most specific error)
      const lines = message
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      const lastMeaningfulLine = lines[lines.length - 1]

      // Skip technical prefixes
      if (
        lastMeaningfulLine &&
        !lastMeaningfulLine.startsWith('└─') &&
        !lastMeaningfulLine.includes('failure')
      ) {
        return lastMeaningfulLine
      }

      // If we can't parse it better, try to clean up the message
      const cleanMessage = message
        .replace(/\n/g, ' ')
        .replace(/└─/g, '')
        .replace(/\s+/g, ' ')
        .trim()

      // If still too technical, return a generic message
      if (
        cleanMessage.length > 200 ||
        cleanMessage.includes('refinement failure')
      ) {
        return 'Invalid value - please check the field'
      }

      return cleanMessage
    },
    []
  )

  const validateData = React.useCallback(
    (dataToValidate?: T): boolean => {
      const targetData = dataToValidate || data
      if (!targetData) {
        setValidationErrors({})
        return true
      }

      try {
        // Cast to Schema<T> for decoding - the actual type is already inferred correctly
        Schema.decodeUnknownSync(schema as unknown as Schema.Schema<T>)(
          targetData
        )
        setValidationErrors({})
        onValidationChange?.({})
        return true
      } catch (error: any) {
        const errors: Record<string, string> = {}
        if (error.errors) {
          error.errors.forEach((err: any) => {
            // Handle empty or missing paths (common with Schema.filter errors)
            const pathArray = err.path || []
            const path = pathArray.length > 0 ? pathArray.join('.') : '_root'

            // Parse and simplify the error message
            const humanMessage = parseEffectSchemaError(
              err.message || 'Invalid value'
            )
            errors[path] = humanMessage
          })
        } else {
          // Fallback for errors without errors array
          const humanMessage = parseEffectSchemaError(
            error.message || 'Validation failed'
          )
          errors['_root'] = humanMessage
        }
        setValidationErrors(errors)
        onValidationChange?.(errors)
        return false
      }
    },
    [data, schema, onValidationChange, parseEffectSchemaError]
  )

  const updateField = React.useCallback(
    (path: string, value: any) => {
      if (!data) return

      // Get the current value at the path for type coercion
      const originalValue = getNestedValue(data, path)
      let coercedValue = value

      // Allow undefined/null to clear fields (validation will catch required field violations)
      if (value === null || value === undefined) {
        coercedValue = value
      } else if (
        originalValue !== null &&
        originalValue !== undefined &&
        value !== null &&
        value !== undefined
      ) {
        const originalType = typeof originalValue
        const newType = typeof value

        // If types don't match, try to coerce
        if (originalType !== newType) {
          if (originalType === 'number' && newType === 'string') {
            // Format the string input (handles commas, multiple periods, etc.)
            const formatted = toAmountString(value)
            if (!formatted) {
              // If formatting results in empty, keep the value as is
              coercedValue = value
            } else {
              // Convert formatted string to number
              const numValue = stringToNumber(formatted)
              coercedValue = isNaN(numValue) ? value : numValue
            }
          } else if (originalType === 'boolean' && newType === 'string') {
            coercedValue = value === 'true' || value === true
          }
        }
      }

      const newData = setNestedValue(data, path, coercedValue)
      setData(newData)
      setHasChanges(true)

      // Validate the updated data
      validateData(newData)
    },
    [data, validateData]
  )

  const resetValidation = React.useCallback(() => {
    setValidationErrors({})
    onValidationChange?.({})
  }, [onValidationChange])

  // Validate on mount and when data changes
  React.useEffect(() => {
    if (data) {
      validateData(data)
    }
  }, [data, validateData])

  const updateFromJson = React.useCallback(
    (jsonString: string): boolean => {
      try {
        const newData = JSON.parse(jsonString)
        setData(newData)
        setHasChanges(true)
        return validateData(newData)
      } catch {
        // Invalid JSON, return false but don't update anything
        return false
      }
    },
    [validateData]
  )

  // Wrapper for setData to keep AI and form in sync
  const setData = React.useCallback((newData: T | null) => {
    setDataState(newData)
  }, [])

  return {
    data,
    setData,
    validationErrors,
    hasChanges,
    setHasChanges,
    updateField,
    validateData,
    resetValidation,
    updateFromJson,
    fields,
    ai: aiFillerResult,
  }
}
