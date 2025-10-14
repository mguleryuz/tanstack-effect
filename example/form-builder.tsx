// @ts-nocheck
'use client'

import { useState } from 'react'
import { formatLabel, getNestedValue } from 'tanstack-effect'
import type {
  FormBuilderProps,
  FormFieldProps,
  NestedFormProps,
  FormFieldDefinition,
  UseSchemaFormReturn,
} from 'tanstack-effect'
import { Input } from './ui/input'
import { cn } from '@/utils'
import { Button } from './ui/button'
import {
  ChevronDown,
  ChevronRight,
  Info,
  Plus,
  Trash2,
  Circle,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'

/**
 * Individual form field component
 */
export function FormField({ field, value, onChange, error, minimal = false }: FormFieldProps) {
  const [showDescription, setShowDescription] = useState(true)

  // Guard against undefined field
  if (!field) {
    return null
  }

  const I = minimal ? Input : Textarea

  const renderField = () => {
    switch (field.type) {
      case 'string':
        return (
          <I
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className={cn(error && 'border-red-500')}
          />
        )

      case 'number':
        return (
          <Input
            type="number"
            value={value ?? ''}
            step={field.step}
            min={field.min}
            max={field.max}
            onChange={(e) => {
              const inputValue = e.target.value
              if (inputValue === '') {
                onChange(0)
              } else {
                const val = Number(inputValue)
                onChange(isNaN(val) ? 0 : val)
              }
            }}
            className={cn(error && 'border-red-500')}
          />
        )

      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Switch checked={Boolean(value)} onCheckedChange={onChange} />
            <span className="text-muted-foreground text-sm">{value ? 'Enabled' : 'Disabled'}</span>
          </div>
        )

      case 'literal':
        return (
          <div className="flex gap-2">
            <Select
              value={value?.toString() || ''}
              onValueChange={(selectedValue) => {
                // Handle clearing the value
                if (selectedValue === '__clear__') {
                  onChange(undefined)
                  return
                }
                // Find and set the exact option value from literalOptions
                const options = field.literalOptions || []
                const selectedOption = options.find(
                  (option) => option?.toString() === selectedValue
                )
                // Always use the original option value to preserve type
                onChange(selectedOption !== undefined ? selectedOption : selectedValue)
              }}
            >
              <SelectTrigger className={cn('flex-1', error && 'border-red-500')}>
                <SelectValue placeholder="Select an option..." />
              </SelectTrigger>
              <SelectContent position="item-aligned" className="h-max w-max">
                {!field.required && (
                  <SelectItem value="__clear__" className="italic">
                    (None)
                  </SelectItem>
                )}
                {(field.literalOptions || []).map((option) => (
                  <SelectItem key={option?.toString()} value={option?.toString()}>
                    {option?.toString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Label
          htmlFor={field.key}
          className={cn('min-w-0 flex-1 text-xs sm:text-sm', field.required && 'font-semibold')}
        >
          <span className="break-words">{field.label || formatLabel(field.key)}</span>
          {field.required ? (
            <span className="text-red-500">*</span>
          ) : (
            <Circle className="inline h-3 w-3 ml-1 text-muted-foreground" />
          )}
        </Label>
        {field.description && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto shrink-0 p-1"
            onClick={() => setShowDescription(!showDescription)}
            tabIndex={-1}
            aria-label="Show description"
          >
            <Info className="h-3 w-3" />
          </Button>
        )}
      </div>

      {showDescription && field.description && (
        <p className="text-muted-foreground border-t text-xs sm:text-sm">{field.description}</p>
      )}

      <div className="w-full">{renderField()}</div>

      {error && <div className="text-xs text-red-500 sm:text-sm">{error}</div>}
    </div>
  )
}

/**
 * Helper to recursively collect all required fields from form schema
 */
function collectRequiredFields(
  fields: Record<string, FormFieldDefinition>,
  data: any
): Array<{ key: string; label: string }> {
  const required: Array<{ key: string; label: string }> = []

  Object.entries(fields).forEach(([, field]) => {
    if (!field) return

    // Skip fields with conditions that don't match current data
    if (field.condition) {
      const conditionValue = getNestedValue(data, field.condition.field)
      if (conditionValue !== field.condition.value) {
        return // Skip this field as its condition isn't met
      }
    }

    // Add required non-object/array fields
    if (field.required && field.type !== 'object' && field.type !== 'array') {
      required.push({
        key: field.key,
        label: field.label || formatLabel(field.key),
      })
    }

    // Recursively check children only if the parent field is not optional or has content
    if (field.children) {
      const fieldValue = getNestedValue(data, field.key)

      // For arrays: only check children if array is required OR has items
      if (field.type === 'array') {
        const isArrayPopulated = Array.isArray(fieldValue) && fieldValue.length > 0
        if (!field.required && !isArrayPopulated) {
          return // Skip checking children of optional empty arrays
        }
      }

      // For objects: only check children if object is required OR has content
      if (field.type === 'object') {
        const isObjectPopulated =
          fieldValue && typeof fieldValue === 'object' && Object.keys(fieldValue).length > 0
        if (!field.required && !isObjectPopulated) {
          return // Skip checking children of optional empty objects
        }
      }

      const childRequired = collectRequiredFields(field.children, data)
      required.push(...childRequired)
    }
  })

  return required
}

/**
 * Form validation status alert component
 */
export interface FormValidationAlertProps<T = any> {
  form: UseSchemaFormReturn<T>
  requiredFields?: Array<{ key: string; label: string }>
}

export function FormValidationAlert<T = any>({
  form,
  requiredFields,
}: FormValidationAlertProps<T>) {
  // Auto-collect required fields from schema if not provided
  const fieldsToCheck = requiredFields || collectRequiredFields(form.fields, form.data)

  // Check which required fields are missing
  const missingFields = fieldsToCheck.filter(({ key }) => {
    const value = getNestedValue(form.data, key)
    return !value || (typeof value === 'string' && value.trim() === '')
  })

  // Get root-level validation errors (from Schema.filter or general validation)
  const rootError = form.validationErrors['_root']

  const isValid = missingFields.length === 0 && !rootError

  return (
    <Alert>
      <AlertTitle>Form Validation</AlertTitle>
      <AlertDescription>
        {isValid ? (
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            All required fields completed.
          </div>
        ) : (
          <div className="space-y-2">
            {missingFields.length > 0 && (
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <span>
                  Please complete required fields:
                  {missingFields.map((field) => ` ${field.label}`).join(',')}
                </span>
              </div>
            )}
            {rootError && (
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                <span>{rootError}</span>
              </div>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * Create default item for array fields
 */
export function createDefaultItem(children: Record<string, any>) {
  const defaultItem: any = {}
  Object.keys(children).forEach((key) => {
    const childField = children[key]
    switch (childField.type) {
      case 'string':
        defaultItem[key] = ''
        break
      case 'number':
        defaultItem[key] = 0
        break
      case 'boolean':
        defaultItem[key] = false
        break
      case 'object':
        defaultItem[key] = {}
        break
      case 'array':
        defaultItem[key] = []
        break
    }
  })
  return defaultItem
}

/**
 * Discriminated union section component
 */
export function DiscriminatedUnionSection({
  field,
  form,
  minimal = false,
}: {
  field: FormFieldDefinition
  form: UseSchemaFormReturn<any>
  minimal?: boolean
}) {
  // Guard against undefined field
  if (!field) return null
  if (!field.children) return null

  // Find the discriminant field (usually 'type')
  const discriminantEntry = Object.entries(field.children).find(
    ([, childField]) =>
      (childField as FormFieldDefinition).type === 'literal' &&
      !(childField as FormFieldDefinition).condition
  )

  if (!discriminantEntry) return null

  const [discriminantKey, discriminantField] = discriminantEntry as [string, FormFieldDefinition]
  const discriminantPath = discriminantKey

  // Get union type options and their fields
  const unionTypes = Object.entries(field.children)
    .filter(
      ([key, childField]) =>
        key !== discriminantKey && (childField as FormFieldDefinition).condition
    )
    .reduce(
      (acc, [, childField]) => {
        const condition = (childField as FormFieldDefinition).condition!
        if (!acc[condition.value]) {
          acc[condition.value] = []
        }
        acc[condition.value].push(childField as FormFieldDefinition)
        return acc
      },
      {} as Record<string, FormFieldDefinition[]>
    )

  const typeOptions = discriminantField.literalOptions || []
  const selectedType = getNestedValue(form.data, discriminantPath)

  const handleTypeChange = (newType: string) => {
    form.updateField(discriminantPath, newType)

    // Clear fields from other union variants
    Object.entries(field.children || {}).forEach(([key, childField]) => {
      const typedChildField = childField as FormFieldDefinition
      if (
        key !== discriminantKey &&
        typedChildField.condition &&
        typedChildField.condition.value !== newType
      ) {
        form.updateField(key, undefined)
      }
    })
  }

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <CardTitle className="text-sm sm:text-base">
          {field.label || formatLabel(field.key)}
          {field.description && (
            <p className="text-muted-foreground mt-2 text-xs sm:text-sm">{field.description}</p>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Type Selection */}
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm font-semibold">
            {discriminantField.label || formatLabel(discriminantKey)}
            {discriminantField.required && <span className="text-red-500">*</span>}
          </Label>
          <div className="flex flex-wrap gap-2">
            {typeOptions.map((option) => {
              const optionStr = String(option)

              return (
                <Button
                  key={optionStr}
                  type="button"
                  variant={selectedType === option ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleTypeChange(optionStr)}
                  className="capitalize"
                >
                  {optionStr}
                </Button>
              )
            })}
          </div>
          {selectedType && discriminantField.literalOptionsDescriptions?.[String(selectedType)] && (
            <p className="text-muted-foreground text-xs sm:text-sm border-l-2 border-primary pl-2">
              {discriminantField.literalOptionsDescriptions[String(selectedType)]}
            </p>
          )}
        </div>

        {/* Conditional Fields */}
        {selectedType && unionTypes[selectedType] && unionTypes[selectedType].length > 0 && (
          <div className="space-y-3">
            {unionTypes[selectedType].map((conditionalField) => {
              const fullPath = conditionalField.key
              const value = getNestedValue(form.data, fullPath)

              // Double-check the condition matches (safety check)
              if (conditionalField.condition && conditionalField.condition.value !== selectedType) {
                return null
              }

              return (
                <FormField
                  key={fullPath}
                  field={conditionalField}
                  value={value}
                  onChange={(value) => form.updateField(fullPath, value)}
                  error={form.validationErrors[fullPath]}
                  minimal={minimal}
                />
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Recursive form section component for objects and arrays
 */
export function FormSection<T = any>({
  field,
  form,
  basePath,
  level = 0,
  initialCollapsed = false,
  minimal = false,
}: NestedFormProps<T>) {
  const [isCollapsed, setIsCollapsed] = useState(level > 2 ? true : initialCollapsed)

  // Guard against undefined field
  if (!field) return null
  if (!field.children) return null

  // Check if this is a discriminated union (has children with conditions)
  const hasConditionalChildren = Object.values(field.children).some((child) => child.condition)
  if (hasConditionalChildren) {
    return <DiscriminatedUnionSection field={field} form={form} minimal={minimal} />
  }

  const sectionValue = getNestedValue(form.data, basePath) || (field.type === 'array' ? [] : {})
  const isArray = field.type === 'array'
  const isRoot = level === 0

  const addItem = () => {
    const newArray = [...(sectionValue as any[])]
    newArray.push(createDefaultItem(field.children!))
    form.updateField(basePath, newArray)
    // Expand the section when adding an item
    setIsCollapsed(false)
  }

  const removeItem = (index: number) => {
    const newArray = (sectionValue as any[]).filter((_: any, i: number) => i !== index)
    form.updateField(basePath, newArray)
    // Collapse the section when all items are removed
    if (newArray.length === 0) {
      setIsCollapsed(true)
    }
  }

  const renderChildren = (
    children: Record<string, any>,
    parentValue: any,
    parentPath: string,
    itemIndex?: number
  ) => {
    return Object.entries(children)
      .filter(([, childField]) => childField && childField.key) // Filter out undefined fields
      .sort(([, a], [, b]) => a.key.localeCompare(b.key))
      .map(([key, childField]) => {
        // Check if field has a condition and evaluate it
        if (childField.condition) {
          const { field: conditionField, value: expectedValue } = childField.condition
          const conditionValue = getNestedValue(form.data, conditionField)
          if (conditionValue !== expectedValue) {
            return null // Don't render this field
          }
        }

        const fullPath =
          itemIndex !== undefined ? `${parentPath}[${itemIndex}].${key}` : childField.key
        const fieldName = key.split('.').pop() || key
        const childValue = getNestedValue(parentValue, fieldName)

        if (childField.type === 'object' || childField.type === 'array') {
          return (
            <FormSection
              key={fullPath}
              field={childField}
              form={form}
              basePath={fullPath}
              level={level + 1}
              initialCollapsed={itemIndex !== undefined}
              minimal={minimal}
            />
          )
        }

        return (
          <FormField
            key={fullPath}
            field={childField}
            value={childValue}
            onChange={(value) => form.updateField(fullPath, value)}
            error={form.validationErrors[fullPath]}
            minimal={minimal}
          />
        )
      })
      .filter(Boolean) // Remove null entries from conditional rendering
  }

  const headerContent = (
    <>
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" />
          )}
          <CardTitle className="min-w-0 flex-1 text-sm sm:text-base">
            <span className="truncate">{field.label || formatLabel(field.key)}</span>
            {isArray && (
              <Badge variant="outline" className="ml-2 text-xs">
                {(sectionValue as any[]).length} items
              </Badge>
            )}
            {level > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                L{level}
              </Badge>
            )}
          </CardTitle>
        </div>
        {isArray && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              addItem()
            }}
            className="shrink-0"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        )}
      </div>
      {field.description && (
        <p className="text-muted-foreground mt-2 text-xs sm:text-sm">{field.description}</p>
      )}
    </>
  )

  const content = isArray ? (
    (sectionValue as any[]).length === 0 ? (
      <div className="text-center text-muted-foreground py-4">
        No items yet. Click &quot;Add&quot; to create the first item.
      </div>
    ) : (
      <div className="space-y-4">
        {(sectionValue as any[]).map((item: any, index: number) => (
          <Card key={`${basePath}[${index}]`} className="border border-dashed !shadow-none">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Item {index + 1}</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(index)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {renderChildren(field.children!, item, basePath, index)}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  ) : (
    <div className="grid gap-3 sm:gap-4">
      {renderChildren(field.children!, sectionValue, basePath)}
    </div>
  )

  return (
    <Card
      className={cn(
        'border-l-4',
        isRoot ? (isArray ? 'border-l-green-500' : 'border-l-primary') : 'border-l-accent'
      )}
    >
      <CardHeader
        className="cursor-pointer pb-0 gap-0"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {headerContent}
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-6 pt-0">{content}</CardContent>
      )}
    </Card>
  )
}

/**
 * Main form builder component
 */
export function FormBuilder<T = any>({
  form,
  className,
  title,
  collapsible = false,
  initialCollapsed = false,
}: FormBuilderProps<T>) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed)

  const calculateFieldComplexity = (field: FormFieldDefinition) => {
    if (field.type === 'object' || field.type === 'array') {
      return 1
    }
    return 0
  }

  const rootFields = Object.entries(form.fields)
    .filter(([, field]) => field && field.key && !field.key.includes('.'))
    .sort(([, a], [, b]) => calculateFieldComplexity(a) - calculateFieldComplexity(b))

  // Get root-level validation errors (from Schema.filter or general validation)
  const rootError = form.validationErrors['_root']

  const content = (
    <div className="space-y-4 sm:space-y-6">
      {rootError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{rootError}</AlertDescription>
        </Alert>
      )}
      {
        rootFields
          .map(([key, field]) => {
            // Check if field has a condition and evaluate it
            if (field.condition) {
              const { field: conditionField, value: expectedValue } = field.condition
              const conditionValue = getNestedValue(form.data, conditionField)
              if (conditionValue !== expectedValue) {
                return null // Don't render this field
              }
            }

            // Check if this is a discriminated union (has children with conditions)
            const hasConditionalChildren =
              field.children && Object.values(field.children).some((child) => child.condition)
            if (hasConditionalChildren) {
              return (
                <DiscriminatedUnionSection
                  key={field.key}
                  field={field}
                  form={form}
                  minimal={false}
                />
              )
            }

            if (field.type === 'object' || field.type === 'array') {
              return (
                <FormSection
                  key={field.key}
                  field={field}
                  form={form}
                  basePath={key}
                  level={0}
                  initialCollapsed={initialCollapsed}
                />
              )
            }

            const value = getNestedValue(form.data, key)
            return (
              <FormField
                key={field.key}
                field={field}
                value={value}
                onChange={(value) => form.updateField(key, value)}
                error={form.validationErrors[key]}
              />
            )
          })
          .filter(Boolean) /* Remove null entries from conditional rendering */
      }
    </div>
  )

  if (collapsible && title) {
    return (
      <Card className={className}>
        <CardHeader
          className="cursor-pointer p-3 sm:p-6 pb-0 gap-0"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex min-w-0 items-center">
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
            )}
            <CardTitle className="min-w-0 flex-1 truncate text-base sm:text-lg">{title}</CardTitle>
          </div>
        </CardHeader>
        {!isCollapsed && <CardContent className="p-3 sm:p-6 pt-0">{content}</CardContent>}
      </Card>
    )
  }

  return (
    <div className={className}>
      {title && <h3 className="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">{title}</h3>}
      {content}
    </div>
  )
}
