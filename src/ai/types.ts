/**
 * @description Shared types for AI Form Filler
 * Used for communication between client hook and server functions
 */

import type { FormFieldDefinition } from '../schema-form'

/**
 * @description Utility type to extract all dot-notation paths from a nested object type
 * Used for strongly-typed field references in AI rules
 * @example Paths<{ a: { b: string, c: number } }> = "a" | "a.b" | "a.c"
 */
export type Paths<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? `${Prefix}${K}` | Paths<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`
    }[keyof T & string]
  : never

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
 * @description Custom rule/context for a specific form field (strongly typed)
 * Allows schema owners to provide additional guidance to the AI
 * @example { field: "marketing.discoveryQuery", rule: "Use Twitter search syntax..." }
 */
export interface AIFormRule<T = unknown> {
  /**
   * @description The field key this rule applies to (supports dot notation)
   * When T is provided, this is strongly typed to valid paths
   * @example "marketing.discoveryQuery" or "options.maxRepliesPerRun"
   */
  field: T extends object ? Paths<T> : string
  /**
   * @description The rule/context to provide to the AI for this field
   * @example "Use Twitter search syntax: OR for alternatives, # for hashtags, from: for users"
   */
  rule: string
}

/**
 * @description Request payload for AI form filler API
 */
export interface AIFormFillerRequest {
  prompt: string
  fields: Record<string, FormFieldDefinition>
  messages: AIFormMessage[]
  partialData?: Record<string, unknown>
  /**
   * @description Optional custom rules/context for specific fields
   * These provide additional guidance to the AI for edge cases
   */
  rules?: AIFormRule[]
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
  /**
   * @description Human-readable summary of what was filled
   * @example "Filled 3 fields: projectName, projectType, teamSize"
   */
  summary: string
}

/**
 * @description Streaming response chunk
 */
export interface AIFormFillerStreamChunk extends Partial<AIFormFillerResponse> {
  done?: boolean
}
