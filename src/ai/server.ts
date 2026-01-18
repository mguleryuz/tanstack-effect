/**
 * @description Server-side AI form filler functions
 * Used by SDK consumers in their API routes
 */

import { google } from '@ai-sdk/google'
import { generateText, Output } from 'ai'
import { z } from 'zod'

import {
  buildContextFromHistory,
  buildFollowUpPrompt,
  buildSchemaDescription,
  buildSystemPrompt,
  buildUserPrompt,
} from './prompts'
import type {
  AIFormFillerRequest,
  AIFormFillerResponse,
  AIFormFillerStreamChunk,
} from './types'

/**
 * @description Build a single field's Zod schema recursively
 * All fields are optional to allow AI to leave them empty when not in user input.
 * This prevents the AI from inventing placeholder values.
 */
function buildFieldSchema(
  field: AIFormFillerRequest['fields'][string]
): z.ZodTypeAny {
  // Build description with extraction guidance
  const baseDesc = [field.label || field.key, field.description]
    .filter(Boolean)
    .join(' - ')

  // All fields are optional to allow AI to leave them empty when not in user input
  const applyOptional = <T extends z.ZodTypeAny>(schema: T): z.ZodTypeAny => {
    return schema.optional().nullable()
  }

  switch (field.type) {
    case 'number':
      return applyOptional(z.number().describe(baseDesc))
    case 'boolean':
      return applyOptional(z.boolean().describe(baseDesc))
    case 'array':
      // If array has children (array of objects), build nested schema
      if (field.children && Object.keys(field.children).length > 0) {
        const itemSchema = buildNestedObjectSchema(field.children)
        return applyOptional(z.array(itemSchema).describe(baseDesc))
      }
      // For primitive arrays or arrays with literalOptions
      if (field.literalOptions && field.literalOptions.length > 0) {
        const arrDesc = `${baseDesc}. Valid values: ${field.literalOptions.join(', ')}. Interpret user's language to these values.`
        return applyOptional(
          z
            .array(
              z.enum(field.literalOptions.map(String) as [string, ...string[]])
            )
            .describe(arrDesc)
        )
      }
      return applyOptional(z.array(z.string()).describe(baseDesc))
    case 'object':
      // If object has children, recursively build the nested schema
      if (field.children && Object.keys(field.children).length > 0) {
        const nestedSchema = buildNestedObjectSchema(field.children)
        return applyOptional(nestedSchema.describe(baseDesc))
      }
      // Fallback for objects without defined children
      return applyOptional(z.record(z.unknown()).describe(baseDesc))
    case 'literal':
      if (field.literalOptions && field.literalOptions.length > 0) {
        const enumDesc = `${baseDesc}. Valid options: ${field.literalOptions.join(', ')}. Match user's descriptive words to the closest option.`
        return applyOptional(
          z
            .enum(field.literalOptions.map(String) as [string, ...string[]])
            .describe(enumDesc)
        )
      }
      return applyOptional(z.string().describe(baseDesc))
    case 'string':
    default:
      return applyOptional(z.string().describe(baseDesc))
  }
}

/**
 * @description Build a nested object schema from children fields
 */
function buildNestedObjectSchema(
  children: Record<string, AIFormFillerRequest['fields'][string]>
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const schemaObj: Record<string, z.ZodTypeAny> = {}

  Object.entries(children).forEach(([key, childField]) => {
    // Use the simple key name (last part after dots)
    const simpleKey = key.includes('.') ? key.split('.').pop()! : key
    schemaObj[simpleKey] = buildFieldSchema(childField)
  })

  return z.object(schemaObj)
}

/**
 * @description Convert FormFieldDefinition to Zod schema for AI structured output
 * Includes field descriptions to help the AI understand what each field is for
 * Recursively handles nested objects and arrays
 */
function buildZodSchema(
  fields: AIFormFillerRequest['fields']
): z.ZodType<Record<string, unknown>> {
  const schemaObj: Record<string, z.ZodTypeAny> = {}

  // Only process root-level fields (no dots in key)
  Object.entries(fields).forEach(([key, field]) => {
    if (!key.includes('.')) {
      schemaObj[key] = buildFieldSchema(field)
    }
  })

  return z.object(schemaObj) as z.ZodType<Record<string, unknown>>
}

