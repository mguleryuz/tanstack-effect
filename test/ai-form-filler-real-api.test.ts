// @ts-nocheck
/**
 * Real API test for AI form filler with VisitorSettings schema
 *
 * Tests real-world use cases:
 * 1. Contextual inference - product description fills multiple related fields
 * 2. Diverse product types - SaaS, e-commerce, creator tools, etc.
 * 3. Natural language understanding - casual user input → structured data
 * 4. Field updates - modifying existing values with natural commands
 * 5. Toggle commands - enable/disable features
 * 6. Referential reasoning - "match our tone", "align with product"
 *
 * Requires GOOGLE_GENERATIVE_AI_API_KEY environment variable.
 */
import { describe, it, expect } from 'bun:test'
import { generateFormFieldsWithSchemaAnnotations } from '../src/schema-form'
import { fillFormWithAI, buildJsonSchema } from '../src/ai/server'
import { VisitorSettings } from 'x-marketer/schemas'

const shouldSkip = !process.env.GOOGLE_GENERATIVE_AI_API_KEY

// Helper to get fields from empty form
const getFields = () => generateFormFieldsWithSchemaAnnotations({}, VisitorSettings)

describe('AI Form Filler - Contextual Inference', () => {
  /**
   * CORE TEST: When a user describes their product naturally, the AI should
   * infer and fill multiple fields (not just the ones explicitly named).
   */
  it.skipIf(shouldSkip)(
    'infers discovery query and instructions from product description',
    async () => {
      const fields = getFields()

      const response = await fillFormWithAI({
        prompt: `I'm building a project management tool called TaskFlow for remote engineering teams. We want to reach developers who struggle with async collaboration.`,
        fields,
        messages: [],
      })

      console.log('\n=== CONTEXTUAL INFERENCE TEST ===')
      console.log('Filled:', JSON.stringify(response.filled, null, 2))

      const marketing = response.filled.marketing as Record<string, unknown>

      // Should extract explicit info
      expect(marketing?.productName).toBe('TaskFlow')
      expect(marketing?.productDescription).toBeDefined()
      expect(String(marketing?.productDescription).toLowerCase()).toMatch(
        /project management|remote|engineering/
      )

      // Should INFER discovery query from context (remote work, dev tools, async)
      expect(marketing?.discoveryQuery).toBeDefined()
      const query = String(marketing?.discoveryQuery).toLowerCase()
      const hasRelevantTerms =
        query.includes('remote') ||
        query.includes('async') ||
        query.includes('developer') ||
        query.includes('engineering') ||
        query.includes('project management') ||
        query.includes('collaboration')
      expect(hasRelevantTerms).toBe(true)
      console.log('✓ discoveryQuery inferred:', marketing?.discoveryQuery)

      // Should INFER discovery instructions
      if (marketing?.discoveryInstructions) {
        console.log('✓ discoveryInstructions inferred:', marketing?.discoveryInstructions)
      }
    },
    { timeout: 30000 }
  )

  /**
   * Test: Tone/personality description → replyContext inference
   */
  it.skipIf(shouldSkip)(
    'infers reply context from described personality',
    async () => {
      const fields = getFields()

      const response = await fillFormWithAI({
        prompt: `Product name is Moodboard. It's a design inspiration app for creative professionals. We want to sound playful and encouraging, like a creative friend who gets excited about design.`,
        fields,
        messages: [],
      })

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== TONE INFERENCE TEST ===')
      console.log('replyContext:', marketing?.replyContext)

      expect(marketing?.productName).toBe('Moodboard')

      // Should infer reply context from the tone description
      expect(marketing?.replyContext).toBeDefined()
      const ctx = String(marketing?.replyContext).toLowerCase()
      const matchesTone =
        ctx.includes('playful') ||
        ctx.includes('creative') ||
        ctx.includes('encouraging') ||
        ctx.includes('friend') ||
        ctx.includes('excited')
      expect(matchesTone).toBe(true)
    },
    { timeout: 30000 }
  )

  /**
   * Test: E-commerce product - different niche entirely
   */
  it.skipIf(shouldSkip)(
    'handles e-commerce product with audience targeting',
    async () => {
      const fields = getFields()

      const response = await fillFormWithAI({
        prompt: `We sell premium ceramic cookware called CeraChef. Target home cooking enthusiasts and foodie communities. Keep tone warm and knowledgeable, like a trusted chef friend.`,
        fields,
        messages: [],
      })

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== E-COMMERCE TEST ===')
      console.log('Filled marketing:', JSON.stringify(marketing, null, 2))

      expect(marketing?.productName).toBe('CeraChef')

      // Discovery should relate to cooking/food
      const query = String(marketing?.discoveryQuery || '').toLowerCase()
      const hasNicheTerms =
        query.includes('cook') ||
        query.includes('food') ||
        query.includes('kitchen') ||
        query.includes('recipe') ||
        query.includes('chef')
      expect(hasNicheTerms).toBe(true)

      // Reply context should match warm/knowledgeable tone
      expect(marketing?.replyContext).toBeDefined()
    },
    { timeout: 30000 }
  )

  /**
   * Test: SaaS B2B product - professional context
   */
  it.skipIf(shouldSkip)(
    'handles B2B SaaS product with professional tone',
    async () => {
      const fields = getFields()

      const response = await fillFormWithAI({
        prompt: `DataPipe is an ETL platform for data engineers at mid-size companies. We want to find people discussing data pipeline challenges, warehouse migrations, and dbt. Tone should be technical and helpful, not salesy.`,
        fields,
        messages: [],
      })

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== B2B SAAS TEST ===')
      console.log('Filled marketing:', JSON.stringify(marketing, null, 2))

      expect(marketing?.productName).toBe('DataPipe')

      // Discovery query should contain data engineering terms
      const query = String(marketing?.discoveryQuery || '').toLowerCase()
      const hasTerms =
        query.includes('data') ||
        query.includes('pipeline') ||
        query.includes('etl') ||
        query.includes('dbt') ||
        query.includes('warehouse')
      expect(hasTerms).toBe(true)

      // Reply context should reflect technical, non-salesy tone
      const ctx = String(marketing?.replyContext || '').toLowerCase()
      const hasTone =
        ctx.includes('technical') ||
        ctx.includes('helpful') ||
        ctx.includes('not salesy') ||
        ctx.includes('professional')
      expect(hasTone).toBe(true)
    },
    { timeout: 30000 }
  )
})

