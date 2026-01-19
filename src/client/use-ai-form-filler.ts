'use client'

import { Schema } from 'effect'
import { merge } from 'lodash-es'
import * as React from 'react'

import type {
  AIFormFillerRequest,
  AIFormFillerResponse,
  AIFormMessage,
  AIFormRule,
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
   * @description Maximum number of messages to keep in UI history
   * Note: Messages are only for UI display, not sent to AI (CRUD approach)
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
  /**
   * @description Custom rules/context for specific fields
   * Allows schema owners to provide additional guidance to the AI
   * @example [{ field: "marketing.discoveryQuery", rule: "Use Twitter search syntax..." }]
   */
  rules?: AIFormRule[]
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
  rules = [],
}: UseAIFormFillerOptions<T>): UseAIFormFillerReturn<T> {
  const [status, setStatus] = React.useState<AIFormFillerStatus>('idle')
  const [data, setData] = React.useState<Partial<T> | null>(initialData || null)
  const [clarifications, setClarifications] = React.useState<
    ClarificationQuestion[]
  >([])
  const [messages, setMessages] = React.useState<AIFormMessage[]>([])
  const [error, setError] = React.useState<Error | null>(null)
  const [summary, setSummary] = React.useState<string | null>(null)

  // Keep internal data in sync with external form changes (manual edits)
  // This ensures AI always works with the latest form state
  React.useEffect(() => {
    if (initialData !== null && initialData !== undefined) {
      setData(initialData as Partial<T>)
    }
  }, [initialData])

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
   * Uses CRUD approach: sends schema + currentData + prompt on every call
   * No conversation history needed - currentData is the source of truth
   */
  const callAI = React.useCallback(
    async (
      prompt: string,
      currentData?: Record<string, unknown>
    ): Promise<AIFormFillerResponse | null> => {
      try {
        // CRUD approach: always send schema + current data + user prompt
        // No messages history - simpler and more reliable
        const request: AIFormFillerRequest = {
          prompt,
          fields,
          messages: [], // Empty - we use currentData instead
          partialData: currentData || (data as Record<string, unknown>) || {},
          rules: rules.length > 0 ? rules : undefined,
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
    [endpoint, fields, data, rules]
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

      return parts.join('\n')
    },
    [fields, findFieldByLabel]
  )

  /**
   * @description Fill form from user prompt
   * Uses CRUD approach: AI receives schema + currentData + prompt and returns merged result
   */
  const fillFromPrompt = React.useCallback(
    async (prompt: string) => {
      try {
        setStatus('filling')
        setError(null)
        setClarifications([])

        // Add user prompt to UI messages (for display only)
        addMessage({
          role: 'user',
          content: prompt,
          timestamp: new Date().toISOString(),
        })

        // Call AI with current data - AI returns merged result
        const response = await callAI(
          prompt,
          (data || {}) as Record<string, unknown>
        )
        if (!response) return

        // Filter out excluded fields from AI response
        const filteredFilled = filterExcludedFromResponse(response.filled)

        // AI already returns merged data (CRUD approach)
        // Use lodash merge to deep merge and preserve any fields AI didn't return
        const newData = merge({}, data || {}, filteredFilled) as Partial<T>
        setData(newData)

        // Notify parent of data change
        onDataChange?.(newData)

        // Update summary
        setSummary(response.summary || null)

        // Check if complete
        if (response.complete || response.missing.length === 0) {
          addMessage({
            role: 'assistant',
            content:
              response.summary || "Perfect! I've filled in all the fields.",
            timestamp: new Date().toISOString(),
          })
          setStatus('complete')
          onComplete?.(newData)
        } else {
          // Still missing fields - ask for them
          const missingMessage = buildMissingFieldsMessage(
            response.missing,
            response.summary
          )
          addMessage({
            role: 'assistant',
            content: missingMessage,
            timestamp: new Date().toISOString(),
          })
          setStatus('idle')
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
   * This also extracts any form values from the question (CRUD approach)
   */
  const askQuestion = React.useCallback(
    async (question: string): Promise<string> => {
      // Just use fillFromPrompt - it handles everything
      await fillFromPrompt(question)
      // Return the last assistant message
      return messages[messages.length - 1]?.content || ''
    },
    [fillFromPrompt, messages]
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
