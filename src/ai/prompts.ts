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
 */
function formatField(field: FormFieldDefinition, indent = ''): string {
  const simpleKey = field.key.includes('.')
    ? field.key.split('.').pop()!
    : field.key

  let line = `${indent}"${simpleKey}"`

  // Add type hint
  if (field.literalOptions && field.literalOptions.length > 0) {
    line += `: ${field.literalOptions.map((o) => `"${o}"`).join(' | ')}`
  } else if (field.type === 'array') {
    line += `: [...]`
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
 */
export function buildSystemPrompt(): string {
  return `You are a form-filling assistant. Extract data ONLY from what the user explicitly says.

EXTRACTION PATTERNS - extract these when user says:
- "called X" or "named X" → productName = X
- "it's a X" or "it does X" or "X tool" → productDescription = that phrase
- "target X" or "search for X" or "find X" → discoveryQuery = X
- "reply by X" or "reply with X" or "want it to reply X" → replyContext = that description
- "friendly/professional/witty" → tone = that word

CRITICAL RULES:
✓ Extract MULTIPLE fields from one sentence
✓ Use user's EXACT words for string fields (productDescription, replyContext, etc.)
✓ ONLY fill fields the user mentioned

✗ NEVER invent URLs - leave productUrl empty unless user provides one
✗ NEVER fill options/numbers unless user specifies them
✗ NEVER guess or make up values`
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
 */
export function buildUnifiedPrompt(params: {
  userPrompt: string
  schemaDescription: string
  currentData: Record<string, unknown>
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}): string {
  const { userPrompt, schemaDescription, currentData } = params

  let prompt = `You extract form data from natural language.

## FORM SCHEMA:

${schemaDescription}

## EXTRACTION PATTERNS:

Match these patterns in user text:
- "called X", "named X", "is called X" → productName = X
- "it's a X", "is a X", "X tool", "X platform" → productDescription = that phrase
- "target X", "focus on X", "for X chain" → discoveryQuery = X
- "reply X", "want it to reply X", "respond by X" → replyContext = the description
- "friendly", "professional", "witty" → tone = that word

## CURRENT DATA:

${JSON.stringify(currentData, null, 2)}

## NOW EXTRACT FROM:

"${userPrompt}"

Return JSON with CURRENT DATA values + all extracted fields.`

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
