// Types for form field definitions
export interface FormFieldDefinition {
  key: string
  label?: string
  type: 'string' | 'number' | 'boolean' | 'object'
  description?: string
  required?: boolean
  min?: number
  max?: number
  step?: number
  placeholder?: string
  children?: Record<string, FormFieldDefinition>
}

// Helper to format field labels from keys
export function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

// Generic helper to safely access nested values via dot path
export function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return obj
  return path
    .split('.')
    .reduce((current: any, key: string) => current?.[key], obj)
}

// Generate form fields from a data object structure
export function generateFormFieldsFromData(
  data: any,
  path = '',
  visited = new Set<string>(),
  maxDepth = 10
): Record<string, FormFieldDefinition> {
  const fields: Record<string, FormFieldDefinition> = {}

  if (!data || typeof data !== 'object' || visited.has(path) || maxDepth <= 0) {
    return fields
  }

  visited.add(path)

  Object.entries(data).forEach(([key, value]) => {
    const fullKey = path ? `${path}.${key}` : key
    const fieldType = getFieldType(value)

    if (
      fieldType === 'object' &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      const children = generateFormFieldsFromData(
        value,
        fullKey,
        new Set(visited),
        maxDepth - 1
      )
      if (Object.keys(children).length > 0) {
        fields[fullKey] = {
          key: fullKey,
          label: formatLabel(key),
          type: 'object',
          children,
        }
      }
    } else if (!Array.isArray(value)) {
      // Skip arrays for now
      const fieldDef: FormFieldDefinition = {
        key: fullKey,
        label: formatLabel(key),
        type: fieldType,
      }

      // Add number-specific properties
      if (fieldType === 'number') {
        fieldDef.step = getNumberStep(key, value)
        const minMax = getNumberMinMax(key, value)
        if (minMax.min !== undefined) fieldDef.min = minMax.min
        if (minMax.max !== undefined) fieldDef.max = minMax.max
      }

      fields[fullKey] = fieldDef
    }
  })

  visited.delete(path)
  return fields
}

// Helper to determine number step
function getNumberStep(key: string, _value: any): number {
  if (
    key.includes('threshold') ||
    key.includes('ratio') ||
    key.includes('multiplier')
  ) {
    return 0.01
  }
  if (key.includes('factor') || key.includes('bonus')) {
    return 0.1
  }
  return 1
}

// Helper to determine number min/max
function getNumberMinMax(
  key: string,
  _value: any
): { min?: number; max?: number } {
  const result: { min?: number; max?: number } = {}

  if (key.includes('threshold') || key.includes('ratio')) {
    result.min = 0
    result.max = 1
  }

  if (key.includes('points') && typeof _value === 'number' && _value < 0) {
    result.max = 0 // Negative points field
  }

  if (
    key.includes('minutes') ||
    key.includes('hours') ||
    key.includes('count')
  ) {
    result.min = 0
  }

  return result
}

// Determine field type from value
function getFieldType(value: any): 'string' | 'number' | 'boolean' | 'object' {
  if (value === null || value === undefined) {
    return 'string'
  }

  const type = typeof value

  switch (type) {
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'string':
      // Check if string looks like a number (for cases where API returns string numbers)
      if (!isNaN(Number(value)) && !isNaN(parseFloat(value))) {
        return 'number'
      }
      return 'string'
    case 'object':
      if (Array.isArray(value)) {
        return 'object' // We'll handle arrays as objects for now
      }
      return 'object'
    default:
      return 'string'
  }
}

// Extract descriptions from Effect Schema annotations using proper AST traversal
function extractSchemaAnnotations(
  schema: any,
  path = ''
): Record<string, string> {
  const descriptions: Record<string, string> = {}

  try {
    if (!schema) return descriptions

    // Try to access the AST directly
    const ast = schema.ast || schema

    // Get annotations from the current level
    if (ast.annotations) {
      // Effect Schema uses Symbol keys for annotations
      Object.getOwnPropertySymbols(ast.annotations).forEach((symbol) => {
        if (symbol.description === 'effect/annotation/Description' && path) {
          descriptions[path] = ast.annotations[symbol]
        }
      })
    }

    // Handle TypeLiteral (Struct) types
    if (ast._tag === 'TypeLiteral' && Array.isArray(ast.propertySignatures)) {
      ast.propertySignatures.forEach((propSig: any) => {
        if (!propSig || !propSig.name) return

        // Use the name property (from the console log we can see it has .name)
        const keyName = propSig.name

        const fullPath = path ? `${path}.${keyName}` : keyName

        // Extract description from property type annotations using Symbols
        if (propSig.type && propSig.type.annotations) {
          // Effect Schema uses Symbol keys for annotations
          Object.getOwnPropertySymbols(propSig.type.annotations).forEach(
            (symbol) => {
              if (symbol.description === 'effect/annotation/Description') {
                const description = propSig.type.annotations[symbol]
                // Only add meaningful descriptions (not generic ones like "a number")
                if (
                  description &&
                  description !== 'a number' &&
                  description !== 'a string' &&
                  description !== 'a boolean'
                ) {
                  descriptions[fullPath] = description
                }
              }
            }
          )
        }

        // Recursively process nested structures
        if (propSig.type && propSig.type._tag === 'TypeLiteral') {
          const nestedDescriptions = extractSchemaAnnotations(
            propSig.type,
            fullPath
          )
          Object.assign(descriptions, nestedDescriptions)
        }
      })
    }

    // Handle Transformation types (common in Effect Schema)
    if (ast._tag === 'Transformation' && ast.to) {
      const transformedDescriptions = extractSchemaAnnotations(ast.to, path)
      Object.assign(descriptions, transformedDescriptions)
    }
  } catch {
    // Silently handle errors in annotation extraction
  }

  return descriptions
}

// Generate fields with descriptions from schema annotations
export function generateFormFieldsWithSchemaAnnotations(
  data: any,
  schema: any
): Record<string, FormFieldDefinition> {
  const fields = generateFormFieldsFromData(data)
  const descriptions = extractSchemaAnnotations(schema)

  // Recursively assign descriptions to all fields including nested ones
  function assignDescriptionsRecursively(
    fieldObj: Record<string, FormFieldDefinition>
  ) {
    Object.keys(fieldObj).forEach((key) => {
      const field = fieldObj[key]

      // Assign description if available
      if (descriptions[field.key]) {
        field.description = descriptions[field.key]
      }

      // Recursively assign to children
      if (field.children) {
        assignDescriptionsRecursively(field.children)
      }
    })
  }

  assignDescriptionsRecursively(fields)
  return fields
}