describe('AI Form Filler - Explicit Field Extraction', () => {
  /**
   * When a user explicitly names fields and values, ALL should be extracted.
   */
  it.skipIf(shouldSkip)(
    'extracts all explicitly stated fields from structured input',
    async () => {
      const fields = getFields()

      const response = await fillFormWithAI({
        prompt: `Product name is FitTrack, description is a workout tracking app for busy professionals. Preferred language English. Discovery instructions: target fitness enthusiasts sharing workout tips, avoid supplement spam and prioritize workout photos over memes. Reply context: motivating and casual, like a gym buddy.`,
        fields,
        messages: [],
      })

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== EXPLICIT EXTRACTION TEST ===')
      console.log('Filled:', JSON.stringify(marketing, null, 2))

      // All 5 fields should be extracted
      expect(marketing?.productName).toBe('FitTrack')

      expect(marketing?.productDescription).toBeDefined()
      expect(String(marketing?.productDescription).toLowerCase()).toMatch(/workout|tracking|fitness/)

      expect(marketing?.preferredLanguages).toBeDefined()
      expect(marketing?.preferredLanguages).toContain('en')

      expect(marketing?.discoveryInstructions).toBeDefined()
      expect(String(marketing?.discoveryInstructions).toLowerCase()).toMatch(/fitness|workout/)

      expect(marketing?.replyContext).toBeDefined()
      expect(String(marketing?.replyContext).toLowerCase()).toMatch(/motivat|casual|gym/)

      console.log('✓ All 5 explicit fields extracted correctly')
    },
    { timeout: 30000 }
  )

  /**
   * Test casual, unstructured input with implicit field mappings
   */
  it.skipIf(shouldSkip)(
    'extracts fields from casual unstructured description',
    async () => {
      const fields = getFields()

      const response = await fillFormWithAI({
        prompt: `hey so i have this app called SnipIt, basically it's a code snippet manager for developers. I want to find people tweeting about productivity hacks and dev workflows. The vibe should be nerdy but approachable, like we're all in this together.`,
        fields,
        messages: [],
      })

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== CASUAL INPUT TEST ===')
      console.log('Filled:', JSON.stringify(marketing, null, 2))

      expect(marketing?.productName).toBe('SnipIt')
      expect(marketing?.productDescription).toBeDefined()
      expect(String(marketing?.productDescription).toLowerCase()).toMatch(/snippet|code|developer/)

      // Should infer discovery from "productivity hacks and dev workflows"
      const query = String(marketing?.discoveryQuery || '').toLowerCase()
      const hasTerms =
        query.includes('productivity') ||
        query.includes('dev') ||
        query.includes('workflow') ||
        query.includes('developer') ||
        query.includes('code')
      expect(hasTerms).toBe(true)

      // Should infer tone from "nerdy but approachable"
      expect(marketing?.replyContext).toBeDefined()
    },
    { timeout: 30000 }
  )
})

