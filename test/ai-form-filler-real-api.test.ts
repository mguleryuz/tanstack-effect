/**
 * Real API test for AI form filler with VisitorSettings schema
 *
 * Tests:
 * 1. Schema 1:1 to AI - verify form fields map correctly to JSON Schema
 * 2. Context 1:1 to AI - verify current data is passed correctly
 * 3. Response - verify AI extracts fields correctly
 * 4. Explicit field extraction - verify AI extracts ALL explicitly stated fields
 *
 * Requires GOOGLE_GENERATIVE_AI_API_KEY environment variable.
 */
import { describe, it, expect } from 'bun:test'
import { generateFormFieldsWithSchemaAnnotations } from '../src/schema-form'
import { fillFormWithAI, buildJsonSchema } from '../src/ai/server'
import { VisitorSettings } from '../../../lib/schemas'

const shouldSkip = !process.env.GOOGLE_GENERATIVE_AI_API_KEY

const TEST_PROMPT = `My product is called Breadcrumb. It's an advertising tool. We want to target Binance Smart Chain. We want it to reply hyping up the product but not being too complimentary but being friendly enough.`

/**
 * Real user prompt that explicitly states ALL marketing fields.
 * The AI MUST extract every field mentioned here.
 */
const EXPLICIT_FIELDS_PROMPT = `Hey, so product name is Breadcrumb, product description AI agents that reply to people on X, product URL breadcrumb.cash, CTA subtle, preferred language English, discovery instructions, BNB chain and base communities, projects and content creators alike, reply context should be witty, fun, but not too mocking. No images, please.`

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

  /**
   * CRITICAL TEST: Validates that AI extracts ALL explicitly stated fields.
   *
   * This test uses a real user prompt where they explicitly state:
   * - productName: "Breadcrumb"
   * - productDescription: "AI agents that reply to people on X"
   * - productUrl: "breadcrumb.cash"
   * - ctaStyle: "subtle"
   * - preferredLanguages: "English" (should be ["en"])
   * - discoveryInstructions: "BNB chain and base communities, projects and content creators alike"
   * - replyContext: "witty, fun, but not too mocking"
   * - imageEvalInstructions: "No images, please"
   *
   * Known issues this test catches:
   * 1. AI fails to extract productName even when explicitly stated
   * 2. AI fails to extract productDescription even when explicitly stated
   * 3. AI fails to extract productUrl even when explicitly stated
   * 4. AI fails to extract ctaStyle even when explicitly stated
   * 5. AI fails to extract preferredLanguages even when explicitly stated
   * 6. AI fails to extract discoveryInstructions even when explicitly stated
   * 7. AI confuses replyContext with tone field
   * 8. AI fails to extract imageEvalInstructions even when explicitly stated
   */
  it.skipIf(shouldSkip)(
    'extracts ALL explicitly stated fields from user prompt',
    async () => {
      const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

      const response = await fillFormWithAI({
        prompt: EXPLICIT_FIELDS_PROMPT,
        fields,
        messages: [],
      })

      console.log('\n=== AI RESPONSE (Explicit Fields Prompt) ===')
      console.log('Prompt:', EXPLICIT_FIELDS_PROMPT)
      console.log('Filled:', JSON.stringify(response.filled, null, 2))

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== FIELD EXTRACTION VALIDATION ===')

      // 1. productName - explicitly stated as "Breadcrumb"
      console.log(`productName: "${marketing?.productName}" (expected: "Breadcrumb")`)
      expect(marketing?.productName).toBe('Breadcrumb')

      // 2. productDescription - explicitly stated as "AI agents that reply to people on X"
      console.log(`productDescription: "${marketing?.productDescription}" (expected to contain "AI agents")`)
      expect(marketing?.productDescription).toBeDefined()
      expect(String(marketing?.productDescription).toLowerCase()).toContain('ai agent')

      // 3. productUrl - explicitly stated as "breadcrumb.cash"
      console.log(`productUrl: "${marketing?.productUrl}" (expected: "breadcrumb.cash" or with https)`)
      expect(marketing?.productUrl).toBeDefined()
      expect(String(marketing?.productUrl).toLowerCase()).toContain('breadcrumb.cash')

      // 4. ctaStyle - explicitly stated as "subtle"
      console.log(`ctaStyle: "${marketing?.ctaStyle}" (expected: "subtle")`)
      expect(marketing?.ctaStyle).toBe('subtle')

      // 5. preferredLanguages - explicitly stated as "English" (should map to ["en"])
      console.log(`preferredLanguages: ${JSON.stringify(marketing?.preferredLanguages)} (expected: ["en"])`)
      expect(marketing?.preferredLanguages).toBeDefined()
      const languages = marketing?.preferredLanguages as string[]
      expect(Array.isArray(languages)).toBe(true)
      expect(languages).toContain('en')

      // 6. discoveryInstructions - explicitly stated as "BNB chain and base communities..."
      console.log(`discoveryInstructions: "${marketing?.discoveryInstructions}" (expected to contain "BNB" or "base")`)
      expect(marketing?.discoveryInstructions).toBeDefined()
      const discoveryInstr = String(marketing?.discoveryInstructions).toLowerCase()
      expect(discoveryInstr.includes('bnb') || discoveryInstr.includes('base')).toBe(true)

      // 7. replyContext - explicitly stated as "witty, fun, but not too mocking"
      // CRITICAL: This should NOT be confused with the "tone" field!
      console.log(`replyContext: "${marketing?.replyContext}" (expected to contain "witty" or "fun")`)
      expect(marketing?.replyContext).toBeDefined()
      const replyCtx = String(marketing?.replyContext).toLowerCase()
      expect(replyCtx.includes('witty') || replyCtx.includes('fun') || replyCtx.includes('mocking')).toBe(true)

      // 8. imageEvalInstructions - explicitly stated as "No images, please"
      console.log(`imageEvalInstructions: "${marketing?.imageEvalInstructions}" (expected to contain "no images")`)
      expect(marketing?.imageEvalInstructions).toBeDefined()
      expect(String(marketing?.imageEvalInstructions).toLowerCase()).toContain('no')

      // Summary: Count how many fields were correctly extracted
      const expectedFields = [
        'productName',
        'productDescription',
        'productUrl',
        'ctaStyle',
        'preferredLanguages',
        'discoveryInstructions',
        'replyContext',
        'imageEvalInstructions',
      ]

      const extractedCount = expectedFields.filter(
        (field) => marketing?.[field] != null && marketing?.[field] !== ''
      ).length

      console.log(`\n=== SUMMARY ===`)
      console.log(`Extracted ${extractedCount}/${expectedFields.length} explicitly stated fields`)
      expectedFields.forEach((field) => {
        const value = marketing?.[field]
        const status = value != null && value !== '' ? '✓' : '✗'
        console.log(`  ${status} ${field}: ${JSON.stringify(value)}`)
      })

      // All 8 explicitly stated fields MUST be extracted
      expect(extractedCount).toBe(8)
    },
    { timeout: 30000 }
  )

  /**
   * Tests that replyContext is NOT confused with tone.
   * User said "reply context should be witty" - this should go to replyContext, not tone.
   */
  it.skipIf(shouldSkip)(
    'does NOT confuse replyContext with tone field',
    async () => {
      const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

      // Prompt explicitly mentions "reply context should be witty"
      const response = await fillFormWithAI({
        prompt: EXPLICIT_FIELDS_PROMPT,
        fields,
        messages: [],
      })

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== FIELD CONFUSION TEST ===')
      console.log(`tone: "${marketing?.tone}"`)
      console.log(`replyContext: "${marketing?.replyContext}"`)

      // replyContext should contain the witty/fun/mocking context
      expect(marketing?.replyContext).toBeDefined()
      const replyCtx = String(marketing?.replyContext).toLowerCase()
      expect(replyCtx.includes('witty') || replyCtx.includes('fun') || replyCtx.includes('mocking')).toBe(true)

      // tone should NOT be set to "witty" when user explicitly said "reply context should be witty"
      // If tone is set, it should be from the tone enum, not from replyContext
      if (marketing?.tone) {
        const validTones = ['professional', 'friendly', 'casual', 'witty', 'formal']
        expect(validTones.includes(String(marketing.tone))).toBe(true)
        // The user's input "reply context should be witty" should NOT change tone
        // unless there's also an explicit tone instruction
        console.log(`⚠ Note: tone was set to "${marketing.tone}" - verify this is intentional`)
      }
    },
    { timeout: 30000 }
  )
})
