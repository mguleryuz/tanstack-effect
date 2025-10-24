'use client'

import { Schema } from 'effect'
import * as React from 'react'

import { stringToNumber, toAmountString } from '../format'
import type { FormFieldDefinition } from '../schema-form'
import {
  generateFormFieldsWithSchemaAnnotations,
  getNestedValue,
  setNestedValue,
} from '../schema-form'

// Re-export types
export type { FormFieldDefinition }

export interface UseSchemaFormOptions<T> {
  schema: Schema.Schema<T>
  initialData?: T | null
  onValidationChange?: (errors: Record<string, string>) => void
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
}

export interface NestedFormProps<T = any> {
  field: FormFieldDefinition
  form: UseSchemaFormReturn<T>
  basePath: string
  level?: number
  initialCollapsed?: boolean
  minimal?: boolean
}

export function useSchemaForm<T>({
  schema,
  initialData = null,
  onValidationChange,
}: UseSchemaFormOptions<T>): UseSchemaFormReturn<T> {
  const [data, setData] = React.useState<T | null>(initialData)
  const [validationErrors, setValidationErrors] = React.useState<
    Record<string, string>
  >({})
  const [hasChanges, setHasChanges] = React.useState(false)

  const fields = React.useMemo(() => {
    return generateFormFieldsWithSchemaAnnotations(data ?? {}, schema)
  }, [data, schema])

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
        Schema.decodeUnknownSync(schema)(targetData)
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
  }
}