/**
 * @description Get value at nested path like "marketing.productName"
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * @description Recursively collect all fields including nested ones
 */
function collectAllFields(
  fields: AIFormFillerRequest['fields'],
  result: Array<{
    key: string
    field: AIFormFillerRequest['fields'][string]
  }> = []
): Array<{ key: string; field: AIFormFillerRequest['fields'][string] }> {
  for (const [key, field] of Object.entries(fields)) {
    result.push({ key, field })

    // Recursively collect children
    if (field.children && Object.keys(field.children).length > 0) {
      collectAllFields(field.children, result)
    }
  }
  return result
}

/**
 * @description Detect which required fields are missing from filled data
 * Handles both flat keys and nested paths (e.g., "marketing.productName")
 * Returns array of objects with both key and label for proper lookups
 */
function detectMissingFields(
  fields: AIFormFillerRequest['fields'],
  filled: Record<string, unknown>
): Array<{ key: string; label: string }> {
  // Collect all fields including nested children
  const allFields = collectAllFields(fields)

  return allFields
    .filter(({ key, field }) => {
      if (!field.required) return false

      // Check nested path
      const value = getNestedValue(filled, key)
      return value === undefined || value === null || value === ''
    })
    .map(({ key, field }) => ({
      key,
      label: field.label || field.key || key,
    }))
}

/**
 * @description Core function to fill form with AI
 */
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'

export async function fillFormWithAI(
  request: AIFormFillerRequest
): Promise<AIFormFillerResponse> {
  // Verify API key is available (ai-sdk reads from GOOGLE_GENERATIVE_AI_API_KEY)
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable')
  }

  try {
    const schemaDescription = buildSchemaDescription(request.fields)
    const systemPrompt = buildSystemPrompt()

    // Build user message based on whether this is initial or follow-up
    let userMessage: string
    // Filter out system messages for AI SDK compatibility
    const historyForContext = (request.messages || []).filter(
      (m) => m.role !== 'system'
    )
    const contextFromHistory = buildContextFromHistory(
      historyForContext as Array<{
        role: 'user' | 'assistant'
        content: string
      }>
    )

    // Include current form state as context for the AI
    const currentStateContext =
      request.partialData && Object.keys(request.partialData).length > 0
        ? `\n\nCurrent Form State (use as context, include in output):\n${JSON.stringify(request.partialData, null, 2)}`
        : ''

    if (request.messages && request.messages.length > 0) {
      // This is a follow-up - find the most recent user message
      const lastUserMessage = request.messages
        .slice()
        .reverse()
        .find((m) => m.role === 'user')

      if (lastUserMessage) {
        userMessage = buildFollowUpPrompt(
          schemaDescription,
          lastUserMessage.content,
          '', // field name would need to be extracted
          request.partialData || {}
        )
      } else {
        userMessage =
          buildUserPrompt(request.prompt, schemaDescription) +
          currentStateContext
      }
    } else {
      userMessage =
        buildUserPrompt(request.prompt, schemaDescription) + currentStateContext
    }

    // Build the full prompt with context
    const fullUserMessage = userMessage + contextFromHistory

    // Call AI with structured output using Output.object pattern
    const zodSchema = buildZodSchema(request.fields)

    const result = await generateText({
      model: google(DEFAULT_MODEL),
      prompt: `${systemPrompt}\n\n${fullUserMessage}`,

      output: Output.object({ schema: zodSchema as any }),
    })

    if (!result.output) {
      throw new Error('AI returned no structured output')
    }

    // AI output already includes existing values (provided in context)
    // The AI is instructed to preserve them
    const filled = result.output as Record<string, unknown>

    // Detect missing required fields from the MERGED result
    const missingFields = detectMissingFields(request.fields, filled)

    // Generate clarification questions for missing required fields
    const clarifications = missingFields.map((missing) => {
      const field = request.fields[missing.key]
      return {
        field: missing.key,
        question: `Please provide: ${missing.label}${field?.description ? ` - ${field.description}` : ''}`,
        type: (field?.type === 'literal' ? 'choice' : 'text') as
          | 'choice'
          | 'text',
        options:
          field?.literalOptions?.map((opt) => ({
            value: String(opt),
            label: String(opt),
          })) || undefined,
      }
    })

    // Convert to label strings for backward compatibility
    const missingLabels = missingFields.map((m) => m.label)

    // Generate detailed, conversational summary explaining what was filled
    const summaryParts: string[] = []

    // Describe what was filled with context
    const filledDescriptions: string[] = []
    for (const [key, value] of Object.entries(filled)) {
      if (value !== undefined && value !== null) {
        const field = request.fields[key]
        if (field && typeof value !== 'object') {
          filledDescriptions.push(`**${field.label || key}**: ${value}`)
        } else if (typeof value === 'object' && value !== null) {
          // For nested objects, describe the contents
          const nested = value as Record<string, unknown>
          const nestedDescs: string[] = []
          for (const [nKey, nValue] of Object.entries(nested)) {
            if (nValue !== undefined && nValue !== null) {
              const fullKey = `${key}.${nKey}`
              const nestedField =
                field?.children?.[fullKey] || field?.children?.[nKey]
              const label = nestedField?.label || nKey
              if (Array.isArray(nValue)) {
                nestedDescs.push(`${label}: ${nValue.join(', ')}`)
              } else {
                nestedDescs.push(`${label}: ${nValue}`)
              }
            }
          }
          if (nestedDescs.length > 0) {
            filledDescriptions.push(
              `**${field?.label || key}**:\n${nestedDescs.map((d) => `  • ${d}`).join('\n')}`
            )
          }
        }
      }
    }

    if (filledDescriptions.length > 0) {
      summaryParts.push(
        `I've filled in the following based on your input:\n\n${filledDescriptions.join('\n\n')}`
      )
    } else {
      summaryParts.push("I couldn't extract any field values from your input.")
    }

    // Add context about missing fields
    if (missingLabels.length > 0) {
      summaryParts.push(
        `\n\nI still need information for: ${missingLabels.join(', ')}`
      )
    }

    const summary = summaryParts.join('')

    return {
      filled,
      missing: missingLabels,
      clarifications,
      complete: missingLabels.length === 0,
      summary,
    }
  } catch (error) {
    console.error('AI form filler error:', error)
    throw error
  }
}

