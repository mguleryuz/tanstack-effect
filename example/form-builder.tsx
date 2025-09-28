import { useState } from 'react'
import { formatLabel, getNestedValue } from 'tanstack-effect'
import type {
  FormBuilderProps,
  FormFieldProps,
  NestedFormProps,
} from 'tanstack-effect/client'

const Input = null as any
const Textarea = null as any
const Switch = null as any
const Label = null as any
const Card = null as any
const CardContent = null as any
const CardHeader = null as any
const CardTitle = null as any
const Button = null as any
const Badge = null as any
const cn = null as any
const ChevronDown = null as any
const ChevronRight = null as any
const Info = null as any
const Circle = null as any
const Plus = null as any
const Trash2 = null as any

/**
 * Individual form field component
 */
function FormField({ field, value, onChange, error }: FormFieldProps) {
  const [showDescription, setShowDescription] = useState(true)

  const renderField = () => {
    switch (field.type) {
      case 'string':
        return (
          <Textarea
            value={value || ''}
            onChange={(e: any) => onChange(e.target.value)}
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
            onChange={(e: any) => {
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
            <Switch
              checked={Boolean(value)}
              onCheckedChange={(e: any) => onChange(e)}
            />
            <span className="text-muted-foreground text-sm">
              {value ? 'Enabled' : 'Disabled'}
            </span>
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
function createDefaultItem(children: Record<string, any>) {
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
 * Recursive form section component for objects and arrays
 */
function FormSection<T = any>({
  field,
  form,
  basePath,
  level = 0,
  initialCollapsed = false,
}: NestedFormProps<T>) {
  const [isCollapsed, setIsCollapsed] = useState(
    level > 2 ? true : initialCollapsed
  )

  if (!field.children) return null

  const sectionValue =
    getNestedValue(form.data, basePath) || (field.type === 'array' ? [] : {})
  const isArray = field.type === 'array'
  const isRoot = level === 0

  const addItem = () => {
    const newArray = [...(sectionValue as any[])]
    newArray.push(createDefaultItem(field.children!))
    form.updateField(basePath, newArray)
  }

  const removeItem = (index: number) => {
    const newArray = (sectionValue as any[]).filter(
      (_: any, i: number) => i !== index
    )
    form.updateField(basePath, newArray)
  }

  const renderChildren = (
    children: Record<string, any>,
    parentValue: any,
    parentPath: string,
    itemIndex?: number
  ) => {
    return Object.entries(children)
      .sort(([, a], [, b]) => a.key.localeCompare(b.key))
      .map(([key, childField]) => {
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
          />
        )
      })
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
            onClick={(e: any) => {
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
          <Card key={`${basePath}[${index}]`} className="border border-dashed">
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

  const rootFields = Object.entries(form.fields)
    .filter(([, field]) => !field.key.includes('.'))
    .sort(([, a], [, b]) => a.key.localeCompare(b.key))

  const content = (
    <div className="space-y-4 sm:space-y-6">
      {rootFields.map(([key, field]) => {
        const value = getNestedValue(form.data, key)

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

        return (
          <FormField
            key={field.key}
            field={field}
            value={value}
            onChange={(value) => form.updateField(key, value)}
            error={form.validationErrors[key]}
          />
        )
      })}
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