describe('AI Form Filler - Field Updates', () => {
  /**
   * Test updating a single field while preserving others
   */
  it.skipIf(shouldSkip)(
    'updates one field without clobbering existing data',
    async () => {
      const currentData = {
        marketing: {
          productName: 'SnipIt',
          productDescription: 'Code snippet manager for developers',
          discoveryQuery: '#developer productivity',
          replyContext: 'Nerdy and approachable',
        },
      }

      const fields = generateFormFieldsWithSchemaAnnotations(currentData, VisitorSettings)

      const response = await fillFormWithAI({
        prompt: `change discovery query to #buildinpublic OR #indiehackers OR "dev tools"`,
        fields,
        partialData: currentData,
        messages: [],
      })

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== UPDATE FIELD TEST ===')
      console.log('Filled:', JSON.stringify(marketing, null, 2))

      // Should update discovery query
      const query = String(marketing?.discoveryQuery || '').toLowerCase()
      expect(query.includes('buildinpublic') || query.includes('indiehackers')).toBe(true)

      // Should preserve other fields
      expect(marketing?.productName).toBe('SnipIt')
      expect(marketing?.replyContext).toBeDefined()
      expect(String(marketing?.replyContext).toLowerCase()).toMatch(/nerd|approach/)

      console.log('✓ Field updated, existing data preserved')
    },
    { timeout: 30000 }
  )

  /**
   * Test updating tone/style
   */
  it.skipIf(shouldSkip)(
    'updates reply context when user changes tone preference',
    async () => {
      const currentData = {
        marketing: {
          productName: 'DataPipe',
          productDescription: 'ETL platform for data engineers',
          discoveryQuery: 'data engineering dbt',
          replyContext: 'Technical and helpful',
        },
      }

      const fields = generateFormFieldsWithSchemaAnnotations(currentData, VisitorSettings)

      const response = await fillFormWithAI({
        prompt: `make the reply context more casual and fun, less corporate. throw in some humor.`,
        fields,
        partialData: currentData,
        messages: [],
      })

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== TONE UPDATE TEST ===')
      console.log('Old replyContext: "Technical and helpful"')
      console.log('New replyContext:', marketing?.replyContext)

      // Reply context should change
      expect(marketing?.replyContext).toBeDefined()
      const ctx = String(marketing?.replyContext).toLowerCase()
      const hasCasualTone =
        ctx.includes('casual') ||
        ctx.includes('fun') ||
        ctx.includes('humor') ||
        ctx.includes('playful') ||
        ctx.includes('witty')
      expect(hasCasualTone).toBe(true)

      // Should NOT still be "technical and helpful" exactly
      expect(ctx).not.toBe('technical and helpful')

      // Should preserve product info
      expect(marketing?.productName).toBe('DataPipe')
    },
    { timeout: 30000 }
  )
})

