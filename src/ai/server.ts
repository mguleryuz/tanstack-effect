/**
 * @description Server-side AI form filler functions
 * Used by SDK consumers in their API routes
 */

import { google } from '@ai-sdk/google'
import { generateText, jsonSchema, Output } from 'ai'

import {
  buildSchemaDescription,
  buildSystemPrompt,
  buildUnifiedPrompt,
} from './prompts'
import type {
  AIFormFillerRequest,
  AIFormFillerResponse,
  AIFormFillerStreamChunk,
} from './types'

/**
 * @description Build JSON Schema property from field definition
 * Note: Gemini has strict JSON Schema requirements - no nullable types
 */
function buildJsonSchemaProperty(
  field: AIFormFillerRequest['fields'][string]
): Record<string, unknown> {
  const prop: Record<string, unknown> = {}

  if (field.description) {
    prop.description = field.description
  }

  // Mark as nullable for Gemini
  prop.nullable = true

  switch (field.type) {
    case 'number':
      prop.type = 'number'
      break
    case 'boolean':
      prop.type = 'boolean'
      break
    case 'array':
      prop.type = 'array'
      if (field.literalOptions && field.literalOptions.length > 0) {
        prop.items = { type: 'string', enum: field.literalOptions }
      } else {
        prop.items = { type: 'string' }
      }
      break
    case 'object':
      prop.type = 'object'
      if (field.children && Object.keys(field.children).length > 0) {
        prop.properties = buildJsonSchemaProperties(field.children)
      }
      break
    case 'literal':
      prop.type = 'string'
      if (field.literalOptions && field.literalOptions.length > 0) {
        prop.enum = field.literalOptions
      }
      break
    case 'string':
    default:
      prop.type = 'string'
  }

  return prop
}

/**
 * @description Build JSON Schema properties from nested children
 */
function buildJsonSchemaProperties(
  children: Record<string, AIFormFillerRequest['fields'][string]>
): Record<string, unknown> {
  const properties: Record<string, unknown> = {}

  Object.entries(children).forEach(([key, field]) => {
    const simpleKey = key.includes('.') ? key.split('.').pop()! : key
    properties[simpleKey] = buildJsonSchemaProperty(field)
  })

  return properties
}

/**
 * @description Convert FormFieldDefinition to JSON Schema
 * Exported for testing
 */
export function buildJsonSchema(
  fields: AIFormFillerRequest['fields']
): Record<string, unknown> {
  const properties: Record<string, unknown> = {}

  // Only process root-level fields (no dots in key)
  Object.entries(fields).forEach(([key, field]) => {
    if (!key.includes('.')) {
      properties[key] = buildJsonSchemaProperty(field)
    }
  })

  return {
    type: 'object',
    properties,
  }
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
const DEFAULT_MODEL = 'gemini-2.5-flash'

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
    const currentData = request.partialData || {}

    // Filter conversation history (exclude system messages)
    const history = (request.messages || [])
      .filter((m) => m.role !== 'system')
      .slice(-10) as Array<{ role: 'user' | 'assistant'; content: string }>

    // Simple unified prompt: always include schema + currentData + history
    const userMessage = buildUnifiedPrompt({
      userPrompt: request.prompt,
      schemaDescription,
      currentData,
      history,
    })

    const fullUserMessage = userMessage

    // Build JSON Schema for structured output
    const schema = buildJsonSchema(request.fields)

    const result = await generateText({
      model: google(DEFAULT_MODEL),
      prompt: `${systemPrompt}\n\n${fullUserMessage}`,
      // Temperature 0 for most deterministic extraction
      temperature: 0,
      output: Output.object({
        schema: jsonSchema(schema as Parameters<typeof jsonSchema>[0]),
      }),
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

    // Missing fields info is added by the hook with more detail

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
