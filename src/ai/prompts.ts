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
  return `You are an intelligent form-filling assistant. Your task is to help users fill out forms based on their natural language descriptions.

When given a form schema and a user prompt:
1. Extract information from the user's prompt that maps to form fields
2. Fill in as many fields as you can with confidence
3. For required fields that cannot be determined from the prompt, generate clarifying questions
4. Return structured output with filled values, missing required fields, and clarification questions

You MUST follow these rules:
- Only output field names and values that match the provided schema
- For enum/choice fields, only suggest valid options
- If information is ambiguous or missing, ask specific clarification questions
- Prioritize required fields - if any required field is missing, include it in clarifications
- Return exactly the structured format specified, no additional text

When generating clarification questions:
- Make them specific and actionable
- For choice fields, present all available options
- Ask one question at a time for clarity
- Include helpful context from the user's original prompt`
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

Please analyze the user request and fill in as many form fields as possible. For any required field that cannot be confidently filled from the user's request, generate a clarification question.

Respond ONLY with a JSON object matching this structure:
{
  "filled": { /* field_name: value pairs for fields you can fill */ },
  "missing": [ /* required field names that need clarification */ ],
  "clarifications": [ /* array of clarification questions */ ],
  "complete": false
}

Where clarifications array items have this structure:
{
  "field": "field_name",
  "question": "The clarification question",
  "type": "choice|multiselect|text",
  "options": [ /* only for choice/multiselect: { value, label, description? } */ ]
}`
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

User has answered for field "${field}": ${userAnswer}

Please update the form with this new information and continue filling any other fields you can infer. If there are still required fields missing, generate clarification questions for them.

Respond ONLY with a JSON object matching this structure:
{
  "filled": { /* updated field values */ },
  "missing": [ /* any remaining required fields */ ],
  "clarifications": [ /* clarification questions if needed */ ],
  "complete": false
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
