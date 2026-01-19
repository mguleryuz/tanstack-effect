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

  // Add conditional requirement indicator
  if (field.requiredWhen) {
    if (field.requiredWhen.value !== undefined) {
      line += ` [required when ${field.requiredWhen.field} = ${JSON.stringify(field.requiredWhen.value)}]`
    } else if (field.requiredWhen.notValue !== undefined) {
      line += ` [required when ${field.requiredWhen.field} != ${JSON.stringify(field.requiredWhen.notValue)}]`
    }
  } else if (field.required) {
    line += ` [required]`
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
  return `You are a form-filling assistant. Your job is to extract ALL information from natural language into a JSON form.

KEY RULES:
1. Extract EVERY field the user mentions - do not skip any
2. Match "X name" or "X is Y" to the appropriate field (e.g., "product name is Z" → productName: "Z")  
3. Match "X description" or "it's a Y" to description fields (e.g., "product description is Z" → productDescription: "Z")
4. Convert language names to ISO codes in arrays (English→en, Chinese→zh, Spanish→es, etc.)
5. Never invent values for fields the user didn't mention
6. Preserve existing form data unless explicitly changed`
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

  const prompt = `Extract form data from the user's input.

SCHEMA (fields to fill):
${schemaDescription}

CURRENT DATA (preserve these values):
${JSON.stringify(currentData, null, 2)}

USER INPUT:
"${userPrompt}"

TASK: Parse the user's input and extract values for each field mentioned.

Field matching guide:
- "product name X" or "called X" → productName: "X"
- "product description Y" or "it's a Y" → productDescription: "Y"
- "preferred language Z" or "languages: Z" → preferredLanguages: [ISO codes]
- "discovery instructions W" or "for discovery, W" → discoveryInstructions: "W"
- "reply context V" or "reply V" → replyContext: "V"
- "image eval instructions U" or "for images, U" → imageEvalInstructions: "U"
- "disable X" → set X's enabled field to false
- "enable X" → set X's enabled field to true

Language ISO codes: en=English, zh=Chinese, es=Spanish, fr=French, de=German, ja=Japanese, ko=Korean

IMPORTANT: Extract ALL fields mentioned. Do not skip any. Do not invent values.

Return merged JSON with current data + extracted values.`

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
