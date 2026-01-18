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
  AIFormFillerConfig,
  AIFormFillerRequest,
  AIFormFillerResponse,
  AIFormFillerStreamChunk,
} from './types'

/**
 * @description Convert FormFieldDefinition to Zod schema for AI structured output
 * Includes field descriptions to help the AI understand what each field is for
 */
function buildZodSchema(
  fields: AIFormFillerRequest['fields']
): z.ZodType<Record<string, unknown>> {
  const schemaObj: Record<string, z.ZodTypeAny> = {}

  Object.entries(fields).forEach(([key]) => {
    const field = fields[key]
    let fieldSchema: z.ZodTypeAny

    // Build description from field metadata
    const description = [
      field.label || field.key,
      field.description,
      field.required ? '(required)' : '(optional)',
    ]
      .filter(Boolean)
      .join(' - ')

    switch (field.type) {
      case 'number':
        fieldSchema = z.number().describe(description).optional()
        break
      case 'boolean':
        fieldSchema = z.boolean().describe(description).optional()
        break
      case 'array':
        fieldSchema = z.array(z.unknown()).describe(description).optional()
        break
      case 'object':
        fieldSchema = z.record(z.unknown()).describe(description).optional()
        break
      case 'literal':
        if (field.literalOptions && field.literalOptions.length > 0) {
          const enumDesc = `${description}. Valid options: ${field.literalOptions.join(', ')}`
          fieldSchema = z
            .enum(field.literalOptions.map(String) as [string, ...string[]])
            .describe(enumDesc)
            .optional()
        } else {
          fieldSchema = z.string().describe(description).optional()
        }
        break
      case 'string':
      default:
        fieldSchema = z.string().describe(description).optional()
    }

    schemaObj[key] = fieldSchema
  })

  return z.object(schemaObj) as z.ZodType<Record<string, unknown>>
}

/**
 * @description Detect which required fields are missing from filled data
 */
function detectMissingFields(
  fields: AIFormFillerRequest['fields'],
  filled: Record<string, unknown>
): string[] {
  return Object.entries(fields)
    .filter(([key]) => {
      const field = fields[key]
      return field.required && !filled[key]
    })
    .map(([, field]) => field.key || '')
}

/**
 * @description Core function to fill form with AI
 */
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'

export async function fillFormWithAI(
  request: AIFormFillerRequest,
  config?: AIFormFillerConfig
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
        userMessage = buildUserPrompt(request.prompt, schemaDescription)
      }
    } else {
      userMessage = buildUserPrompt(request.prompt, schemaDescription)
    }

    // Build the full prompt with context
    const fullUserMessage = userMessage + contextFromHistory

    // Call AI with structured output using Output.object pattern
    const zodSchema = buildZodSchema(request.fields)

    const result = await generateText({
      model: google(DEFAULT_MODEL),
      prompt: `${systemPrompt}\n\n${fullUserMessage}`,
      output: Output.object({
        schema: zodSchema,
      }),
    })

    if (!result.output) {
      throw new Error('AI returned no structured output')
    }

    const response = { object: result.output }

    const filled = response.object as Record<string, unknown>

    // Detect missing required fields
    const missing = detectMissingFields(request.fields, filled)

    // Generate clarification questions for missing required fields
    const clarifications = missing.map((fieldName) => {
      const field = Object.values(request.fields).find(
        (f) => f.key === fieldName
      )
      return {
        field: fieldName,
        question: `Please provide information for: ${field?.label || fieldName}`,
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

    return {
      filled,
      missing,
      clarifications,
      complete: missing.length === 0,
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
  request: AIFormFillerRequest,
  config?: AIFormFillerConfig
): AsyncGenerator<AIFormFillerStreamChunk> {
  try {
    const result = await fillFormWithAI(request, config)

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
 * @description Convenience handler for Next.js/Express routes
 */
export function createAIFormFillerHandler(config?: AIFormFillerConfig) {
  return async (req: Request): Promise<Response> => {
    try {
      if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const body = (await req.json()) as AIFormFillerRequest

      // Validate request
      if (!body.prompt || !body.fields) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: prompt, fields' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const response = await fillFormWithAI(body, config)

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
