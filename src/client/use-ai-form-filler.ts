'use client'

import { Schema } from 'effect'
import * as React from 'react'

import type {
  AIFormFillerRequest,
  AIFormFillerResponse,
  AIFormMessage,
  ClarificationQuestion,
} from '../ai/types'
import type { FormFieldDefinition } from '../schema-form'
import { generateFormFieldsWithSchemaAnnotations } from '../schema-form'
import type { UseSchemaFormReturn } from './use-schema-form'

/**
 * @description Options for useAIFormFiller hook
 */
export interface UseAIFormFillerOptions<T> {
  /**
   * @description The API endpoint implemented by SDK consumer
   * @example '/api/ai-form-fill'
   */
  endpoint: string
  /**
   * @description The Effect schema for the form
   */
  schema: Schema.Schema<T>
  /**
   * @description Initial form data
   */
  initialData?: T | null
  /**
   * @description Maximum number of messages to keep in history
   * @default 20
   */
  maxHistory?: number
  /**
   * @description Callback when AI completes filling
   */
  onComplete?: (data: Partial<T>) => void
  /**
   * @description Callback whenever data changes (for real-time form sync)
   * Called every time AI fills any fields, even if not complete
   */
  onDataChange?: (data: Partial<T>) => void
  /**
   * @description Fields to exclude from AI processing (e.g. hidden fields)
   * These fields will not be sent to the AI and will not be filled by it
   */
  excludeFields?: string[]
}

export type AIFormFillerStatus =
  | 'idle'
  | 'filling'
  | 'clarifying'
  | 'complete'
  | 'error'

/**
 * @description Return type for useAIFormFiller hook
 */
export interface UseAIFormFillerReturn<T> {
  // State
  status: AIFormFillerStatus
  data: Partial<T> | null
  clarifications: ClarificationQuestion[]
  messages: AIFormMessage[]
  error: Error | null
  /**
   * @description Human-readable summary of last AI action
   * @example "Filled 3 fields: projectName, projectType, teamSize"
   */
  summary: string | null

  // Actions
  fillFromPrompt: (prompt: string) => Promise<void>
  answerClarification: (field: string, value: unknown) => Promise<void>
  askQuestion: (question: string) => Promise<string>
  reset: () => void

  // Integration
  applyToForm: (form: UseSchemaFormReturn<T>) => void
}

/**
 * @description React hook for AI-powered form filling
 * Maintains conversation memory and coordinates with server AI functions
 */
