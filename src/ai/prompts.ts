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
import type { AIFormRule } from './types'

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
 *
 * Uses Variable Substitution Semantic Reasoning (X, Y, Z pattern matching)
 * to keep prompts generic across any schema.
 */
export function buildSystemPrompt(): string {
  return `You are a form-filling assistant. Extract information from natural language into JSON.

SEMANTIC PATTERN MATCHING (X → field, Y → value):
- "X is Y" or "X: Y" → set field X to value Y
- "the X is Y" or "my X is Y" → set field X to value Y  
- "X name is Y" or "called Y" → set the name-related field to Y
- "X description is Y" or "it's a Y" → set the description-related field to Y
- "for X, do Y" or "X should Y" → set field X to instruction Y
- "enable X" or "turn on X" → set X.enabled = true
- "disable X" or "turn off X" → set X.enabled = false
- "update X to Y" or "change X to Y" → replace field X with value Y

TYPE CONVERSIONS:
- For enum/literal fields, map user input to valid options from schema (check field's allowed values)
- "yes/true/on" → true, "no/false/off" → false
- Numeric words → numbers ("fifty" → 50)

EXTRACTION RULES:
1. Match user phrases to schema field names/labels (case-insensitive, ignore spaces)
2. Extract EVERY field the user mentions - do not skip any
3. Never invent values for fields not mentioned
4. Preserve existing data unless explicitly changed

REFERENTIAL REASONING (meta-instructions are NOT values):
- "align with X" or "match X" or "same as X" → examine X in CURRENT DATA, generate content that matches its style/tone/context
- "based on X" or "like X" → use X as reference to generate appropriate content
- NEVER literally copy phrases like "align with our configs" as field values
- If referential context cannot be resolved, leave field unchanged

INTENT OVER LITERAL:
- Understand what user MEANS, not just literal words
- "make it friendly" → generate friendly-toned content for the relevant field
- "keep it short" → generate concise content`
}

/**
 * @description Build user prompt for initial fill attempt (legacy)
 */
export function buildUserPrompt(
  userPrompt: string,
  schemaDescription: string,
  rules?: AIFormRule[]
): string {
  return buildUnifiedPrompt({
    userPrompt,
    schemaDescription,
    currentData: {},
    history: [],
    rules,
  })
}

/**
 * @description Build field-specific rules section for the prompt
 */
function buildRulesSection(rules: AIFormRule[]): string {
  if (!rules || rules.length === 0) return ''

  const rulesLines = rules.map((r) => `- "${r.field}": ${r.rule}`)

  return `
FIELD-SPECIFIC RULES:
${rulesLines.join('\n')}
`
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
  rules?: AIFormRule[]
}): string {
  const { userPrompt, schemaDescription, currentData, rules } = params

  const rulesSection = buildRulesSection(rules || [])

  const prompt = `Extract form data from user input using semantic pattern matching.

SCHEMA (available fields - match user input to these):
${schemaDescription}
${rulesSection}
CURRENT DATA (preserve unless explicitly changed):
${JSON.stringify(currentData, null, 2)}

USER INPUT:
"${userPrompt}"

SEMANTIC EXTRACTION (X = field reference, Y = value):
Match user phrases to schema fields using these patterns:
- "X is Y" / "X: Y" / "the X is Y" → field X = Y
- "X name Y" / "called Y" → name field = Y
- "X description Y" / "it's a Y" → description field = Y
- "for X, Y" / "X instructions Y" → instruction field = Y
- "enable X" / "disable X" → X.enabled = true/false
- "update X to Y" / "set X to Y" / "change X to Y" → field X = Y

TYPE INFERENCE:
- Enum/literal fields → map user input to valid schema options (check allowed values in schema)
- Boolean words → true/false
- Array indicators ("X and Y", "X, Y, Z") → [X, Y, Z]

REFERENTIAL REASONING (CRITICAL):
When user says "align with X", "match X", "same as X", "based on other fields":
1. This is an INSTRUCTION, not a literal value - do NOT copy it verbatim
2. Examine CURRENT DATA to understand existing context/style/tone
3. Generate appropriate content that semantically matches that context
4. If no relevant context exists, leave field unchanged

EXTRACTION RULES:
- Match ALL fields user mentions
- Do NOT invent values for unmentioned fields
- Preserve existing data unless explicitly updated
${rules && rules.length > 0 ? '- Follow FIELD-SPECIFIC RULES for those fields' : ''}

Return merged JSON: CURRENT DATA + extracted/generated values.`

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
