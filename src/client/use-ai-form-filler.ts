'use client'

import { Schema } from 'effect'
import * as React from 'react'

import type {
  AIFormFillerRequest,
  AIFormFillerResponse,
  AIFormMessage,
  ClarificationQuestion,
} from '../ai/types'
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
}: UseAIFormFillerOptions<T>): UseAIFormFillerReturn<T> {
  const [status, setStatus] = React.useState<AIFormFillerStatus>('idle')
  const [data, setData] = React.useState<Partial<T> | null>(initialData || null)
  const [clarifications, setClarifications] = React.useState<
    ClarificationQuestion[]
  >([])
  const [messages, setMessages] = React.useState<AIFormMessage[]>([])
  const [error, setError] = React.useState<Error | null>(null)
  const [summary, setSummary] = React.useState<string | null>(null)

  // Generate form fields from schema for AI
  const fields = React.useMemo(() => {
    return generateFormFieldsWithSchemaAnnotations(data ?? {}, schema)
  }, [data, schema])

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
   * @description Fill form from user prompt
   */
  const fillFromPrompt = React.useCallback(
    async (prompt: string) => {
      try {
        setStatus('filling')
        setError(null)

        // Add user prompt to messages
        addMessage({
          role: 'user',
          content: prompt,
          timestamp: new Date().toISOString(),
        })

        // Call AI
        const response = await callAI(prompt)
        if (!response) return

        // Update data with filled fields
        const newData: Partial<T> = {
          ...data,
          ...response.filled,
        }
        setData(newData)

        // Update summary
        setSummary(response.summary || null)

        // Add assistant response to messages (use summary as content)
        addMessage({
          role: 'assistant',
          content:
            response.summary ||
            response.assistantMessage ||
            JSON.stringify(response.filled),
          timestamp: new Date().toISOString(),
        })

        // Handle clarifications or completion
        if (response.clarifications && response.clarifications.length > 0) {
          setClarifications(response.clarifications)
          setStatus('clarifying')
        } else if (response.complete) {
          setStatus('complete')
          onComplete?.(newData)
        } else {
          setStatus('idle')
        }
      } catch (err) {
        setStatus('error')
      }
    },
    [data, callAI, addMessage, onComplete]
  )

  /**
   * @description Answer a clarification question
   */
  const answerClarification = React.useCallback(
    async (field: string, value: unknown) => {
      try {
        setStatus('filling')

        // Add answer to messages
        const answerMessage = `For field "${field}": ${JSON.stringify(value)}`
        addMessage({
          role: 'user',
          content: answerMessage,
          timestamp: new Date().toISOString(),
        })

        // Update data with the answer
        const newData: Partial<T> = {
          ...data,
          [field]: value,
        }

        // Call AI with updated context
        const response = await callAI(
          'Continue filling the form with the provided information',
          newData
        )
        if (!response) return

        // Merge results
        const mergedData: Partial<T> = {
          ...newData,
          ...response.filled,
        }
        setData(mergedData)

        // Update summary
        setSummary(response.summary || null)

        // Add assistant response (use summary as content)
        addMessage({
          role: 'assistant',
          content:
            response.summary ||
            response.assistantMessage ||
            JSON.stringify(response.filled || {}),
          timestamp: new Date().toISOString(),
        })

        // Handle next state
        if (response.clarifications && response.clarifications.length > 0) {
          setClarifications(response.clarifications)
          setStatus('clarifying')
        } else if (response.complete) {
          setStatus('complete')
          onComplete?.(mergedData)
        } else {
          setStatus('idle')
        }
      } catch (err) {
        setStatus('error')
      }
    },
    [data, callAI, addMessage, onComplete]
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
