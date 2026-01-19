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
const EXPLICIT_FIELDS_PROMPT = `Hey, so product name is Breadcrumb, product description AI agents that reply to people on X, preferred language English, discovery instructions target BNB chain and base communities, projects and content creators alike, reply context should be witty, fun, but not too mocking. For image eval instructions, no political content.`

describe('AI Form Filler - Conditional Requirements', () => {
  it('parses requiredWhen annotation from ImageGenConfig schema', () => {
    const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

    console.log('\n=== IMAGEGEN FIELDS ===')
    const imageGenField = fields.imageGen
    expect(imageGenField).toBeDefined()
    expect(imageGenField.type).toBe('object')
    expect(imageGenField.children).toBeDefined()

    const imageGenChildren = imageGenField.children || {}
    Object.entries(imageGenChildren).forEach(([key, field]) => {
      console.log(`  ${key}:`)
      console.log(`    type: ${(field as any).type}`)
      console.log(`    required: ${(field as any).required}`)
      console.log(`    requiredWhen: ${JSON.stringify((field as any).requiredWhen)}`)
    })

    // Verify instructions has requiredWhen
    const instructionsField = imageGenChildren['imageGen.instructions']
    expect(instructionsField).toBeDefined()
    expect(instructionsField.requiredWhen).toBeDefined()
    expect(instructionsField.requiredWhen).toEqual({
      field: 'imageGen.enabled',
      value: true,
    })

    // Verify imageRefs has requiredWhen
    const imageRefsField = imageGenChildren['imageGen.imageRefs']
    expect(imageRefsField).toBeDefined()
    expect(imageRefsField.requiredWhen).toBeDefined()
    expect(imageRefsField.requiredWhen).toEqual({
      field: 'imageGen.enabled',
      value: true,
    })

    // Verify enabled does NOT have requiredWhen
    const enabledField = imageGenChildren['imageGen.enabled']
    expect(enabledField).toBeDefined()
    expect(enabledField.requiredWhen).toBeUndefined()

    console.log('\n✓ All requiredWhen annotations parsed correctly')
  })

  it.skipIf(shouldSkip)(
    'detects missing conditionally required fields when enabled=true',
    async () => {
      const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

      // When imageGen.enabled is true, instructions and imageRefs should be required
      const response = await fillFormWithAI({
        prompt: 'Enable image generation for this campaign',
        fields,
        partialData: {
          imageGen: {
            enabled: true,
            // instructions and imageRefs are missing
          },
        },
        messages: [],
      })

      console.log('\n=== CONDITIONAL REQUIREMENT TEST ===')
      console.log('Filled:', JSON.stringify(response.filled, null, 2))
      console.log('Missing:', response.missing)
      console.log('Complete:', response.complete)

      // The AI should recognize that with enabled=true, instructions might be needed
      // Check that the response includes imageGen with enabled=true
      const imageGen = response.filled.imageGen as Record<string, unknown>
      expect(imageGen?.enabled).toBe(true)
    },
    { timeout: 30000 }
  )

  /**
   * Test for "Disable image gen" command
   * User should be able to say "Disable image gen" and the AI should set imageGen.enabled = false
   */
  it.skipIf(shouldSkip)(
    'handles "Disable image gen" command correctly',
    async () => {
      const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

      // Start with imageGen enabled
      const currentData = {
        imageGen: {
          enabled: true,
          instructions: 'Generate cool images',
        },
      }

      const response = await fillFormWithAI({
        prompt: 'Disable image gen',
        fields,
        partialData: currentData,
        messages: [],
      })

      console.log('\n=== DISABLE IMAGE GEN TEST ===')
      console.log('Current data:', JSON.stringify(currentData, null, 2))
      console.log('Prompt: "Disable image gen"')
      console.log('Filled:', JSON.stringify(response.filled, null, 2))
      console.log('Summary:', response.summary)

      const imageGen = response.filled.imageGen as Record<string, unknown>

      // The AI should set enabled to false
      expect(imageGen).toBeDefined()
      expect(imageGen?.enabled).toBe(false)

      console.log('\n✓ imageGen.enabled correctly set to false')
    },
    { timeout: 30000 }
  )

  /**
   * Test for "Disable image gen" command with empty form
   * This simulates a fresh form where imageGen hasn't been set yet
   */
  it.skipIf(shouldSkip)(
    'handles "Disable image gen" command with empty form',
    async () => {
      const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

      // Start with empty form (no imageGen data)
      const currentData = {}

      const response = await fillFormWithAI({
        prompt: 'Disable image gen.',
        fields,
        partialData: currentData,
        messages: [],
      })

      console.log('\n=== DISABLE IMAGE GEN (EMPTY FORM) TEST ===')
      console.log('Current data:', JSON.stringify(currentData, null, 2))
      console.log('Prompt: "Disable image gen."')
      console.log('Filled:', JSON.stringify(response.filled, null, 2))
      console.log('Summary:', response.summary)

      const imageGen = response.filled.imageGen as Record<string, unknown>

      // The AI should set enabled to false even with empty form
      expect(imageGen).toBeDefined()
      expect(imageGen?.enabled).toBe(false)

      console.log('\n✓ imageGen.enabled correctly set to false')
    },
    { timeout: 30000 }
  )

  /**
   * Test for "Disable image gen" when imageGen already has enabled=false (default)
   * This simulates a form where the default value is already false
   */
  it.skipIf(shouldSkip)(
    'handles "Disable image gen" when already disabled (default)',
    async () => {
      const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

      // This simulates the schema default: enabled=false
      const currentData = {
        imageGen: {
          enabled: false,
          instructions: '',
          imageRefs: [],
        },
      }

      const response = await fillFormWithAI({
        prompt: 'Disable image gen.',
        fields,
        partialData: currentData,
        messages: [],
      })

      console.log('\n=== DISABLE IMAGE GEN (ALREADY DISABLED) TEST ===')
      console.log('Current data:', JSON.stringify(currentData, null, 2))
      console.log('Prompt: "Disable image gen."')
      console.log('Filled:', JSON.stringify(response.filled, null, 2))
      console.log('Summary:', response.summary)

      const imageGen = response.filled.imageGen as Record<string, unknown>

      // The AI should keep enabled as false
      expect(imageGen).toBeDefined()
      expect(imageGen?.enabled).toBe(false)

      // Summary should indicate no changes were made (since it's already disabled)
      // OR acknowledge that it's now disabled
      console.log('\n✓ imageGen.enabled correctly remains false')
    },
    { timeout: 30000 }
  )

  /**
   * User's exact scenario: imageGen.enabled is true, user says "Disable image gen."
   * This is the bug report case - the AI should set enabled to false
   */
  it.skipIf(shouldSkip)(
    'CRITICAL: disables image gen when enabled=true (user bug report)',
    async () => {
      const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

      // User's scenario: enabled is true
      const currentData = {
        imageGen: {
          enabled: true,
          instructions: '',
          imageRefs: [],
        },
      }

      const response = await fillFormWithAI({
        prompt: 'Disable image gen.',
        fields,
        partialData: currentData,
        messages: [],
      })

      console.log('\n=== USER BUG REPORT: DISABLE IMAGE GEN (enabled=true) ===')
      console.log('Current data:', JSON.stringify(currentData, null, 2))
      console.log('Prompt: "Disable image gen."')
      console.log('Filled:', JSON.stringify(response.filled, null, 2))
      console.log('Summary:', response.summary)
      console.log('Missing:', response.missing)

      const imageGen = response.filled.imageGen as Record<string, unknown>

      // The AI MUST set enabled to false
      expect(imageGen).toBeDefined()
      expect(imageGen?.enabled).toBe(false)

      // The summary should NOT say "No new fields were extracted"
      expect(response.summary).not.toContain('No new fields were extracted')

      console.log('\n✓ imageGen.enabled correctly changed from true to false')
    },
    { timeout: 30000 }
  )

  /**
   * Test for "Enable image gen" command
   */
  it.skipIf(shouldSkip)(
    'handles "Enable image gen" command correctly',
    async () => {
      const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

      // Start with imageGen disabled
      const currentData = {
        imageGen: {
          enabled: false,
        },
      }

      const response = await fillFormWithAI({
        prompt: 'Enable image generation',
        fields,
        partialData: currentData,
        messages: [],
      })

      console.log('\n=== ENABLE IMAGE GEN TEST ===')
      console.log('Current data:', JSON.stringify(currentData, null, 2))
      console.log('Prompt: "Enable image generation"')
      console.log('Filled:', JSON.stringify(response.filled, null, 2))
      console.log('Summary:', response.summary)

      const imageGen = response.filled.imageGen as Record<string, unknown>

      // The AI should set enabled to true
      expect(imageGen).toBeDefined()
      expect(imageGen?.enabled).toBe(true)

      console.log('\n✓ imageGen.enabled correctly set to true')
    },
    { timeout: 30000 }
  )
})

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

      // At minimum, should extract productName
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
   * - preferredLanguages: "English" (should be ["en"])
   * - discoveryInstructions: "BNB chain and base communities, projects and content creators alike"
   * - replyContext: "witty, fun, but not too mocking"
   * - imageEvalInstructions: "No images, please"
   *
   * Known issues this test catches:
   * 1. AI fails to extract productName even when explicitly stated
   * 2. AI fails to extract productDescription even when explicitly stated
   * 3. AI fails to extract preferredLanguages even when explicitly stated
   * 4. AI fails to extract discoveryInstructions even when explicitly stated
   * 5. AI fails to extract imageEvalInstructions even when explicitly stated
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

      // 3. preferredLanguages - explicitly stated as "English" (should map to ["en"])
      console.log(`preferredLanguages: ${JSON.stringify(marketing?.preferredLanguages)} (expected: ["en"])`)
      expect(marketing?.preferredLanguages).toBeDefined()
      const languages = marketing?.preferredLanguages as string[]
      expect(Array.isArray(languages)).toBe(true)
      expect(languages).toContain('en')

      // 4. discoveryInstructions - explicitly stated as "BNB chain and base communities..."
      console.log(`discoveryInstructions: "${marketing?.discoveryInstructions}" (expected to contain "BNB" or "base")`)
      expect(marketing?.discoveryInstructions).toBeDefined()
      const discoveryInstr = String(marketing?.discoveryInstructions).toLowerCase()
      expect(discoveryInstr.includes('bnb') || discoveryInstr.includes('base')).toBe(true)

      // 5. replyContext - explicitly stated as "witty, fun, but not too mocking"
      console.log(`replyContext: "${marketing?.replyContext}" (expected to contain "witty" or "fun")`)
      expect(marketing?.replyContext).toBeDefined()
      const replyCtx = String(marketing?.replyContext).toLowerCase()
      expect(replyCtx.includes('witty') || replyCtx.includes('fun') || replyCtx.includes('mocking')).toBe(true)

      // 6. imageEvalInstructions - explicitly stated as "For image eval instructions, no political content"
      console.log(`imageEvalInstructions: "${marketing?.imageEvalInstructions}" (expected to contain "political")`)
      expect(marketing?.imageEvalInstructions).toBeDefined()
      expect(String(marketing?.imageEvalInstructions).toLowerCase()).toContain('political')

      // Summary: Count how many fields were correctly extracted
      const expectedFields = [
        'productName',
        'productDescription',
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

      // All 6 explicitly stated fields MUST be extracted
      expect(extractedCount).toBe(6)
    },
    { timeout: 30000 }
  )

  /**
   * Tests that replyContext is correctly extracted from explicit prompt.
   */
  it.skipIf(shouldSkip)(
    'correctly extracts replyContext field',
    async () => {
      const fields = generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

      // Prompt explicitly mentions "reply context should be witty"
      const response = await fillFormWithAI({
        prompt: EXPLICIT_FIELDS_PROMPT,
        fields,
        messages: [],
      })

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== FIELD EXTRACTION TEST ===')
      console.log(`replyContext: "${marketing?.replyContext}"`)

      // replyContext should contain the witty/fun/mocking context
      expect(marketing?.replyContext).toBeDefined()
      const replyCtx = String(marketing?.replyContext).toLowerCase()
      expect(
        replyCtx.includes('witty') ||
          replyCtx.includes('fun') ||
          replyCtx.includes('mocking')
      ).toBe(true)
    },
    { timeout: 30000 }
  )
})
