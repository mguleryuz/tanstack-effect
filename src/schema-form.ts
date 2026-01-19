// Types for form field definitions
export interface FormFieldDefinition {
  key: string
  label?: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'literal'
  description?: string
  required?: boolean
  min?: number
  max?: number
  step?: number
  placeholder?: string
  children?: Record<string, FormFieldDefinition>
  // For discriminated unions
  condition?: { field: string; value: any }
  // For conditional requirements (field required when another field has a specific value)
  // Use `value` for "equals" condition, `notValue` for "not equals" condition
  requiredWhen?: { field: string; value?: any; notValue?: any }
  // For literal types
  literalOptions?: any[]
  literalOptionsDescriptions?: Record<string, string>
}

// Helper to format field labels from keys
export function formatLabel(key: string): string {
  // Handle array notation - extract the final property name
  // e.g., "airdrop[0].amount" -> "amount", "metadata.socialMediaUrls[0].url" -> "url"
  const cleanKey =
    key
      .split('.')
      .pop()
      ?.replace(/\[\d+\]$/, '') || key

  return cleanKey
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

// Path parsing utilities
export function normalizePath(path: string): string[] {
  // Convert array notation to dot notation and split into path segments
  // e.g., "arrayField[0].property" -> ["arrayField", "0", "property"]
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
}

export function isNumericKey(key: string): boolean {
  return !isNaN(Number(key))
}

// Generic helper to safely access nested values via dot path (supports array indexing)
export function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return obj

  const pathArray = normalizePath(path)

  return pathArray.reduce((current: any, key: string) => {
    // Handle numeric indices for arrays
    if (isNumericKey(key) && Array.isArray(current)) {
      const index = Number(key)
      return current[index]
    }
    return current?.[key]
  }, obj)
}