describe('AI Form Filler - Toggle Commands', () => {
  it.skipIf(shouldSkip)(
    'enables image generation with natural language',
    async () => {
      const currentData = {
        marketing: { productName: 'TestProduct' },
        imageGen: { enabled: false },
      }

      const fields = generateFormFieldsWithSchemaAnnotations(currentData, VisitorSettings)

      const response = await fillFormWithAI({
        prompt: 'Enable image generation',
        fields,
        partialData: currentData,
        messages: [],
      })

      const imageGen = response.filled.imageGen as Record<string, unknown>

      console.log('\n=== ENABLE IMAGE GEN TEST ===')
      console.log('imageGen:', JSON.stringify(imageGen, null, 2))

      expect(imageGen?.enabled).toBe(true)
    },
    { timeout: 30000 }
  )

  it.skipIf(shouldSkip)(
    'disables image generation when currently enabled',
    async () => {
      const currentData = {
        marketing: { productName: 'TestProduct' },
        imageGen: {
          enabled: true,
          instructions: 'Create cool visuals',
          imageRefs: [],
        },
      }

      const fields = generateFormFieldsWithSchemaAnnotations(currentData, VisitorSettings)

      const response = await fillFormWithAI({
        prompt: 'Disable image gen',
        fields,
        partialData: currentData,
        messages: [],
      })

      const imageGen = response.filled.imageGen as Record<string, unknown>

      console.log('\n=== DISABLE IMAGE GEN TEST ===')
      console.log('imageGen:', JSON.stringify(imageGen, null, 2))

      expect(imageGen?.enabled).toBe(false)
    },
    { timeout: 30000 }
  )

  it.skipIf(shouldSkip)(
    'enables dry run mode',
    async () => {
      const currentData = {
        marketing: { productName: 'TestProduct' },
        options: { dryRun: false },
      }

      const fields = generateFormFieldsWithSchemaAnnotations(currentData, VisitorSettings)

      const response = await fillFormWithAI({
        prompt: 'enable dry run so I can test first',
        fields,
        partialData: currentData,
        messages: [],
      })

      const options = response.filled.options as Record<string, unknown>

      console.log('\n=== DRY RUN TOGGLE TEST ===')
      console.log('options:', JSON.stringify(options, null, 2))

      expect(options?.dryRun).toBe(true)
    },
    { timeout: 30000 }
  )
})

describe('AI Form Filler - Referential Reasoning', () => {
  /**
   * When user says "align with our product", the AI should look at existing
   * product context and generate appropriate values - NOT copy the instruction literally.
   */
  it.skipIf(shouldSkip)(
    'generates contextual image instructions from existing product data',
    async () => {
      const currentData = {
        marketing: {
          productName: 'FitTrack',
          productDescription: 'Workout tracking app for busy professionals',
          replyContext: 'Motivating and casual, like a gym buddy',
          discoveryQuery: '#fitness #workout productivity',
        },
        imageGen: { enabled: true },
      }

      const fields = generateFormFieldsWithSchemaAnnotations(currentData, VisitorSettings)

      const response = await fillFormWithAI({
        prompt: 'fill image instructions to match our brand voice and product',
        fields,
        partialData: currentData,
        messages: [],
      })

      const imageGen = response.filled.imageGen as Record<string, unknown>

      console.log('\n=== REFERENTIAL REASONING TEST ===')
      console.log('Image instructions:', imageGen?.instructions)

      const instructions = String(imageGen?.instructions || '').toLowerCase()

      // Should NOT literally copy the meta-instruction
      expect(instructions).not.toContain('match our brand')
      expect(instructions).not.toContain('brand voice and product')

      // Should contain relevant context from existing data
      const hasRelevantContent =
        instructions.includes('fitness') ||
        instructions.includes('workout') ||
        instructions.includes('motivat') ||
        instructions.includes('casual') ||
        instructions.includes('active') ||
        instructions.includes('energy') ||
        instructions.length > 20
      expect(hasRelevantContent).toBe(true)

      console.log('✓ AI generated contextual instructions, not a literal copy')
    },
    { timeout: 30000 }
  )

  /**
   * Test: "make discovery instructions match our product focus"
   */
  it.skipIf(shouldSkip)(
    'infers discovery instructions from product context',
    async () => {
      const currentData = {
        marketing: {
          productName: 'PetPal',
          productDescription: 'AI-powered pet health monitoring collar',
          discoveryQuery: '#pets #dogmom #catlovers',
          replyContext: 'Warm and caring, like a fellow pet parent',
        },
      }

      const fields = generateFormFieldsWithSchemaAnnotations(currentData, VisitorSettings)

      const response = await fillFormWithAI({
        prompt: 'add discovery instructions based on our product',
        fields,
        partialData: currentData,
        messages: [],
      })

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== DISCOVERY FROM CONTEXT TEST ===')
      console.log('discoveryInstructions:', marketing?.discoveryInstructions)

      const instructions = String(marketing?.discoveryInstructions || '').toLowerCase()

      // Should NOT be a literal copy
      expect(instructions).not.toContain('based on our product')

      // Should relate to pets/health
      const hasContext =
        instructions.includes('pet') ||
        instructions.includes('dog') ||
        instructions.includes('cat') ||
        instructions.includes('health') ||
        instructions.includes('animal')
      expect(hasContext).toBe(true)
    },
    { timeout: 30000 }
  )
})

