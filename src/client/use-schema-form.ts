'use client'

import { Schema } from 'effect'
import * as React from 'react'

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
            const path = err.path?.join('.') || 'unknown'
            errors[path] = err.message || 'Invalid value'
          })
        } else {
          errors['general'] = error.message || 'Validation failed'
        }
        setValidationErrors(errors)
        onValidationChange?.(errors)
        return false
      }
    },
    [data, schema, onValidationChange]
  )

  const updateField = React.useCallback(
    (path: string, value: any) => {
      if (!data) return

      // Get the current value at the path for type coercion
      const originalValue = getNestedValue(data, path)
      let coercedValue = value

      // Handle null/undefined values for different types
      if (value === null || value === undefined) {
        if (typeof originalValue === 'number') {
          coercedValue = 0 // Default to 0 for number fields
        } else if (typeof originalValue === 'boolean') {
          coercedValue = false // Default to false for boolean fields
        } else if (typeof originalValue === 'string') {
          coercedValue = '' // Default to empty string for string fields
        }
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
            const numValue = Number(value)
            coercedValue = isNaN(numValue) ? 0 : numValue
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