// Helper to set nested values via dot path (supports array indexing)
export function setNestedValue(obj: any, path: string, value: any): any {
  if (!obj || !path) return obj

  const pathArray = normalizePath(path)
  const result = { ...obj } // Create a shallow copy of the root

  let current: any = result

  // Navigate to the parent of the target property
  for (let i = 0; i < pathArray.length - 1; i++) {
    const key = pathArray[i]

    // Handle numeric indices for arrays
    if (isNumericKey(key)) {
      const index = Number(key)
      if (!Array.isArray(current)) {
        current = []
      }
      if (!current[index]) {
        current[index] = {}
      }
      current = current[index]
    } else {
      if (!current[key]) {
        current[key] = {}
      }
      current = current[key]
    }
  }

  const fieldKey = pathArray[pathArray.length - 1]

  // Handle array field updates (when fieldKey is numeric)
  if (isNumericKey(fieldKey)) {
    const index = Number(fieldKey)
    if (!Array.isArray(current)) {
      current = []
    }
    current[index] = value
  } else {
    current[fieldKey] = value
  }

  return result
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
    } else if (fieldType === 'array' && Array.isArray(value)) {
      // Handle arrays - create children based on first element or empty object structure
      let children: Record<string, FormFieldDefinition> = {}

      if (
        value.length > 0 &&
        typeof value[0] === 'object' &&
        value[0] !== null
      ) {
        // Use first element to determine structure, but generate children with simple keys
        const tempChildren = generateFormFieldsFromData(
          value[0],
          `${fullKey}[0]`,
          new Set(visited),
          maxDepth - 1
        )
        // Convert the keys to simple property names (remove the array path prefix)
        children = Object.entries(tempChildren).reduce(
          (acc, [childKey, childField]) => {
            const simpleKey = childKey.replace(`${fullKey}[0].`, '')
            acc[simpleKey] = { ...childField, key: simpleKey }
            return acc
          },
          {} as Record<string, FormFieldDefinition>
        )
      } else {
        // For empty arrays, we still need to know the structure from schema
        // For now, create an empty children object - this will be handled by schema annotations
        children = {}
      }

      fields[fullKey] = {
        key: fullKey,
        label: formatLabel(key),
        type: 'array',
        children,
      }
    } else {
      const fieldDef: FormFieldDefinition = {
        key: fullKey,
        label: formatLabel(key),
        type: fieldType,
      }

      // Add number-specific properties
      if (fieldType === 'number') {
        fieldDef.step = getNumberStep(key)
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
function getNumberStep(key: string): number {
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
function getFieldType(
  value: any
): 'string' | 'number' | 'boolean' | 'object' | 'array' | 'literal' {
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
      // Exclude hex strings (starting with 0x) and strings that contain non-numeric characters
      if (
        !isNaN(Number(value)) &&
        !isNaN(parseFloat(value)) &&
        !value.startsWith('0x') &&
        !/[a-zA-Z]/.test(value)
      ) {
        return 'number'
      }
      return 'string'
    case 'object':
      if (Array.isArray(value)) {
        return 'array'
      }
      return 'object'
    default:
      return 'string'
  }
}

// Helper to extract description annotation from any AST node
function extractDescriptionFromAst(ast: any): string | undefined {
  if (!ast) return undefined

  // Helper to check an annotations object
  const checkAnnotationsObject = (annotations: any): string | undefined => {
    if (!annotations) return undefined

    // Check Symbol-keyed annotations
    for (const symbol of Object.getOwnPropertySymbols(annotations)) {
      if (symbol.description === 'effect/annotation/Description') {
        const desc = annotations[symbol]
        if (
          desc &&
          desc !== 'a number' &&
          desc !== 'a string' &&
          desc !== 'a boolean'
        ) {
          return desc
        }
      }
    }
    return undefined
  }

  // Check direct annotations
  if (ast.annotations) {
    const desc = checkAnnotationsObject(ast.annotations)
    if (desc) return desc
  }

  // For Transformations, also check the 'to' AST's annotations
  if (ast._tag === 'Transformation' && ast.to && ast.to.annotations) {
    const desc = checkAnnotationsObject(ast.to.annotations)
    if (desc) return desc
  }

  return undefined
}

// Recursively search for description in an AST node and its wrappers
function findDescriptionInAst(ast: any, depth = 0): string | undefined {
  if (!ast || depth > 10) return undefined // Prevent infinite recursion

  // Check current node
  const desc = extractDescriptionFromAst(ast)
  if (desc) return desc

  // Unwrap Transformation - check both from and to
  if (ast._tag === 'Transformation') {
    // Check 'from' first (usually has the core schema)
    if (ast.from) {
      const fromDesc = findDescriptionInAst(ast.from, depth + 1)
      if (fromDesc) return fromDesc
    }
    // Then check 'to' (might have annotations in some structures)
    if (ast.to) {
      const toDesc = findDescriptionInAst(ast.to, depth + 1)
      if (toDesc) return toDesc
    }
  }

  // Unwrap Refinement
  if (ast._tag === 'Refinement' && ast.from) {
    const fromDesc = findDescriptionInAst(ast.from, depth + 1)
    if (fromDesc) return fromDesc
  }

  // Unwrap Union - check non-undefined types for descriptions
  if (ast._tag === 'Union' && Array.isArray(ast.types)) {
    const nonUndefinedTypes = ast.types.filter(
      (t: any) => t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
    )
    for (const type of nonUndefinedTypes) {
      const typeDesc = findDescriptionInAst(type, depth + 1)
      if (typeDesc) return typeDesc
    }
  }

  // Unwrap Suspend
  if (ast._tag === 'Suspend' && typeof ast.f === 'function') {
    try {
      const innerAst = ast.f()
      const innerDesc = findDescriptionInAst(innerAst, depth + 1)
      if (innerDesc) return innerDesc
    } catch {
      // ignore
    }
  }

  return undefined
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

    // Handle Transformation types (from .pipe()) at the top level first
    if (ast._tag === 'Transformation' && ast.from) {
      // Extract annotations from the transformation itself first
      if (ast.annotations) {
        Object.getOwnPropertySymbols(ast.annotations).forEach((symbol) => {
          if (symbol.description === 'effect/annotation/Description' && path) {
            descriptions[path] = ast.annotations[symbol]
          }
        })
      }
      // Then recursively extract from the 'from' field
      const transformedDescriptions = extractSchemaAnnotations(ast.from, path)
      Object.assign(descriptions, transformedDescriptions)
      return descriptions
    }

    // Handle Refinement types (from .pipe(Schema.filter())) at the top level first
    if (ast._tag === 'Refinement' && ast.from) {
      // Extract annotations from the refinement itself first
      if (ast.annotations) {
        Object.getOwnPropertySymbols(ast.annotations).forEach((symbol) => {
          if (symbol.description === 'effect/annotation/Description' && path) {
            descriptions[path] = ast.annotations[symbol]
          }
        })
      }
      // Then recursively extract from the 'from' field
      const refinedDescriptions = extractSchemaAnnotations(ast.from, path)
      Object.assign(descriptions, refinedDescriptions)
      return descriptions
    }

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

        // Extract description from property signature annotations (highest priority)
        const propSigDesc = extractDescriptionFromAst(propSig)
        if (propSigDesc) {
          descriptions[fullPath] = propSigDesc
        }

        // If no description from property signature, check the type
        if (!descriptions[fullPath] && propSig.type) {
          // Use the recursive helper to find description in any wrapper type
          const typeDesc = findDescriptionInAst(propSig.type)
          if (typeDesc) {
            descriptions[fullPath] = typeDesc
          }
        }

        // For optional fields (Union types), also check the non-undefined type
        if (
          !descriptions[fullPath] &&
          propSig.type &&
          propSig.type._tag === 'Union' &&
          Array.isArray(propSig.type.types)
        ) {
          const nonUndefinedTypes = propSig.type.types.filter(
            (t: any) =>
              t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
          )
          if (nonUndefinedTypes.length === 1) {
            const wrappedDesc = findDescriptionInAst(nonUndefinedTypes[0])
            if (wrappedDesc) {
              descriptions[fullPath] = wrappedDesc
            }
          }
        }

        // Recursively process nested structures
        // Unwrap Union types (from Schema.optional), Transformation types (from .annotations()),
        // and Refinement types (from .pipe(Schema.filter()))
        let actualNestedType = propSig.type

        // Unwrap Union types first
        if (
          actualNestedType &&
          actualNestedType._tag === 'Union' &&
          Array.isArray(actualNestedType.types)
        ) {
          const nonUndefinedTypes = actualNestedType.types.filter(
            (t: any) =>
              t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
          )
          if (nonUndefinedTypes.length === 1) {
            actualNestedType = nonUndefinedTypes[0]
          }
        }

        // Unwrap Transformation types (from .annotations())
        while (actualNestedType && actualNestedType._tag === 'Transformation') {
          actualNestedType = actualNestedType.from || actualNestedType.to
        }

        // Unwrap Refinement types (from .pipe(Schema.filter()))
        while (actualNestedType && actualNestedType._tag === 'Refinement') {
          actualNestedType = actualNestedType.from
        }

        if (actualNestedType && actualNestedType._tag === 'TypeLiteral') {
          // Pass the original propSig.type to preserve annotations context
          // The extractSchemaAnnotations function will unwrap to TypeLiteral internally
          const nestedDescriptions = extractSchemaAnnotations(
            propSig.type,
            fullPath
          )
          Object.assign(descriptions, nestedDescriptions)
        }

        // Handle arrays (TupleType with rest elements)
        // First unwrap Union types (from Schema.optional) for arrays too
        let actualArrayType = propSig.type
        if (
          propSig.type &&
          propSig.type._tag === 'Union' &&
          Array.isArray(propSig.type.types)
        ) {
          const nonUndefinedTypes = propSig.type.types.filter(
            (t: any) =>
              t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
          )
          if (
            nonUndefinedTypes.length === 1 &&
            nonUndefinedTypes[0]._tag === 'TupleType'
          ) {
            actualArrayType = nonUndefinedTypes[0]
          }
        }

        if (
          actualArrayType &&
          actualArrayType._tag === 'TupleType' &&
          actualArrayType.rest &&
          actualArrayType.rest.length > 0
        ) {
          // Extract description for the array itself
          if (actualArrayType.annotations) {
            Object.getOwnPropertySymbols(actualArrayType.annotations).forEach(
              (symbol) => {
                if (symbol.description === 'effect/annotation/Description') {
                  const description = actualArrayType.annotations[symbol]
                  if (description) {
                    descriptions[fullPath] = description
                  }
                }
              }
            )
          }

          // Process the array element type
          const elementType = actualArrayType.rest[0]?.type
          if (elementType && elementType._tag === 'TypeLiteral') {
            const nestedDescriptions = extractSchemaAnnotations(
              elementType,
              `${fullPath}[]`
            )
            Object.assign(descriptions, nestedDescriptions)
          }
        }
      })
    }

    // Handle Union types (from Schema.optional and other union constructs)
    if (ast._tag === 'Union' && Array.isArray(ast.types)) {
      // Extract annotations from the union itself first
      if (ast.annotations) {
        Object.getOwnPropertySymbols(ast.annotations).forEach((symbol) => {
          if (symbol.description === 'effect/annotation/Description' && path) {
            descriptions[path] = ast.annotations[symbol]
          }
        })
      }

      // Extract from the actual types (excluding undefined/void)
      const nonUndefinedTypes = ast.types.filter(
        (t: any) => t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
      )

      // If there's only one non-undefined type, recursively extract from it
      if (nonUndefinedTypes.length === 1) {
        const unionDescriptions = extractSchemaAnnotations(
          nonUndefinedTypes[0],
          path
        )
        Object.assign(descriptions, unionDescriptions)
      }
    }

    // Handle Refinement types (like Schema.String.pipe(Schema.pattern(...)))
    if (ast._tag === 'Refinement' && ast.from) {
      // Extract annotations from the refinement itself first
      if (ast.annotations) {
        Object.getOwnPropertySymbols(ast.annotations).forEach((symbol) => {
          if (symbol.description === 'effect/annotation/Description' && path) {
            descriptions[path] = ast.annotations[symbol]
          }
        })
      }
      // Then recursively extract from the 'from' field
      const refinedDescriptions = extractSchemaAnnotations(ast.from, path)
      Object.assign(descriptions, refinedDescriptions)
    }

    // Handle Transformation types (common in Effect Schema)
    if (ast._tag === 'Transformation' && ast.to) {
      // Extract annotations from the transformation itself first
      if (ast.annotations) {
        Object.getOwnPropertySymbols(ast.annotations).forEach((symbol) => {
          if (symbol.description === 'effect/annotation/Description' && path) {
            descriptions[path] = ast.annotations[symbol]
          }
        })
      }
      // Then recursively extract from the 'to' field
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

  // Also generate fields from schema for missing data
  const schemaFields = generateFormFieldsFromSchema(schema)
  mergeSchemaFields(fields, schemaFields)

  // Recursively assign descriptions to all fields including nested ones
  function assignDescriptionsRecursively(
    fieldObj: Record<string, FormFieldDefinition>
  ) {
    Object.keys(fieldObj).forEach((key) => {
      const field = fieldObj[key]

      // field.key is already the full path (e.g., "options.maxCandidatesPerRun")
      // So we use it directly for description lookup
      if (descriptions[field.key]) {
        field.description = descriptions[field.key]
      }

      // Handle array element descriptions (stored as field[] in descriptions)
      if (field.type === 'array' && field.children) {
        Object.keys(field.children).forEach((childKey) => {
          const childField = field.children![childKey]
          // For array children, construct path like "field.key[].childKey"
          const arrayElementKey = `${field.key}[]${childKey.startsWith('.') ? '' : '.'}${childKey}`
          if (descriptions[arrayElementKey]) {
            childField.description = descriptions[arrayElementKey]
          }
          // Also try direct lookup with childKey if it's a full path
          if (!childField.description && descriptions[childKey]) {
            childField.description = descriptions[childKey]
          }
        })
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

// Generate form fields from schema structure (for cases where data is missing)
function generateFormFieldsFromSchema(
  schema: any,
  path = ''
): Record<string, FormFieldDefinition> {
  const fields: Record<string, FormFieldDefinition> = {}

  try {
    if (!schema) return fields

    const ast = schema.ast || schema

    // Handle Transformation types (from .pipe()) - unwrap to get the 'from' schema
    if (ast._tag === 'Transformation' && ast.from) {
      return generateFormFieldsFromSchema(ast.from, path)
    }

    // Handle Refinement types (from .pipe(Schema.filter())) - unwrap to get the 'from' schema
    if (ast._tag === 'Refinement' && ast.from) {
      return generateFormFieldsFromSchema(ast.from, path)
    }

    // Handle TypeLiteral (Struct) types
    if (ast._tag === 'TypeLiteral' && Array.isArray(ast.propertySignatures)) {
      ast.propertySignatures.forEach((propSig: any) => {
        if (!propSig || !propSig.name) return

        const keyName = propSig.name
        const fullPath = path ? `${path}.${keyName}` : keyName

        // Check if field is required by examining the type structure
        // If the type is a Union that includes UndefinedKeyword, it's optional
        const isRequired = !isUnionWithUndefined(propSig.type)

        // Get the actual type, handling Union types (optional fields)
        const actualType = getActualType(propSig.type)

        // Handle arrays (TupleType with rest elements)
        if (
          actualType &&
          actualType._tag === 'TupleType' &&
          actualType.rest &&
          actualType.rest.length > 0
        ) {
          const rawElementType = actualType.rest[0]?.type
          const elementType = getActualType(rawElementType)

          if (elementType && elementType._tag === 'TypeLiteral') {
            // For array elements, generate children with simple keys (not full paths)
            const children = generateFormFieldsFromSchema(elementType, '')

            fields[fullPath] = {
              key: fullPath,
              label: formatLabel(keyName),
              type: 'array',
              required: isRequired,
              children,
            }

            // Extract requiredWhen annotation if present
            const requiredWhen = getCustomAnnotation(
              propSig.type,
              'requiredWhen'
            )
            if (requiredWhen) {
              fields[fullPath].requiredWhen = requiredWhen
            }
          }
          // Handle arrays of literals (like Schema.Array(Schema.Literal("a", "b")))
          else if (
            elementType &&
            (elementType._tag === 'Literal' || isUnionOfLiterals(elementType))
          ) {
            const literalOptions = getLiteralOptions(elementType)
            // Try to get descriptions from the element type or raw element type
            const literalDescriptions =
              getLiteralDescriptions(rawElementType) ||
              getLiteralDescriptions(elementType)

            // For arrays of primitives/literals, store literalOptions on the array field itself
            // The form builder should render each item as a direct literal select
            fields[fullPath] = {
              key: fullPath,
              label: formatLabel(keyName),
              type: 'array',
              required: isRequired,
              literalOptions, // Store options here for form builder to use
              literalOptionsDescriptions: literalDescriptions,
            }

            // Extract requiredWhen annotation if present
            const requiredWhen = getCustomAnnotation(
              propSig.type,
              'requiredWhen'
            )
            if (requiredWhen) {
              fields[fullPath].requiredWhen = requiredWhen
            }
          }
          // Handle arrays of primitives (strings, numbers, etc.)
          else if (elementType) {
            const elementFieldType = getSchemaFieldType(elementType)
            if (
              elementFieldType !== 'unknown' &&
              elementFieldType !== 'object' &&
              elementFieldType !== 'array'
            ) {
              fields[fullPath] = {
                key: fullPath,
                label: formatLabel(keyName),
                type: 'array',
                required: isRequired,
                // No children - this is a primitive array
              }

              // Extract requiredWhen annotation if present
              const requiredWhen = getCustomAnnotation(
                propSig.type,
                'requiredWhen'
              )
              if (requiredWhen) {
                fields[fullPath].requiredWhen = requiredWhen
              }
            }
          }
        }
        // Handle Union of Literals FIRST (before discriminated unions)
        else if (
          actualType &&
          actualType._tag === 'Union' &&
          isUnionOfLiterals(actualType)
        ) {
          const literalOptions = getLiteralOptions(actualType)
          if (literalOptions.length > 0) {
            // Try to get descriptions from the original type (before unwrapping)
            const literalDescriptions =
              getLiteralDescriptions(propSig.type) ||
              getLiteralDescriptions(actualType)
            fields[fullPath] = {
              key: fullPath,
              label: formatLabel(keyName),
              type: 'literal',
              required: isRequired,
              literalOptions,
              literalOptionsDescriptions: literalDescriptions,
            }

            // Extract requiredWhen annotation if present
            const requiredWhen = getCustomAnnotation(
              propSig.type,
              'requiredWhen'
            )
            if (requiredWhen) {
              fields[fullPath].requiredWhen = requiredWhen
            }
          }
        }
        // Handle Union types (like discriminated unions)
        else if (actualType && actualType._tag === 'Union') {
          const children = generateUnionFields(actualType, fullPath)
          if (Object.keys(children).length > 0) {
            fields[fullPath] = {
              key: fullPath,
              label: formatLabel(keyName),
              type: 'object',
              required: isRequired,
              children,
            }

            // Extract requiredWhen annotation if present
            const requiredWhen = getCustomAnnotation(
              propSig.type,
              'requiredWhen'
            )
            if (requiredWhen) {
              fields[fullPath].requiredWhen = requiredWhen
            }
          }
        }
        // Handle regular object types
        else if (actualType && actualType._tag === 'TypeLiteral') {
          const children = generateFormFieldsFromSchema(actualType, fullPath)
          if (Object.keys(children).length > 0) {
            fields[fullPath] = {
              key: fullPath,
              label: formatLabel(keyName),
              type: 'object',
              required: isRequired,
              children,
            }

            // Extract requiredWhen annotation if present
            const requiredWhen = getCustomAnnotation(
              propSig.type,
              'requiredWhen'
            )
            if (requiredWhen) {
              fields[fullPath].requiredWhen = requiredWhen
            }
          }
        }
        // Handle primitive types
        else if (actualType) {
          const fieldType = getSchemaFieldType(actualType)

          if (fieldType !== 'unknown') {
            const fieldDef: FormFieldDefinition = {
              key: fullPath,
              label: formatLabel(keyName),
              type: fieldType,
              required: isRequired,
            }

            // Extract requiredWhen annotation if present
            const requiredWhen = getCustomAnnotation(
              propSig.type,
              'requiredWhen'
            )
            if (requiredWhen) {
              fieldDef.requiredWhen = requiredWhen
            }

            // Add literal options if this is a literal field
            if (fieldType === 'literal') {
              const literalOptions = getLiteralOptions(actualType)
              if (literalOptions.length > 0) {
                fieldDef.literalOptions = literalOptions
              }
            }

            fields[fullPath] = fieldDef
          }
        }
      })
    }
  } catch {
    // Silently handle errors in schema parsing
  }

  return fields
}

// Check if a type is a Union that includes UndefinedKeyword (indicating optional field)
function isUnionWithUndefined(typeAst: any): boolean {
  try {
    if (!typeAst) return false

    // Handle Union types (optional fields)
    if (typeAst._tag === 'Union' && Array.isArray(typeAst.types)) {
      return typeAst.types.some(
        (t: any) => t._tag === 'UndefinedKeyword' || t._tag === 'VoidKeyword'
      )
    }

    return false
  } catch {
    return false
  }
}

// Get the actual type from a potentially Union type (handles optional fields)
// Also unwraps Transformation and Refinement types to get to the underlying type
function getActualType(typeAst: any): any {
  try {
    if (!typeAst) return null

    // Handle Transformation types (from .pipe() or .annotations())
    // Effect wraps annotated types in Transformation
    if (typeAst._tag === 'Transformation') {
      // Try 'from' first (the source type), then 'to'
      if (typeAst.from) {
        return getActualType(typeAst.from)
      }
      if (typeAst.to) {
        return getActualType(typeAst.to)
      }
    }

    // Handle Refinement types (from .pipe(Schema.filter(...)))
    if (typeAst._tag === 'Refinement' && typeAst.from) {
      return getActualType(typeAst.from)
    }

    // Handle Union types (optional fields)
    if (typeAst._tag === 'Union' && Array.isArray(typeAst.types)) {
      // Filter out undefined/void types
      const nonUndefinedTypes = typeAst.types.filter(
        (t: any) => t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
      )

      // If there's only one non-undefined type, unwrap it recursively
      if (nonUndefinedTypes.length === 1) {
        return getActualType(nonUndefinedTypes[0])
      }

      // If there are multiple non-undefined types (e.g., union of literals),
      // return a reconstructed union without the undefined types
      if (nonUndefinedTypes.length > 1) {
        return {
          ...typeAst,
          types: nonUndefinedTypes,
        }
      }

      return typeAst
    }

    return typeAst
  } catch {
    return typeAst
  }
}

// Get the literal value from a type, handling optional fields
function getLiteralValue(typeAst: any): any {
  try {
    if (!typeAst) return null

    // Direct literal
    if (typeAst._tag === 'Literal') {
      return typeAst.literal
    }

    // Handle Union types (optional fields)
    if (typeAst._tag === 'Union' && Array.isArray(typeAst.types)) {
      const nonUndefinedTypes = typeAst.types.filter(
        (t: any) => t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
      )
      if (
        nonUndefinedTypes.length === 1 &&
        nonUndefinedTypes[0]._tag === 'Literal'
      ) {
        return nonUndefinedTypes[0].literal
      }
    }

    return null
  } catch {
    return null
  }
}

// Extract custom annotation by key from schema annotations
// Returns value if found, undefined otherwise
// Handles Union types (from optional fields) by checking the inner types
function getCustomAnnotation(typeAst: any, annotationKey: string): any {
  try {
    if (!typeAst) return undefined

    // Helper to check annotations object
    const checkAnnotations = (annotations: any): any => {
      if (!annotations) return undefined

      // Look through regular string keys first (for custom annotations)
      for (const key of Object.keys(annotations)) {
        if (key === annotationKey || key.includes(annotationKey)) {
          return annotations[key]
        }
      }

      // Also check Symbol annotations
      const symbols = Object.getOwnPropertySymbols(annotations)
      for (const symbol of symbols) {
        const symbolDesc = symbol.description || ''
        if (symbolDesc.includes(annotationKey)) {
          return annotations[symbol]
        }
      }

      return undefined
    }

    // Check annotations on the type itself
    const result = checkAnnotations(typeAst.annotations)
    if (result !== undefined) return result

    // Handle Union types (from optional fields) - check inner types
    if (typeAst._tag === 'Union' && Array.isArray(typeAst.types)) {
      for (const innerType of typeAst.types) {
        // Skip undefined/void types
        if (
          innerType._tag === 'UndefinedKeyword' ||
          innerType._tag === 'VoidKeyword'
        ) {
          continue
        }
        const innerResult = checkAnnotations(innerType.annotations)
        if (innerResult !== undefined) return innerResult
      }
    }

    // Handle Transformation types
    if (typeAst._tag === 'Transformation') {
      const fromResult = getCustomAnnotation(typeAst.from, annotationKey)
      if (fromResult !== undefined) return fromResult
      const toResult = getCustomAnnotation(typeAst.to, annotationKey)
      if (toResult !== undefined) return toResult
    }

    return undefined
  } catch {
    return undefined
  }
}

// Extract literalDescriptions from schema annotations
// Looks for a custom annotation with key containing 'literalDescriptions'
function getLiteralDescriptions(
  typeAst: any
): Record<string, string> | undefined {
  return getCustomAnnotation(typeAst, 'literalDescriptions')
}

// Check if a union type consists only of literal values
function isUnionOfLiterals(unionAst: any): boolean {
  try {
    if (
      !unionAst ||
      unionAst._tag !== 'Union' ||
      !Array.isArray(unionAst.types)
    ) {
      return false
    }

    const nonUndefinedTypes = unionAst.types.filter(
      (t: any) => t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
    )

    // All types must be literals
    return nonUndefinedTypes.every((t: any) => t._tag === 'Literal')
  } catch {
    return false
  }
}

// Extract literal options from a union of literals or a single literal
function getLiteralOptions(typeAst: any): any[] {
  try {
    if (!typeAst) return []

    const actualType = getActualType(typeAst)

    // Single literal
    if (actualType._tag === 'Literal') {
      return [actualType.literal]
    }

    // Union of literals
    if (actualType._tag === 'Union' && Array.isArray(actualType.types)) {
      const literals = actualType.types
        .filter(
          (t: any) => t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
        )
        .filter((t: any) => t._tag === 'Literal')
        .map((t: any) => t.literal)
      return literals
    }

    return []
  } catch {
    return []
  }
}

// Detect if a union is discriminated (has a common discriminant field like "type")
function isDiscriminatedUnion(unionAst: any): boolean {
  try {
    if (
      !unionAst ||
      unionAst._tag !== 'Union' ||
      !Array.isArray(unionAst.types)
    ) {
      return false
    }

    const memberTypes = unionAst.types.filter(
      (t: any) => t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
    )

    // Check if all members are TypeLiterals with a common discriminant field
    if (memberTypes.every((t: any) => t._tag === 'TypeLiteral')) {
      // Look for a common field that could be a discriminant (like "type")
      const discriminantFields = ['type', 'kind', 'variant']

      for (const discriminant of discriminantFields) {
        const values = memberTypes
          .map((member: any) => {
            const prop = member.propertySignatures?.find(
              (p: any) => p.name === discriminant
            )
            return prop ? getLiteralValue(prop.type) : null
          })
          .filter(Boolean)

        // If all members have this discriminant field with different literal values, it's discriminated
        if (
          values.length === memberTypes.length &&
          new Set(values).size === values.length
        ) {
          return true
        }
      }
    }

    return false
  } catch {
    return false
  }
}

// Get discriminant field name and values from a discriminated union
function getDiscriminantInfo(unionAst: any): {
  discriminantField: string
  values: Array<{ value: any; memberType: any; description?: string }>
} | null {
  try {
    if (
      !unionAst ||
      unionAst._tag !== 'Union' ||
      !Array.isArray(unionAst.types)
    ) {
      return null
    }

    const memberTypes = unionAst.types.filter(
      (t: any) => t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
    )

    // Check if all members are TypeLiterals
    if (!memberTypes.every((t: any) => t._tag === 'TypeLiteral')) {
      return null
    }

    // Look for a common field that could be a discriminant (like "type")
    const discriminantFields = ['type', 'kind', 'variant']

    for (const discriminant of discriminantFields) {
      const values = memberTypes
        .map((member: any) => {
          const prop = member.propertySignatures?.find(
            (p: any) => p.name === discriminant
          )
          const value = prop ? getLiteralValue(prop.type) : null

          // Extract description from member annotations
          let description: string | undefined
          if (member.annotations) {
            Object.getOwnPropertySymbols(member.annotations).forEach(
              (symbol) => {
                if (symbol.description === 'effect/annotation/Description') {
                  description = member.annotations[symbol]
                }
              }
            )
          }

          return value !== null
            ? { value, memberType: member, description }
            : null
        })
        .filter(Boolean)

      // If all members have this discriminant field with different literal values, it's discriminated
      if (
        values.length === memberTypes.length &&
        new Set(values.map((v: any) => v.value)).size === values.length
      ) {
        return {
          discriminantField: discriminant,
          values: values as Array<{
            value: any
            memberType: any
            description?: string
          }>,
        }
      }
    }

    return null
  } catch {
    return null
  }
}

// Generate form fields for discriminated Union types
function generateDiscriminatedUnionFields(
  unionAst: any,
  path: string
): Record<string, FormFieldDefinition> {
  const fields: Record<string, FormFieldDefinition> = {}

  try {
    const discriminantInfo = getDiscriminantInfo(unionAst)
    if (!discriminantInfo) {
      return fields
    }

    const { discriminantField, values } = discriminantInfo
    const discriminantPath = path
      ? `${path}.${discriminantField}`
      : discriminantField

    // Build descriptions map for literal options
    const literalOptionsDescriptions: Record<string, string> = {}
    values.forEach(({ value, description }) => {
      if (description) {
        literalOptionsDescriptions[String(value)] = description
      }
    })

    // Add the discriminant field itself as a literal selector
    fields[discriminantPath] = {
      key: discriminantPath,
      label: formatLabel(discriminantField),
      type: 'literal',
      required: true,
      literalOptions: values.map((v) => v.value),
      literalOptionsDescriptions:
        Object.keys(literalOptionsDescriptions).length > 0
          ? literalOptionsDescriptions
          : undefined,
    }

    // Generate conditional fields for each member type
    values.forEach(({ value: typeValue, memberType }) => {
      if (memberType._tag === 'TypeLiteral') {
        const memberFields = generateFormFieldsFromSchema(memberType, path)

        Object.keys(memberFields).forEach((key) => {
          // Skip the discriminant field itself as we already added it
          if (key === discriminantPath) {
            return
          }

          const conditionalField: FormFieldDefinition = {
            ...memberFields[key],
          }
          // Add condition for when this field should be shown
          conditionalField.condition = {
            field: discriminantPath,
            value: typeValue,
          }
          fields[key] = conditionalField
        })
      }
    })
  } catch {
    // Silently handle errors
  }

  return fields
}

// Generate form fields for Union types by merging all possible fields from union members
function generateUnionFields(
  unionAst: any,
  path: string
): Record<string, FormFieldDefinition> {
  // First check if it's a discriminated union
  if (isDiscriminatedUnion(unionAst)) {
    return generateDiscriminatedUnionFields(unionAst, path)
  }

  // Fallback to merging all fields (old behavior)
  const fields: Record<string, FormFieldDefinition> = {}

  try {
    if (
      !unionAst ||
      unionAst._tag !== 'Union' ||
      !Array.isArray(unionAst.types)
    ) {
      return fields
    }

    // Process each type in the union (excluding undefined/void for optional fields)
    const memberTypes = unionAst.types.filter(
      (t: any) => t._tag !== 'UndefinedKeyword' && t._tag !== 'VoidKeyword'
    )

    memberTypes.forEach((memberType: any) => {
      if (memberType._tag === 'TypeLiteral') {
        const memberFields = generateFormFieldsFromSchema(memberType, path)
        // Merge fields from this union member
        Object.assign(fields, memberFields)
      }
    })
  } catch {
    // Silently handle errors
  }

  return fields
}

// Get field type from schema AST
function getSchemaFieldType(
  typeAst: any
):
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'literal'
  | 'unknown' {
  try {
    if (!typeAst) return 'unknown'

    // First get the actual type (handles optional fields)
    const actualType = getActualType(typeAst)
    if (!actualType) return 'unknown'

    const tag = actualType._tag

    // Handle Refinement types (like Schema.String.pipe(Schema.pattern(...)))
    if (tag === 'Refinement' && actualType.from) {
      return getSchemaFieldType(actualType.from)
    }

    // Handle Transformation types (like Schema.String.pipe(...))
    if (tag === 'Transformation' && actualType.to) {
      return getSchemaFieldType(actualType.to)
    }

    // Handle Literal types
    if (tag === 'Literal') {
      return 'literal'
    }

    switch (tag) {
      case 'StringKeyword':
        return 'string'
      case 'NumberKeyword':
        return 'number'
      case 'BooleanKeyword':
        return 'boolean'
      case 'TypeLiteral':
        return 'object'
      case 'TupleType':
        return 'array'
      case 'Union':
        // Check if this is a union of literals (should be treated as literal select)
        if (isUnionOfLiterals(actualType)) {
          return 'literal'
        }
        // Handle Union types by treating them as objects
        // This will allow the schema generation to create fields for union members
        return 'object'
      default:
        return 'unknown'
    }
  } catch {
    return 'unknown'
  }
}

// Merge schema-generated fields into data-generated fields
function mergeSchemaFields(
  dataFields: Record<string, FormFieldDefinition>,
  schemaFields: Record<string, FormFieldDefinition>
) {
  Object.keys(schemaFields).forEach((key) => {
    if (!dataFields[key]) {
      dataFields[key] = schemaFields[key]
    } else {
      // Update existing field with schema information
      const dataField = dataFields[key]
      const schemaField = schemaFields[key]

      // Schema type takes precedence over data-inferred type
      // (e.g., literal union should override inferred string type)
      if (schemaField.type) {
        dataField.type = schemaField.type
      }

      // Copy schema properties that might be missing from data fields
      if (schemaField.required !== undefined) {
        dataField.required = schemaField.required
      }
      if (schemaField.requiredWhen !== undefined) {
        dataField.requiredWhen = schemaField.requiredWhen
      }
      if (schemaField.literalOptions) {
        dataField.literalOptions = schemaField.literalOptions
      }
      if (schemaField.literalOptionsDescriptions) {
        dataField.literalOptionsDescriptions =
          schemaField.literalOptionsDescriptions
      }
      if (schemaField.condition) {
        dataField.condition = schemaField.condition
      }
      if (schemaField.label) {
        dataField.label = schemaField.label
      }
      if (schemaField.description) {
        dataField.description = schemaField.description
      }
      if (schemaField.min !== undefined) {
        dataField.min = schemaField.min
      }
      if (schemaField.max !== undefined) {
        dataField.max = schemaField.max
      }
      if (schemaField.step !== undefined) {
        dataField.step = schemaField.step
      }

      // Recursively merge children
      if (dataField.children && schemaField.children) {
        mergeSchemaFields(dataField.children, schemaField.children!)
      } else if (schemaField.children) {
        dataField.children = schemaField.children
      }
    }
  })
}