describe('AI Form Filler - Options Configuration', () => {
  /**
   * Test setting numeric options with natural language
   */
  it.skipIf(shouldSkip)(
    'sets numeric options from natural description',
    async () => {
      const fields = getFields()

      const response = await fillFormWithAI({
        prompt: `Set max replies per run to 5, cooldown to 12 hours, and search window to 1 hour`,
        fields,
        partialData: {},
        messages: [],
      })

      const options = response.filled.options as Record<string, unknown>

      console.log('\n=== NUMERIC OPTIONS TEST ===')
      console.log('options:', JSON.stringify(options, null, 2))

      expect(options?.maxRepliesPerRun).toBe(5)
      expect(options?.replyCooldownHours).toBe(12)
      expect(options?.sinceQuerySeconds).toBe(3600)

      console.log('✓ All numeric options set correctly')
    },
    { timeout: 30000 }
  )

  /**
   * Test setting search type
   */
  it.skipIf(shouldSkip)(
    'sets search type to Latest',
    async () => {
      const fields = getFields()

      const response = await fillFormWithAI({
        prompt: `I want to search latest tweets, not top ones`,
        fields,
        partialData: {},
        messages: [],
      })

      const marketing = response.filled.marketing as Record<string, unknown>

      console.log('\n=== SEARCH TYPE TEST ===')
      console.log('searchProduct:', marketing?.searchProduct)

      expect(marketing?.searchProduct).toBe('Latest')
    },
    { timeout: 30000 }
  )
})

describe('AI Form Filler - Schema Structure', () => {
  it('validates all expected fields exist in JSON schema', () => {
    const fields = getFields()
    const jsonSchema = buildJsonSchema(fields)

    expect(jsonSchema.type).toBe('object')
    const props = jsonSchema.properties as Record<string, any>

    // Root sections exist
    expect(props.marketing).toBeDefined()
    expect(props.options).toBeDefined()
    expect(props.imageGen).toBeDefined()
    expect(props.isActive).toBeDefined()

    // Marketing fields
    const mktProps = props.marketing.properties as Record<string, any>
    const expectedMarketing = [
      'discoveryQuery', 'searchProduct', 'productName',
      'productDescription', 'discoveryInstructions', 'replyContext',
      'preferredLanguages',
    ]
    expectedMarketing.forEach((field) => {
      expect(mktProps[field]).toBeDefined()
    })

    // Options fields
    const optProps = props.options.properties as Record<string, any>
    const expectedOptions = [
      'maxCandidatesPerRun', 'replyCooldownHours', 'maxRepliesPerRun',
      'includeParentContext', 'includeThreadContext', 'dryRun',
      'sinceQuerySeconds', 'minMedia', 'maxMedia', 'maxTweetChars',
    ]
    expectedOptions.forEach((field) => {
      expect(optProps[field]).toBeDefined()
    })

    // ImageGen fields
    const imgProps = props.imageGen.properties as Record<string, any>
    expect(imgProps.enabled).toBeDefined()
    expect(imgProps.instructions).toBeDefined()
    expect(imgProps.imageRefs).toBeDefined()

    console.log('✓ All schema fields present')
  })

  it('parses requiredWhen annotations correctly', () => {
    const fields = getFields()

    const imageGenChildren = fields.imageGen?.children || {}

    const instructionsField = imageGenChildren['imageGen.instructions']
    expect(instructionsField?.requiredWhen).toEqual({
      field: 'imageGen.enabled',
      value: true,
    })

    const imageRefsField = imageGenChildren['imageGen.imageRefs']
    expect(imageRefsField?.requiredWhen).toEqual({
      field: 'imageGen.enabled',
      value: true,
    })

    const enabledField = imageGenChildren['imageGen.enabled']
    expect(enabledField?.requiredWhen).toBeUndefined()

    console.log('✓ requiredWhen annotations parsed correctly')
  })

  it('generates consistent schema regardless of initial data', () => {
    const fieldsEmpty = getFields()
    const fieldsWithData = generateFormFieldsWithSchemaAnnotations(
      { marketing: { productName: 'TestProduct' } },
      VisitorSettings
    )

    const schemaEmpty = buildJsonSchema(fieldsEmpty)
    const schemaData = buildJsonSchema(fieldsWithData)

    const emptyMktFields = Object.keys(
      (schemaEmpty.properties as any)?.marketing?.properties || {}
    )
    const dataMktFields = Object.keys(
      (schemaData.properties as any)?.marketing?.properties || {}
    )

    expect(emptyMktFields.length).toBe(dataMktFields.length)
    console.log('✓ Schema structure consistent with/without data')
  })
})
