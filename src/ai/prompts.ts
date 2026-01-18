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

  // Field identifier and status with clear instruction
  const fieldKey = field.key
  const status = field.required
    ? '⚠️ REQUIRED - leave empty if not in user input'
    : 'optional - leave empty if not in user input'
  lines.push(`${indent}• **${fieldKey}** [${field.type}] (${status})`)

  // Human-readable label
  if (field.label) {
    lines.push(`${indent}  Label: ${field.label}`)
  }

  // Description - this is critical for AI understanding
  if (field.description) {
    lines.push(`${indent}  Purpose: ${field.description}`)
  }

  // Valid options for choice fields (including arrays with literalOptions)
  if (field.literalOptions && field.literalOptions.length > 0) {
    if (field.type === 'array') {
      lines.push(
        `${indent}  Valid values: ${field.literalOptions.map((opt) => `"${opt}"`).join(', ')}`
      )
      lines.push(
        `${indent}  → Map user's descriptive words to these valid values`
      )
    } else {
      lines.push(
        `${indent}  Valid options: ${field.literalOptions.map((opt) => `"${opt}"`).join(', ')}`
      )
      lines.push(
        `${indent}  → Choose the option that best matches user's words`
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
  return `You are an intelligent form-filling assistant. Extract information from user input and map it to form fields.

## CORE PRINCIPLES:

### 1. EXTRACT FROM USER INPUT
- Read the user's message carefully and extract all mentioned values
- Map user's descriptive language to the closest valid field options
- Use context clues to understand intent

### 2. NEVER INVENT PLACEHOLDERS  
These are FORBIDDEN - never use them:
- ❌ Generic names like "My Product", "Your App", "Example Name"
- ❌ Placeholder URLs like "https://example.com", "https://placeholder.com"
- ❌ Generic descriptions like "A tool that helps users"
- ❌ Sample hashtags, queries, or content the user didn't mention
- ❌ Any generic/placeholder content not from user input

### 3. SEMANTIC MAPPING (map user words to valid schema options)

When the schema has enum/literal fields with specific valid options:
- Read the field's valid options from the schema
- Map the user's descriptive words to the closest valid option
- Examples of common mappings:
  - Language names → ISO codes: "english" → "en", "chinese" → "zh", etc.
  - Descriptive adjectives → closest enum value
  - Synonyms → the exact valid option

### 4. WHEN INFO IS NOT PROVIDED
- If user didn't mention a value for a field → leave it empty/null
- Empty fields are OK - we will ask follow-up questions
- Better to leave empty than invent content

## OUTPUT FORMAT:
Return a nested JSON object with:
- Values extracted from user input
- Semantic mappings applied to enum fields
- Empty/null for fields without user-provided information`
}

/**
 * @description Build user prompt for initial fill attempt
 */
export function buildUserPrompt(
  userPrompt: string,
  schemaDescription: string
): string {
  return `## USER INPUT:

"""
${userPrompt}
"""

## FORM FIELDS TO FILL:

${schemaDescription}

## INSTRUCTIONS:

1. **Read the user input** and extract ALL mentioned information
2. **Match to schema**: For each field in the schema, look for relevant info in user input
3. **Map descriptive language** to valid field options:
   - If schema has enum/literal options, map user's words to the closest valid option
   - Language names → ISO codes (english→en, chinese→zh, spanish→es, etc.)
4. **Extract literal values**: Names, URLs, descriptions - only if user explicitly provides them

## CRITICAL - DO NOT INVENT:

❌ DO NOT use generic placeholder names
❌ DO NOT use placeholder URLs like "https://example.com"
❌ DO NOT use sample content the user didn't mention
❌ DO NOT invent descriptions if user only gave partial info

✅ Extract the ACTUAL words user provided
✅ Map descriptive phrases to the closest valid schema options
✅ Leave fields empty/null if no relevant info in user input`
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
  return `## USER'S NEW INPUT (EXTRACT FROM THIS):

"""
${userAnswer}
"""
${field ? `\n(User is answering about: ${field})` : ''}

## CURRENT FORM STATE (preserve these values):

${JSON.stringify(previousFilled, null, 2)}

## AVAILABLE FORM FIELDS:

${schemaDescription}

## YOUR TASK:

Update the form by:
1. KEEPING all existing values from current state
2. ADDING/UPDATING only fields the user mentioned in their new input
3. NEVER inventing placeholder values for fields not mentioned

## CRITICAL REMINDERS:

❌ NEVER invent URLs, hashtags, or placeholder content
❌ NEVER replace existing values with generic placeholders
❌ If user didn't provide new info for a field, keep its current value

✅ Extract only what the user explicitly provides
✅ Map user words to valid enum options (tone, language codes, etc.)
✅ Return complete form data as nested JSON`
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
