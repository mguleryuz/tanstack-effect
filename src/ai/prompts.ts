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
  return `You are an intelligent form-filling assistant. Your task is to extract ALL possible information from user descriptions and fill out form fields.

READ THE SCHEMA CAREFULLY - each field has:
- A key and label identifying what it represents
- A description explaining what it's for
- Required/optional status  
- Valid options for choice/enum fields

EXTRACTION RULES:
1. ACTIVELY LOOK for values that match each field based on its description - be thorough
2. INTERPRET natural language to valid options when the meaning is clear
3. For array fields, include ALL mentioned items that match the valid options
4. Extract labeled or quoted values directly
5. If CURRENT FORM STATE is provided, include those values in your output
6. ONLY leave fields empty if there's truly no information about them in the input

OUTPUT FORMAT:
- Return a nested JSON object matching the schema structure
- Numbers as numbers, strings as strings, arrays as arrays
- Fill as many fields as possible from the user's input`
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

TASK: Extract ALL information from the user's input and fill the form fields.

BE THOROUGH:
- Read EVERY field in the schema - use the Label and Description to understand what each field represents
- For each REQUIRED field, actively look for matching content in the user input
- INTERPRET natural language to valid enum options when the meaning is clear
- For array fields, include ALL mentioned values that match the valid options
- Extract labeled or quoted values directly

Fill as many fields as possible. Only leave a field empty if there's truly no information about it.`
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
- Include existing values from current state
- Add/update fields based on the new user input
- Match input to fields using their descriptions
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
