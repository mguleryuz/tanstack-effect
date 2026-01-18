/**
 * @description Prompt templates for AI form filler
 */

import type { FormFieldDefinition } from '../schema-form'

/**
 * @description Format a single field for AI consumption
 */
function formatFieldDescription(
  field: FormFieldDefinition,
  indent = ''
): string {
  const lines: string[] = []

  // Field identifier and status
  const fieldKey = field.key
  const status = field.required ? 'REQUIRED' : 'optional'
  lines.push(`${indent}**${fieldKey}** [${field.type}] (${status})`)

  // Human-readable label
  if (field.label) {
    lines.push(`${indent}  Label: ${field.label}`)
  }

  // Description - this is critical for AI understanding
  if (field.description) {
    lines.push(`${indent}  Description: ${field.description}`)
  }

  // Valid options for choice fields (including arrays with literalOptions)
  if (field.literalOptions && field.literalOptions.length > 0) {
    if (field.type === 'array') {
      lines.push(
        `${indent}  Select from: ${field.literalOptions.map((opt) => `"${opt}"`).join(', ')}`
      )
      lines.push(`${indent}  (Interpret user intent to match valid options)`)
    } else {
      lines.push(
        `${indent}  Valid options: ${field.literalOptions.map((opt) => `"${opt}"`).join(', ')}`
      )
    }
  }

  // Constraints
  if (field.min !== undefined || field.max !== undefined) {
    const constraints: string[] = []
    if (field.min !== undefined) constraints.push(`min: ${field.min}`)
    if (field.max !== undefined) constraints.push(`max: ${field.max}`)
    lines.push(`${indent}  Constraints: ${constraints.join(', ')}`)
  }

  return lines.join('\n')
}

/**
 * @description Recursively collect all fields including nested children
 */
function collectAllFieldsForDescription(
  fields: Record<string, FormFieldDefinition>,
  result: FormFieldDefinition[] = []
): FormFieldDefinition[] {
  for (const field of Object.values(fields)) {
    result.push(field)
    // Recursively collect children
    if (field.children) {
      collectAllFieldsForDescription(field.children, result)
    }
  }
  return result
}

/**
 * @description Build a schema description for the AI
 * Formats each field with its description to help AI understand context
 * Recursively includes all nested children fields
 */
export function buildSchemaDescription(
  fields: Record<string, FormFieldDefinition>
): string {
  // Collect all fields including nested ones
  const allFields = collectAllFieldsForDescription(fields)

  const fieldDescriptions = allFields
    .map((field) => formatFieldDescription(field))
    .join('\n\n')

  return fieldDescriptions
}

/**
 * @description Build the system prompt for form filling
 */
export function buildSystemPrompt(): string {
  return `You are an intelligent form-filling assistant. Your task is to extract information from user descriptions and fill out form fields.

CRITICAL RULES:
1. ONLY fill fields with values EXPLICITLY mentioned or clearly implied by the user
2. NEVER invent placeholder values, sample URLs, or generic examples
3. NEVER make up discovery queries, hashtags, or content not mentioned by the user
4. If a value is not in the user's input, LEAVE IT EMPTY - do not guess

READ THE SCHEMA CAREFULLY - each field has:
- A key and label identifying what it represents
- A description explaining what it's for
- Required/optional status  
- Valid options for choice/enum fields

SEMANTIC INTERPRETATION:
- Interpret natural language to valid enum options (e.g., "witty" → "witty", "professional" → "professional")
- Convert language names to ISO codes: "english" → "en", "chinese" → "zh", "spanish" → "es", "french" → "fr", "german" → "de", "japanese" → "ja", "korean" → "ko"
- Extract product context: If user mentions a blockchain/platform (e.g., "Base", "Binance Smart Chain"), use it to inform relevant fields like discovery queries
- Match tone descriptions to valid options (e.g., "should be witty" → tone: "witty")

EXTRACTION RULES:
1. ACTIVELY LOOK for values that match each field based on its description
2. For array fields, include ALL mentioned items that match valid options
3. Extract labeled, quoted, or described values directly
4. If CURRENT FORM STATE is provided, include those values in your output
5. If user mentions a concept but doesn't give a specific value, leave it empty for clarification

OUTPUT FORMAT:
- Return a nested JSON object matching the schema structure
- Numbers as numbers, strings as strings, arrays as arrays
- ONLY include fields you can confidently fill from the user's input`
}

/**
 * @description Build user prompt for initial fill attempt
 */
export function buildUserPrompt(
  userPrompt: string,
  schemaDescription: string
): string {
  return `FORM SCHEMA:

${schemaDescription}

USER INPUT:
${userPrompt}

TASK: Extract information from the user's input and fill the form fields.

CRITICAL - DO NOT INVENT VALUES:
- ONLY use values the user EXPLICITLY provides or clearly implies
- If the user doesn't mention a URL, DO NOT invent one like "https://example.com"
- If the user doesn't mention a search query, DO NOT create hashtags or sample queries
- If a required field has no value in the input, LEAVE IT EMPTY - we will ask the user

SEMANTIC INTERPRETATION:
- "english" → "en", "chinese" → "zh", "spanish" → "es", etc.
- Match descriptive words to valid enum options ("witty", "friendly", "professional", etc.)
- If user mentions a platform/blockchain (Base, BSC, Ethereum), note it for relevant context fields

EXTRACTION APPROACH:
1. Read each field's Label and Description to understand what it represents
2. Scan the user input for ANY mention of relevant information
3. For choice fields, match user's words to the closest valid option
4. For arrays, include ALL matching items mentioned
5. Leave fields empty if no relevant information is present`
}

/**
 * @description Build continuation prompt for follow-up answers
 */
export function buildFollowUpPrompt(
  schemaDescription: string,
  userAnswer: string,
  field: string,
  previousFilled: Record<string, unknown>
): string {
  return `FORM SCHEMA:

${schemaDescription}

CURRENT FORM STATE:
${JSON.stringify(previousFilled, null, 2)}

USER INPUT: ${userAnswer}
${field ? `(Answering for: ${field})` : ''}

TASK: Update the form with the user's new input.

CRITICAL - DO NOT INVENT VALUES:
- ONLY use values the user EXPLICITLY provides
- DO NOT invent URLs, queries, or placeholder content
- If a field has no value mentioned, keep it empty or unchanged

RULES:
- Include existing values from current state (preserve what's already filled)
- Add/update fields based on the new user input
- Match user's words to valid enum options when applicable
- Interpret language names as ISO codes ("english" → "en", "chinese" → "zh")
- Return complete form data as nested JSON`
}

/**
 * @description Build context from conversation history
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
