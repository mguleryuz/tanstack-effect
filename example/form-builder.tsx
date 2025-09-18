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
                // For empty input, use 0 instead of null to satisfy number schema
                onChange(0)
              } else {
                const val = Number(inputValue)
                // Ensure we're passing a proper number, not NaN
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
          {field.required && <span className="text-red-500">*</span>}
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
 * Nested object form component
 */
function NestedForm<T = any>({
  field,
  form,
  basePath,
  level = 0,
  initialCollapsed = false,
}: NestedFormProps<T>) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed || level > 1)

  if (!field.children) return null

  const nestedValue = getNestedValue(form.data, basePath)

  return (
    <Card
      className={cn(
        'border-l-4',
        level === 0 ? 'border-l-primary' : 'border-l-accent'
      )}
    >
      <CardHeader
        className="cursor-pointer pb-3"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
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
              {level > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  L{level}
                </Badge>
              )}
            </CardTitle>
          </div>
        </div>
        {field.description && (
          <p className="text-muted-foreground mt-2 text-xs sm:text-sm">
            {field.description}
          </p>
        )}
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-6">
          <div className="grid gap-3 sm:gap-4">
            {Object.entries(field.children).map(([key, childField]) => {
              // Use the childField.key directly since it should be the correct path
              const fullPath = childField.key
              const fieldName = key.split('.').pop() || key
              const childValue = getNestedValue(nestedValue, fieldName)

              if (childField.type === 'object') {
                return (
                  <NestedForm
                    key={key}
                    field={childField}
                    form={form}
                    basePath={fullPath}
                    level={level + 1}
                    initialCollapsed={initialCollapsed}
                  />
                )
              }

              return (
                <FormField
                  key={key}
                  field={childField}
                  value={childValue}
                  onChange={(value) => form.updateField(fullPath, value)}
                  error={form.validationErrors[fullPath]}
                />
              )
            })}
          </div>
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
  defaultCollapsed = false,
  initialCollapsed = false,
}: FormBuilderProps<T>) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  const rootFields = Object.entries(form.fields).filter(
    ([_, field]) => !field.key.includes('.')
  )

  const content = (
    <div className="space-y-4 sm:space-y-6">
      {rootFields.map(([key, field]) => {
        const value = getNestedValue(form.data, key)

        if (field.type === 'object') {
          return (
            <NestedForm
              key={key}
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
            key={key}
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
          className="cursor-pointer p-3 sm:p-6"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex min-w-0 items-center gap-2">
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
          <CardContent className="p-3 sm:p-6">{content}</CardContent>
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
