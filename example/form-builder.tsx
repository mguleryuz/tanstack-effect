// @ts-nocheck
'use client'

import {
  ChevronDown,
  ChevronRight,
  Circle,
  Info,
  Plus,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { formatLabel, getNestedValue } from 'tanstack-effect'
import type {
  FormBuilderProps,
  FormFieldDefinition,
  FormFieldProps,
  NestedFormProps,
  UseSchemaFormReturn,
} from 'tanstack-effect'

import { cn } from '@/lib/utils'

import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Switch } from './ui/switch'
import { Textarea } from './ui/textarea'

/**
 * Individual form field component
 */
export function FormField({
  field,
  value,
  onChange,
  error,
  minimal = false,
}: FormFieldProps) {
  const [showDescription, setShowDescription] = useState(true)

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
            <span className="text-muted-foreground text-sm">
              {value ? 'Enabled' : 'Disabled'}
            </span>
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
                onChange(
                  selectedOption !== undefined ? selectedOption : selectedValue
                )
              }}
            >
              <SelectTrigger
                className={cn('flex-1', error && 'border-red-500')}
              >
                <SelectValue placeholder="Select an option..." />
              </SelectTrigger>
              <SelectContent position="item-aligned" className="h-max w-max">
                {!field.required && (
                  <SelectItem
                    value="__clear__"
                    className="text-muted-foreground italic"
                  >
                    (None)
                  </SelectItem>
                )}
                {(field.literalOptions || []).map((option) => (
                  <SelectItem
                    key={option?.toString()}
                    value={option?.toString()}
                  >
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
          className={cn(
            'min-w-0 flex-1 text-xs sm:text-sm',
            field.required && 'font-semibold'
          )}
        >
          <span className="break-words">
            {field.label || formatLabel(field.key)}
          </span>
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
          >
            <Info className="h-3 w-3" />
          </Button>
        )}
      </div>

      {showDescription && field.description && (
        <p className="text-muted-foreground border-t text-xs sm:text-sm">
          {field.description}
        </p>
      )}

      <div className="w-full">{renderField()}</div>

      {error && <div className="text-xs text-red-500 sm:text-sm">{error}</div>}
    </div>
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
  basePath,
}: {
  field: FormFieldDefinition
  form: UseSchemaFormReturn<any>
  basePath: string
}) {
  const [selectedType, setSelectedType] = useState<string>('')

  if (!field.children) return null

  // Get union type options and their fields
  const unionTypes = Object.entries(field.children)
    .filter(([, childField]) => (childField as FormFieldDefinition).condition)
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

  const typeOptions = Object.keys(unionTypes)

  const handleTypeChange = (newType: string) => {
    setSelectedType(newType)

    // Clear fields from other union variants
    Object.entries(field.children || {}).forEach(([key, childField]) => {
      const typedChildField = childField as FormFieldDefinition
      if (
        typedChildField.condition &&
        typedChildField.condition.value !== newType
      ) {
        const fullPath = basePath ? `${basePath}.${key}` : key
        form.updateField(fullPath, undefined)
      }
    })
  }

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <CardTitle className="text-sm sm:text-base">
          {field.label || formatLabel(field.key)}
          {field.description && (
            <p className="text-muted-foreground mt-2 text-xs sm:text-sm">
              {field.description}
            </p>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Type Selection */}
        <div className="space-y-2">
          <Label className="text-xs sm:text-sm font-semibold">
            Fee Configuration Type
          </Label>
          <div className="flex flex-wrap gap-2">
            {typeOptions.map((option) => (
              <Button
                key={option}
                type="button"
                variant={selectedType === option ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleTypeChange(option)}
                className="capitalize"
              >
                {option}
              </Button>
            ))}
          </div>
        </div>

        {/* Conditional Fields */}
        {selectedType && unionTypes[selectedType] && (
          <div className="space-y-3">
            {unionTypes[selectedType].map((conditionalField) => {
              const fullPath = basePath
                ? `${basePath}.${conditionalField.key}`
                : conditionalField.key
              const value = getNestedValue(form.data, fullPath)

              return (
                <FormField
                  key={fullPath}
                  field={conditionalField}
                  value={value}
                  onChange={(value) => form.updateField(fullPath, value)}
                  error={form.validationErrors[fullPath]}
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
  const [isCollapsed, setIsCollapsed] = useState(
    level > 2 ? true : initialCollapsed
  )

  if (!field.children) return null

  // Check if this is a discriminated union (has children with conditions)
  const hasConditionalChildren = Object.values(field.children).some(
    (child) => child.condition
  )
  if (hasConditionalChildren) {
    return (
      <DiscriminatedUnionSection
        field={field}
        form={form}
        basePath={basePath}
      />
    )
  }

  const sectionValue =
    getNestedValue(form.data, basePath) || (field.type === 'array' ? [] : {})
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
    const newArray = (sectionValue as any[]).filter(
      (_: any, i: number) => i !== index
    )
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
          const { field: conditionField, value: expectedValue } =
            childField.condition
          const conditionValue = getNestedValue(form.data, conditionField)
          if (conditionValue !== expectedValue) {
            return null // Don't render this field
          }
        }

        const fullPath =
          itemIndex !== undefined
            ? `${parentPath}[${itemIndex}].${key}`
            : childField.key
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
            <span className="truncate">
              {field.label || formatLabel(field.key)}
            </span>
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
        <p className="text-muted-foreground mt-2 text-xs sm:text-sm">
          {field.description}
        </p>
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
          <Card
            key={`${basePath}[${index}]`}
            className="border border-dashed !shadow-none"
          >
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
        isRoot
          ? isArray
            ? 'border-l-green-500'
            : 'border-l-primary'
          : 'border-l-accent'
      )}
    >
      <CardHeader
        className="cursor-pointer pb-0 gap-0"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {headerContent}
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-6 pt-0">
          {content}
        </CardContent>
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
    .sort(
      ([, a], [, b]) =>
        calculateFieldComplexity(a) - calculateFieldComplexity(b)
    )

  const content = (
    <div className="space-y-4 sm:space-y-6">
      {
        rootFields
          .map(([key, field]) => {
            // Check if field has a condition and evaluate it
            if (field.condition) {
              const { field: conditionField, value: expectedValue } =
                field.condition
              const conditionValue = getNestedValue(form.data, conditionField)
              if (conditionValue !== expectedValue) {
                return null // Don't render this field
              }
            }

            // Check if this is a discriminated union (has children with conditions)
            const hasConditionalChildren =
              field.children &&
              Object.values(field.children).some((child) => child.condition)
            if (hasConditionalChildren) {
              return (
                <DiscriminatedUnionSection
                  key={field.key}
                  field={field}
                  form={form}
                  basePath={key}
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
            <CardTitle className="min-w-0 flex-1 truncate text-base sm:text-lg">
              {title}
            </CardTitle>
          </div>
        </CardHeader>
        {!isCollapsed && (
          <CardContent className="p-3 sm:p-6 pt-0">{content}</CardContent>
        )}
      </Card>
    )
  }

  return (
    <div className={className}>
      {title && (
        <h3 className="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">
          {title}
        </h3>
      )}
      {content}
    </div>
  )
}
