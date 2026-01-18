/**
 * @description Shared types for AI Form Filler
 * Used for communication between client hook and server functions
 */

import type { FormFieldDefinition } from '../schema-form'

/**
 * @description A single message in the conversation history
 */
export interface AIFormMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
}

/**
 * @description A clarification question for the user
 */
export interface ClarificationQuestion {
  field: string
  question: string
  type: 'choice' | 'multiselect' | 'text'
  options?: Array<{ value: string; label: string; description?: string }>
}

/**
 * @description Request payload for AI form filler API
 */
export interface AIFormFillerRequest {
  prompt: string
  fields: Record<string, FormFieldDefinition>
  messages: AIFormMessage[]
  partialData?: Record<string, unknown>
}

/**
 * @description Response from AI form filler API
 */
export interface AIFormFillerResponse {
  filled: Record<string, unknown>
  missing: string[]
  clarifications: ClarificationQuestion[]
  complete: boolean
  assistantMessage?: string
}

/**
 * @description Streaming response chunk
 */
export interface AIFormFillerStreamChunk extends Partial<AIFormFillerResponse> {
  done?: boolean
}

/**
 * @description Configuration for AI form filler
 */
export interface AIFormFillerConfig {
  model?: string
  apiKey?: string
  temperature?: number
  maxTokens?: number
}
