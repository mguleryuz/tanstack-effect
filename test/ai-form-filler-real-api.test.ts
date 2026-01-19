/**
 * Real API test for AI form filler with VisitorSettings schema
 *
 * Tests:
 * 1. Schema 1:1 to AI - verify form fields map correctly to JSON Schema
 * 2. Context 1:1 to AI - verify current data is passed correctly
 * 3. Response - verify AI extracts fields correctly
 *
 * Requires GOOGLE_GENERATIVE_AI_API_KEY environment variable.
 */
import { describe, it, expect } from 'bun:test'
import { generateFormFieldsWithSchemaAnnotations } from '../src/schema-form'
import { fillFormWithAI, buildJsonSchema } from '../src/ai/server'
import { VisitorSettings } from '../../../lib/schemas'

const shouldSkip = !process.env.GOOGLE_GENERATIVE_AI_API_KEY

const TEST_PROMPT = `My product is called Breadcrumb. It's an advertising tool. We want to target Binance Smart Chain. We want it to reply hyping up the product but not being too complimentary but being friendly enough.`

describe('AI Form Filler - Schema Validation', () => {
  it('validates schema 1:1 mapping to JSON Schema', () => {
    const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)
    const jsonSchema = buildJsonSchema(fields)

    console.log('\n=== FORM FIELDS (root) ===')
    Object.entries(fields).forEach(([key, field]) => {
      if (!key.includes('.')) {
        console.log(`  ${key}: ${(field as any).type}`)
      }
    })

    console.log('\n=== JSON SCHEMA ===')
    console.log(JSON.stringify(jsonSchema, null, 2))

    // Validate root structure
    expect(jsonSchema.type).toBe('object')
    expect(jsonSchema.properties).toBeDefined()

    const props = jsonSchema.properties as Record<string, any>

    // Validate root fields exist
    expect(props.runType).toBeDefined()
    expect(props.marketing).toBeDefined()
    expect(props.options).toBeDefined()
    expect(props.imageGen).toBeDefined()
    expect(props.isActive).toBeDefined()

    // Validate marketing nested structure
    expect(props.marketing.type).toBe('object')
    expect(props.marketing.properties).toBeDefined()

    const marketingProps = props.marketing.properties as Record<string, any>
    console.log('\n=== MARKETING PROPERTIES IN JSON SCHEMA ===')
    Object.keys(marketingProps).forEach((k) => {
      console.log(`  ${k}: ${marketingProps[k].type}`)
    })

    // Validate ALL marketing fields are present in JSON Schema
    const expectedMarketingFields = [
      'discoveryQuery',
      'searchProduct',
      'productName',
      'productDescription',
      'productUrl',
      'tone',
      'ctaStyle',
      'discoveryInstructions',
      'replyContext',
      'preferredLanguages',
      'imageEvalInstructions',
    ]

    expectedMarketingFields.forEach((fieldName) => {
      expect(marketingProps[fieldName]).toBeDefined()
      console.log(
        `  ✓ ${fieldName}: type=${marketingProps[fieldName].type}, desc="${marketingProps[fieldName].description?.slice(0, 40)}..."`
      )
    })
  })

  it('validates context is passed correctly', () => {
    const currentData = {
      marketing: {
        productName: 'ExistingProduct',
        tone: 'professional',
      },
    }

    const fieldsWithData = generateFormFieldsWithSchemaAnnotations(
      currentData,
      VisitorSettings
    )
    const fieldsWithEmpty = generateFormFieldsWithSchemaAnnotations(
      {},
      VisitorSettings
    )

    console.log('\n=== FIELDS WITH DATA (hook flow) ===')
    const marketingChildren = fieldsWithData.marketing?.children || {}
    console.log('Marketing children:', Object.keys(marketingChildren).length)
    Object.keys(marketingChildren).forEach((k) => console.log(`  - ${k}`))

    console.log('\n=== FIELDS WITH EMPTY (test flow) ===')
    const emptyMarketingChildren = fieldsWithEmpty.marketing?.children || {}
    console.log('Marketing children:', Object.keys(emptyMarketingChildren).length)
    Object.keys(emptyMarketingChildren).forEach((k) => console.log(`  - ${k}`))

    console.log('\n=== JSON SCHEMA COMPARISON ===')
    const jsonSchemaWithData = buildJsonSchema(fieldsWithData)
    const jsonSchemaWithEmpty = buildJsonSchema(fieldsWithEmpty)

    const propsWithData = (jsonSchemaWithData.properties as any)?.marketing
      ?.properties || {}
    const propsWithEmpty = (jsonSchemaWithEmpty.properties as any)?.marketing
      ?.properties || {}

    console.log('JSON Schema marketing fields with data:', Object.keys(propsWithData).length)
    console.log('JSON Schema marketing fields with empty:', Object.keys(propsWithEmpty).length)

    // They should be the same!
    expect(Object.keys(propsWithData).length).toBe(
      Object.keys(propsWithEmpty).length
    )
  })

  it.skipIf(shouldSkip)(
    'extracts multiple fields from initial prompt',
    async () => {
      const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

      const response = await fillFormWithAI({
        prompt: TEST_PROMPT,
        fields,
        messages: [],
      })

      console.log('\n=== AI RESPONSE (Initial Prompt) ===')
      console.log('Filled:', JSON.stringify(response.filled, null, 2))

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== MARKETING FIELDS EXTRACTED ===')
      Object.entries(marketing || {}).forEach(([k, v]) => {
        if (v != null && v !== '') {
          console.log(`  ✓ ${k}: "${v}"`)
        }
      })

      // Core extractions from: "My product is called Breadcrumb. It's an advertising tool.
      // We want to target Binance Smart Chain. We want it to reply hyping up the product
      // but not being too complimentary but being friendly enough."

      // Should extract productName from "called Breadcrumb"
      expect(marketing?.productName).toBe('Breadcrumb')

      // Should extract discoveryQuery from "target Binance Smart Chain"
      if (marketing?.discoveryQuery) {
        expect(String(marketing.discoveryQuery).toLowerCase()).toContain('binance')
      } else {
        console.log('⚠ discoveryQuery NOT extracted')
      }

      // Should extract tone from "friendly"
      expect(marketing?.tone).toBe('friendly')

      // Should extract productDescription from "It's an advertising tool"
      if (marketing?.productDescription) {
        console.log('✓ productDescription extracted:', marketing.productDescription)
      } else {
        console.log('⚠ productDescription NOT extracted (expected from "It\'s an advertising tool")')
      }

      // Should extract replyContext from "reply hyping up..."
      if (marketing?.replyContext) {
        console.log('✓ replyContext extracted:', marketing.replyContext)
      } else {
        console.log('⚠ replyContext NOT extracted (expected from "reply hyping up...")')
      }

      // At minimum, should extract productName and tone
      const filledCount = Object.values(marketing || {}).filter(
        (v) => v != null && v !== ''
      ).length
      console.log(`\nTotal filled: ${filledCount} fields`)
      expect(filledCount).toBeGreaterThanOrEqual(2)
    },
    { timeout: 30000 }
  )

  it.skipIf(shouldSkip)(
    'CRUD: adds new field to existing data',
    async () => {
      // CRUD approach: Schema + Current Data + User Message (no history)
      const currentData = {
        marketing: {
          productName: 'Breadcrumb',
          discoveryQuery: 'Binance Smart Chain',
          tone: 'friendly',
        },
      }

      const prompt = `reply context is We want it to reply hyping up the product but not being too complimentary`

      const fields = generateFormFieldsWithSchemaAnnotations(
        currentData,
        VisitorSettings
      )

      const response = await fillFormWithAI({
        prompt,
        fields,
        partialData: currentData,
        messages: [], // CRUD: no history
      })

      console.log('\n=== CRUD UPDATE ===')
      console.log('Current:', JSON.stringify(currentData.marketing, null, 2))
      console.log('Prompt:', prompt)
      console.log('Result:', JSON.stringify(response.filled, null, 2))

      const marketing = response.filled.marketing as Record<string, unknown>

      // Should preserve existing data
      expect(marketing?.productName).toBe('Breadcrumb')
      expect(marketing?.tone).toBe('friendly')

      // Should extract new field from prompt
      expect(marketing?.replyContext).toBeDefined()
      console.log('✓ replyContext extracted:', marketing?.replyContext)
    },
    { timeout: 30000 }
  )
})
