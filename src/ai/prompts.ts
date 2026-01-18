/**
 * @description Prompt templates for AI form filler
 */

import type { FormFieldDefinition } from '../schema-form'

/**
 * @description Build a schema description for the AI
 */
export function buildSchemaDescription(
  fields: Record<string, FormFieldDefinition>
): string {
  const fieldDescriptions = Object.entries(fields)
    .map(([key, field]) => {
      const parts: string[] = []

      parts.push(`"${field.key || key}"`)

      if (field.type) {
        parts.push(`Type: ${field.type}`)
      }

      if (field.required) {
        parts.push('(REQUIRED)')
      } else {
        parts.push('(optional)')
      }

      if (field.label) {
        parts.push(`Label: ${field.label}`)
      }

      if (field.description) {
        parts.push(`Description: ${field.description}`)
      }

      if (field.literalOptions && field.literalOptions.length > 0) {
        parts.push(
          `Valid options: ${field.literalOptions.map((opt) => `"${opt}"`).join(', ')}`
        )
      }

      if (field.min !== undefined) {
        parts.push(`Min: ${field.min}`)
      }

      if (field.max !== undefined) {
        parts.push(`Max: ${field.max}`)
      }

      return `- ${parts.join(' | ')}`
    })
    .join('\n')

  return fieldDescriptions
}

/**
 * @description Build the system prompt for form filling
 */
export function buildSystemPrompt(): string {
  return `You are an intelligent form-filling assistant. Your task is to extract information from user descriptions and fill out form fields.

When given a form schema and a user's input:
1. Carefully read the user's input to find values for each form field
2. Extract explicit and implicit information that maps to form fields
3. Fill in as many fields as you can with confidence

CRITICAL RULES:
- Return ONLY a flat JSON object with field names as keys and extracted values as values
- DO NOT wrap your response in any structure like "filled", "data", "response", etc.
- For enum/choice fields, only use valid options from the schema
- Use the exact field names from the schema (e.g., "projectName", "teamSize")
- Extract information even if the user doesn't use the exact field names
- For numbers, return actual number values (not strings)
- For strings, return clean string values

Example - if user says "I'm building a mobile app called MyApp with 5 developers using Flutter":
{
  "projectName": "MyApp",
  "projectType": "mobile",
  "framework": "Flutter",
  "teamSize": 5
}`
}

/**
 * @description Build user prompt for initial fill attempt
 */
export function buildUserPrompt(
  userPrompt: string,
  schemaDescription: string
): string {
  return `Form Schema:
${schemaDescription}

User Request:
${userPrompt}

Please analyze the user request and fill in the form fields with appropriate values based on the provided information. Extract values for each field from the user's request.

IMPORTANT: Return a flat JSON object with field names as keys and extracted values as values. Do NOT wrap the response in any structure like "filled" or "data". Just return the field values directly.

Example output format:
{
  "projectName": "MyApp",
  "projectType": "web",
  "framework": "React",
  "teamSize": 5
}

Fill in every field you can determine from the user's request.`
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
  return `Form Schema:
${schemaDescription}

Previously filled values:
${JSON.stringify(previousFilled, null, 2)}

User's new input: ${userAnswer}
${field ? `This is for field "${field}"` : ''}

Combine the previous values with the new information and return the complete form data. Extract any additional fields you can from the user's input.

IMPORTANT: Return a flat JSON object with field names as keys and extracted values as values. Merge the previous values with any new values extracted from the user's input.

Example output format:
{
  "projectName": "MyApp",
  "projectType": "web",
  "framework": "React",
  "teamSize": 5
}`
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
