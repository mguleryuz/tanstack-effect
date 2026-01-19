/**
 * @description Prompt templates for AI form filler
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                              ⚠️  WARNING  ⚠️                                  ║
 * ║                                                                              ║
 * ║  THIS IS A GENERIC MODULE - DO NOT ADD HARDCODED FIELD NAMES OR VALUES!     ║
 * ║                                                                              ║
 * ║  ❌ NO hardcoded field names (e.g., "productName", "discoveryQuery")         ║
 * ║  ❌ NO hardcoded enum values (e.g., "friendly", "professional")              ║
 * ║  ❌ NO domain-specific examples (e.g., "Breadcrumb", "#BSC")                 ║
 * ║  ❌ NO brand names or product references                                     ║
 * ║                                                                              ║
 * ║  ✅ Reference "the schema" or "field descriptions" generically              ║
 * ║  ✅ Use patterns like "name fields", "URL fields", "description fields"     ║
 * ║  ✅ Keep examples abstract (e.g., "called X", "it's a Y")                   ║
 * ║                                                                              ║
 * ║  The schema description (built from FormFieldDefinition) provides all       ║
 * ║  field-specific context the AI needs. Prompts should remain schema-agnostic.║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import type { FormFieldDefinition } from '../schema-form'

/**
 * @description Format a field with proper indentation for nested structure
 * Includes label for better AI field matching
 */
function formatField(field: FormFieldDefinition, indent = ''): string {
  const simpleKey = field.key.includes('.')
    ? field.key.split('.').pop()!
    : field.key

  let line = `${indent}"${simpleKey}"`

  // Add label in parentheses if different from key
  if (
    field.label &&
    field.label.toLowerCase().replace(/\s+/g, '') !== simpleKey.toLowerCase()
  ) {
    line += ` (${field.label})`
  }

  // Add type hint - check array type FIRST to handle arrays with literal options correctly
  if (field.type === 'array') {
    if (field.literalOptions && field.literalOptions.length > 0) {
      line += `: [${field.literalOptions.map((o) => `"${o}"`).join(' | ')}]`
    } else {
      line += `: [...]`
    }
  } else if (field.literalOptions && field.literalOptions.length > 0) {
    line += `: ${field.literalOptions.map((o) => `"${o}"`).join(' | ')}`
  } else if (field.type === 'object') {
    line += `: { ... }`
  } else {
    line += `: ${field.type}`
  }

  // Add description as comment
  if (field.description) {
    line += `  // ${field.description}`
  }

  return line
}

/**
 * @description Build schema description showing nested structure
 */
export function buildSchemaDescription(
  fields: Record<string, FormFieldDefinition>
): string {
  const lines: string[] = ['{']

  // Process root-level fields only (no dots in key)
  Object.entries(fields).forEach(([key, field]) => {
    if (key.includes('.')) return

    if (field.type === 'object' && field.children) {
      // Object with children - show nested structure
      lines.push(`  "${key}": {`)
      if (field.description) {
        lines.push(`    // ${field.description}`)
      }

      // Add children with proper indentation
      Object.values(field.children).forEach((child) => {
        lines.push(formatField(child, '    '))
      })

      lines.push('  },')
    } else {
      // Simple field
      lines.push(formatField(field, '  ') + ',')
    }
  })

  lines.push('}')
  return lines.join('\n')
}

/**
 * @description Build the system prompt for form filling
 * MUST remain schema-agnostic - no hardcoded field names!
 */
export function buildSystemPrompt(): string {
  return `You are a form-filling assistant. Extract ALL data from natural language into schema fields.

HOW TO PARSE:
1. Identify field references in the text by matching words to camelCase schema keys:
   - "product name" matches productName
   - "product description" matches productDescription  
   - "reply context" matches replyContext
   - "preferred language" matches preferredLanguages
   - "discovery instructions" matches discoveryInstructions
   - "image" + "instructions" or "no images" matches imageEvalInstructions

2. The VALUE for each field is everything after the field reference until the next field reference begins.

3. For array fields, wrap in array and convert (e.g., "English" → ["en"]).

CRITICAL: Every field reference in the user's text MUST appear in your output. Do not skip any.`
}

/**
 * @description Build user prompt for initial fill attempt (legacy)
 */
export function buildUserPrompt(
  userPrompt: string,
  schemaDescription: string
): string {
  return buildUnifiedPrompt({
    userPrompt,
    schemaDescription,
    currentData: {},
    history: [],
  })
}