/**
 * @description Streaming version for progressive updates
 */
export async function* streamFormFill(
  request: AIFormFillerRequest
): AsyncGenerator<AIFormFillerStreamChunk> {
  try {
    const result = await fillFormWithAI(request)

    // Yield filled fields as they're being processed
    if (Object.keys(result.filled).length > 0) {
      yield {
        filled: result.filled,
      }
    }

    // Yield clarifications if needed
    if (result.clarifications.length > 0) {
      yield {
        clarifications: result.clarifications,
        missing: result.missing,
      }
    }

    // Final complete status
    yield {
      complete: result.complete,
      done: true,
    }
  } catch (error) {
    console.error('Stream error:', error)
    yield {
      done: true,
      complete: false,
    }
  }
}

/**
 * @description Options for createAIFormFillerHandler
 */
export interface AIFormFillerHandlerOptions {
  /**
   * @description Custom authentication function
   * Return true if authenticated, false otherwise
   * If not provided, no authentication is performed
   */
  authenticate?: (req: Request) => Promise<boolean> | boolean
}

/**
 * @description Convenience handler for Next.js/Express routes
 * @param options - Handler configuration options
 * @returns Request handler function
 * @example
 * // Next.js App Router with authentication
 * import { createAIFormFillerHandler } from 'tanstack-effect'
 * import { auth } from '@/auth'
 *
 * const handler = createAIFormFillerHandler({
 *   authenticate: async () => {
 *     const session = await auth()
 *     return !!session?.user
 *   }
 * })
 *
 * export const POST = handler
 */
export function createAIFormFillerHandler(
  options?: AIFormFillerHandlerOptions
) {
  return async (req: Request): Promise<Response> => {
    try {
      if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Handle authentication if provided
      if (options?.authenticate) {
        const isAuthenticated = await options.authenticate(req)
        if (!isAuthenticated) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }

      const body = (await req.json()) as AIFormFillerRequest

      // Validate request
      if (!body.prompt || !body.fields) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: prompt, fields' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const response = await fillFormWithAI(body)

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('Form filler handler error:', error)
      return new Response(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : 'Internal server error',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
}