export function useAIFormFiller<T>({
  endpoint,
  schema,
  initialData = null,
  maxHistory = 20,
  onComplete,
  onDataChange,
  excludeFields = [],
}: UseAIFormFillerOptions<T>): UseAIFormFillerReturn<T> {
  const [status, setStatus] = React.useState<AIFormFillerStatus>('idle')
  const [data, setData] = React.useState<Partial<T> | null>(initialData || null)
  const [clarifications, setClarifications] = React.useState<
    ClarificationQuestion[]
  >([])
  const [messages, setMessages] = React.useState<AIFormMessage[]>([])
  const [error, setError] = React.useState<Error | null>(null)
  const [summary, setSummary] = React.useState<string | null>(null)

  // Set of excluded fields for quick lookup
  const excludeFieldsSet = React.useMemo(
    () => new Set(excludeFields),
    [excludeFields]
  )

  // Generate form fields from schema for AI, filtering out excluded fields
  const fields = React.useMemo(() => {
    const allFields = generateFormFieldsWithSchemaAnnotations(
      data ?? {},
      schema
    )
    // Filter out excluded fields (both exact matches and nested paths)
    const filtered: typeof allFields = {}
    for (const [key, value] of Object.entries(allFields)) {
      // Check if this field or any parent path is excluded
      const isExcluded = excludeFields.some(
        (excluded) => key === excluded || key.startsWith(`${excluded}.`)
      )
      if (!isExcluded) {
        filtered[key] = value
      }
    }
    return filtered
  }, [data, schema, excludeFields])

  /**
   * @description Add message to history with size limit
   */
  const addMessage = React.useCallback(
    (message: AIFormMessage) => {
      setMessages((prev) => {
        const updated = [...prev, message]
        // Keep only recent messages to stay within token limits
        if (updated.length > maxHistory) {
          return updated.slice(-maxHistory)
        }
        return updated
      })
    },
    [maxHistory]
  )

  /**
   * @description Call the AI form filler API
   */
  const callAI = React.useCallback(
    async (
      prompt: string,
      partialData?: Record<string, unknown>
    ): Promise<AIFormFillerResponse | null> => {
      try {
        const request: AIFormFillerRequest = {
          prompt,
          fields,
          messages,
          partialData: partialData || data || undefined,
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(
            errorData.error || `HTTP ${response.status}: ${response.statusText}`
          )
        }

        return await response.json()
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setError(errorObj)
        throw errorObj
      }
    },
    [endpoint, fields, messages, data]
  )

  /**
   * @description Filter out excluded fields from AI response
   */
  const filterExcludedFromResponse = React.useCallback(
    (filled: Record<string, unknown>): Record<string, unknown> => {
      const filtered: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(filled)) {
        if (!excludeFieldsSet.has(key)) {
          filtered[key] = value
        }
      }
      return filtered
    },
    [excludeFieldsSet]
  )

  /**
   * @description Deep merge two objects, preserving existing values
   */
  const deepMergeData = React.useCallback(
    (
      existing: Record<string, unknown>,
      newData: Record<string, unknown>
    ): Record<string, unknown> => {
      const result = { ...existing }

      for (const [key, newValue] of Object.entries(newData)) {
        if (newValue === undefined || newValue === null) {
          continue
        }

        const existingValue = existing[key]

        // If both are objects (not arrays), deep merge
        if (
          typeof existingValue === 'object' &&
          existingValue !== null &&
          !Array.isArray(existingValue) &&
          typeof newValue === 'object' &&
          newValue !== null &&
          !Array.isArray(newValue)
        ) {
          result[key] = deepMergeData(
            existingValue as Record<string, unknown>,
            newValue as Record<string, unknown>
          )
        } else {
          // Otherwise, new value takes precedence
          result[key] = newValue
        }
      }

      return result
    },
    []
  )

  /**
   * @description Find field definition by label (searches nested children too)
   */
  const findFieldByLabel = React.useCallback(
    (
      label: string,
      fieldsToSearch: Record<string, FormFieldDefinition>
    ): FormFieldDefinition | undefined => {
      for (const field of Object.values(fieldsToSearch)) {
        if (field.label === label || field.key === label) {
          return field
        }
        // Check children for nested fields
        if (field.children) {
          const found = findFieldByLabel(label, field.children)
          if (found) return found
        }
      }
      return undefined
    },
    []
  )

  /**
   * @description Build a friendly message asking for missing fields with descriptions
   */
  const buildMissingFieldsMessage = React.useCallback(
    (missing: string[], filledSummary?: string): string => {
      const parts: string[] = []

      if (filledSummary) {
        parts.push(filledSummary)
        parts.push('')
      }

      if (missing.length === 1) {
        const fieldDef = findFieldByLabel(missing[0], fields)
        const desc = fieldDef?.description ? ` - ${fieldDef.description}` : ''
        parts.push(
          `I still need one more piece of information: **${missing[0]}**${desc}`
        )
      } else {
        parts.push(`I still need the following information:`)
        parts.push('')
        missing.forEach((label) => {
          const fieldDef = findFieldByLabel(label, fields)
          if (fieldDef?.description) {
            parts.push(`• **${label}**: ${fieldDef.description}`)
          } else {
            parts.push(`• **${label}**`)
          }
          // Add valid options for choice fields
          if (fieldDef?.literalOptions && fieldDef.literalOptions.length > 0) {
            parts.push(
              `  Options: ${fieldDef.literalOptions.map((o) => `"${o}"`).join(', ')}`
            )
          }
        })
      }

      parts.push('')
      parts.push('Please provide this information in your next message.')

      return parts.join('\n')
    },
    [fields, findFieldByLabel]
  )

  /**
   * @description Fill form from user prompt
   */
  const fillFromPrompt = React.useCallback(
    async (prompt: string) => {
      try {
        setStatus('filling')
        setError(null)
        // Clear any existing clarifications - we use chat messages now
        setClarifications([])

        // Add user prompt to messages
        addMessage({
          role: 'user',
          content: prompt,
          timestamp: new Date().toISOString(),
        })

        // Call AI with current data as context
        const response = await callAI(prompt, data || undefined)
        if (!response) return

        // Filter out excluded fields from AI response
        const filteredFilled = filterExcludedFromResponse(response.filled)

        // Deep merge: keep existing data, add new filled values
        const newData = deepMergeData(
          (data || {}) as Record<string, unknown>,
          filteredFilled
        ) as Partial<T>
        setData(newData)

        // Notify parent of data change immediately (for real-time form sync)
        onDataChange?.(newData)

        // Update summary
        setSummary(response.summary || null)

        // Check if complete
        if (response.complete || response.missing.length === 0) {
          // All done!
          addMessage({
            role: 'assistant',
            content:
              response.summary || "Perfect! I've filled in all the fields.",
            timestamp: new Date().toISOString(),
          })
          setStatus('complete')
          onComplete?.(newData)
        } else {
          // Still missing fields - ask for them in a conversational message
          const missingMessage = buildMissingFieldsMessage(
            response.missing,
            response.summary
          )
          addMessage({
            role: 'assistant',
            content: missingMessage,
            timestamp: new Date().toISOString(),
          })
          setStatus('idle') // Ready for user to respond
        }
      } catch (err) {
        setStatus('error')
      }
    },
    [
      data,
      callAI,
      addMessage,
      onComplete,
      onDataChange,
      filterExcludedFromResponse,
      buildMissingFieldsMessage,
    ]
  )

  /**
   * @description Answer a clarification question (legacy - now just forwards to fillFromPrompt)
   * @deprecated Use fillFromPrompt directly - the conversational flow handles everything
   */
  const answerClarification = React.useCallback(
    async (field: string, value: unknown) => {
      // Format the answer as a natural message and use fillFromPrompt
      const displayValue =
        typeof value === 'string' ? value : JSON.stringify(value)
      const fieldName = field.split('.').pop() || field
      await fillFromPrompt(`${fieldName}: ${displayValue}`)
    },
    [fillFromPrompt]
  )

  /**
   * @description Ask a follow-up question
   */
  const askQuestion = React.useCallback(
    async (question: string): Promise<string> => {
      try {
        // Add question to messages
        addMessage({
          role: 'user',
          content: question,
          timestamp: new Date().toISOString(),
        })

        // Get AI response - just for context, not to modify data
        const response = await callAI(question)

        // Add response to messages
        const assistantResponse = response?.assistantMessage || ''
        addMessage({
          role: 'assistant',
          content: assistantResponse,
          timestamp: new Date().toISOString(),
        })

        return assistantResponse
      } catch (err) {
        return ''
      }
    },
    [callAI, addMessage]
  )

  /**
   * @description Reset form and messages
   */
  const reset = React.useCallback(() => {
    setData(initialData || null)
    setMessages([])
    setClarifications([])
    setStatus('idle')
    setError(null)
    setSummary(null)
  }, [initialData])

  /**
   * @description Apply AI-filled values to a form
   */
  const applyToForm = React.useCallback(
    (form: UseSchemaFormReturn<T>) => {
      if (!data) return

      // Update each field in the form
      Object.entries(data).forEach(([key, value]) => {
        form.updateField(key, value)
      })
    },
    [data]
  )

  return {
    status,
    data,
    clarifications,
    messages,
    error,
    summary,
    fillFromPrompt,
    answerClarification,
    askQuestion,
    reset,
    applyToForm,
  }
}