/**
 * @description Unified prompt builder - simple CRUD approach
 * MUST remain schema-agnostic - no hardcoded field names!
 */
export function buildUnifiedPrompt(params: {
  userPrompt: string
  schemaDescription: string
  currentData: Record<string, unknown>
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}): string {
  const { userPrompt, schemaDescription, currentData } = params

  const prompt = `Extract ALL form field values from the user's natural language input.

SCHEMA:
${schemaDescription}

CURRENT DATA:
${JSON.stringify(currentData, null, 2)}

USER INPUT:
"${userPrompt}"

EXTRACTION ALGORITHM:

STEP 1 - Identify every field mention in the input:
Look for words that match schema field keys (split camelCase into words):
- "product name" → productName
- "product description" → productDescription
- "preferred language" → preferredLanguages  
- "discovery instructions" → discoveryInstructions
- "reply context" → replyContext
- "no images" or "image instructions" → imageEvalInstructions

STEP 2 - Extract the value for each field:
The value is everything AFTER the field name until the NEXT field name starts.
Patterns to recognize:
- "[field] is [value]" → value is after "is"
- "[field] [value]" → value is right after field name (no "is" needed)
- "[field], [value]" → value is after comma

STEP 3 - Format values by type:
- String fields: use exact text
- Array fields: wrap in array, convert languages (English → ["en"])
- Negative instructions: "No images" → imageEvalInstructions: "No images"

CRITICAL RULES:
- Extract EVERY field the user mentioned - count them to verify
- Do NOT invent values for fields user didn't mention
- Preserve all CURRENT DATA values

OUTPUT: Complete JSON with current data + all extracted fields.`

  return prompt
}

/**
 * @description Build continuation prompt for follow-up answers
 * For long-running conversations: schema once, partialData always, messages always
 */
export function buildFollowUpPrompt(
  userMessage: string,
  currentData: Record<string, unknown>,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  options: {
    includeSchema?: boolean
    schemaDescription?: string
    maxMessages?: number
  } = {}
): string {
  const {
    includeSchema = false,
    schemaDescription = '',
    maxMessages = 10,
  } = options

  // Build conversation context (limited to recent messages, excluding the current one)
  const recentHistory = conversationHistory.slice(-maxMessages)
  const historyContext =
    recentHistory.length > 0
      ? recentHistory
          .map(
            (msg) =>
              `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
          )
          .join('\n')
      : ''

  let prompt = ''

  // Include schema only if requested (first message in conversation)
  if (includeSchema && schemaDescription) {
    prompt += `## FORM FIELDS:\n\n${schemaDescription}\n\n`
  }

  // Always include current form state
  prompt += `## CURRENT FORM STATE:\n\n${JSON.stringify(currentData, null, 2)}\n\n`

  // Include conversation history if exists
  if (historyContext) {
    prompt += `## CONVERSATION HISTORY:\n\n${historyContext}\n\n`
  }

  // Current user message
  prompt += `## USER MESSAGE:\n\n"${userMessage}"\n\n`

  // Extraction task
  prompt += `## TASK:

Extract information from the user's message and merge with current form state.

1. Match user's words to field names (case-insensitive: "reply context" → replyContext)
2. Parse patterns like "X is Y" or "set X to Y"
3. PRESERVE all existing values from CURRENT FORM STATE
4. ADD/UPDATE only fields mentioned by user
5. Return complete merged JSON`

  return prompt
}

/**
 * @description Build context from conversation history (legacy, kept for compatibility)
 */
export function buildContextFromHistory(
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
  if (history.length === 0) {
    return ''
  }

  const formattedHistory = history
    .slice(-6) // Keep last 6 messages (3 turns) to stay within token limits
    .map((msg) => {
      const label = msg.role === 'user' ? 'User' : 'Assistant'
      return `${label}: ${msg.content}`
    })
    .join('\n\n')

  return `\nConversation Context:\n${formattedHistory}`
}

/**
 * @description Build validation message when response is incomplete but user confirms
 */
export function buildValidationPrompt(
  filledValues: Record<string, unknown>,
  missingFields: string[]
): string {
  return `The following required fields are still missing: ${missingFields.join(', ')}

Currently filled fields: ${Object.keys(filledValues).join(', ')}

Should we proceed with the current values or provide more information for the missing fields?`
}
