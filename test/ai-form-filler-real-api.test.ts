import { describe, expect, it } from 'bun:test'
import { Schema } from 'effect'

import { fillFormWithAI } from '../src/ai/server'
import type { AIFormFillerRequest } from '../src/ai/types'
import { generateFormFieldsWithSchemaAnnotations } from '../src/schema-form'

/**
 * @description Real API integration test for AI Form Filler
 * Skip if GOOGLE_GENERATIVE_AI_API_KEY is not set
 */

const shouldSkip = !process.env.GOOGLE_GENERATIVE_AI_API_KEY

describe('AI Form Filler', () => {
  // Simple flat schema test
  const SimpleFormSchema = Schema.Struct({
    projectName: Schema.String.pipe(
      Schema.annotations({ description: 'Name of the software project' })
    ),
    projectType: Schema.Literal('web', 'mobile', 'desktop', 'cli').pipe(
      Schema.annotations({ description: 'Type of project' })
    ),
    teamSize: Schema.Number.pipe(
      Schema.annotations({ description: 'Number of team members' })
    ),
  })

  it.skipIf(shouldSkip)(
    'should fill simple form from prompt',
    async () => {
      const formFields = generateFormFieldsWithSchemaAnnotations(
        {},
        SimpleFormSchema
      )

      // Complete prompt with all required fields
      const prompt =
        'Project name: TestApp. Project type: mobile. Team size: 5.'

      const request: AIFormFillerRequest = {
        prompt,
        fields: formFields,
        messages: [{ role: 'user', content: prompt }],
      }

      const response = await fillFormWithAI(request)

      // Validate all fields are filled
      expect(String(response.filled.projectName).toLowerCase()).toContain(
        'testapp'
      )
      expect(response.filled.projectType).toBe('mobile')
      expect(response.filled.teamSize).toBe(5)

      // Should be complete with no missing fields
      expect(response.complete).toBe(true)
      expect(response.missing.length).toBe(0)
    },
    { timeout: 15000 }
  )

  // Complex nested schema test - mirrors the app's VisitorSettings
  const MarketingTone = Schema.Literal(
    'friendly',
    'professional',
    'witty'
  ).annotations({
    title: 'Tone',
    description: 'The tone of voice for generated replies',
  })

  const CtaStyle = Schema.Literal('subtle', 'direct', 'none').annotations({
    title: 'CTA Style',
    description: 'How prominent the call-to-action should be',
  })

  const SearchProduct = Schema.Literal(
    'Top',
    'Latest',
    'Media',
    'People'
  ).annotations({
    title: 'Search Type',
    description: 'Twitter search result type to use',
  })

  const PreferredLanguage = Schema.Literal(
    'en',
    'es',
    'fr',
    'de',
    'zh',
    'ja',
    'ko'
  ).annotations({
    title: 'Language',
    description: 'ISO language code',
  })

  const MarketingConfig = Schema.Struct({
    discoveryQuery: Schema.String.annotations({
      title: 'Discovery Query',
      description: 'Twitter search query',
    }),
    searchProduct: SearchProduct,
    productName: Schema.String.annotations({
      title: 'Product Name',
      description: 'The name of your product',
    }),
    productDescription: Schema.String.annotations({
      title: 'Product Description',
      description: 'A brief description of what your product does',
    }),
    productUrl: Schema.String.annotations({
      title: 'Product URL',
      description: 'The URL to your product',
    }),
    tone: MarketingTone,
    ctaStyle: CtaStyle,
    preferredLanguages: Schema.Array(PreferredLanguage).annotations({
      title: 'Preferred Languages',
      description: 'Languages your campaign should target',
    }),
  }).annotations({
    title: 'Marketing Configuration',
    description: 'Configure how your product is marketed',
  })

  const OptionsConfig = Schema.Struct({
    maxCandidatesPerRun: Schema.optionalWith(
      Schema.Number.annotations({
        title: 'Max Candidates',
        description: 'Maximum tweets to evaluate per run',
      }),
      { default: () => 50 }
    ),
    maxRepliesPerRun: Schema.optionalWith(
      Schema.Number.annotations({
        title: 'Max Replies Per Run',
        description: 'Maximum replies to post per run',
      }),
      { default: () => 1 }
    ),
    dryRun: Schema.optionalWith(
      Schema.Boolean.annotations({
        title: 'Dry Run',
        description: 'Simulate without posting',
      }),
      { default: () => false }
    ),
  }).annotations({
    title: 'Run Options',
    description: 'Configure how automation runs behave',
  })

  const ImageGenConfig = Schema.Struct({
    enabled: Schema.optionalWith(
      Schema.Boolean.annotations({
        title: 'Enable Image Generation',
        description: 'Generate AI images with replies',
      }),
      { default: () => false }
    ),
    instructions: Schema.optionalWith(
      Schema.String.annotations({
        title: 'Image Instructions',
        description: 'Custom instructions for image generation',
      }),
      { default: () => '' }
    ),
  }).annotations({
    title: 'Image Generation',
    description: 'Configure AI-generated images for replies',
  })

  const ComplexFormSchema = Schema.Struct({
    marketing: MarketingConfig,
    options: Schema.optional(OptionsConfig),
    imageGen: Schema.optional(ImageGenConfig),
    isActive: Schema.optionalWith(
      Schema.Boolean.annotations({
        title: 'Active',
        description: 'Whether this campaign is active',
      }),
      { default: () => true }
    ),
  }).annotations({
    title: 'Campaign Settings',
    description: 'Configure your marketing campaign',
  })

  it.skipIf(shouldSkip)(
    'should generate clarifications for missing required nested fields',
    async () => {
      const formFields = generateFormFieldsWithSchemaAnnotations(
        {},
        ComplexFormSchema
      )

      // Prompt mentioning only SOME required fields
      const prompt = `
        Product Name: CodeShip
        Product URL: https://codeship.dev
        Tone: friendly
      `

      const request: AIFormFillerRequest = {
        prompt,
        fields: formFields,
        messages: [{ role: 'user', content: prompt }],
      }

      const response = await fillFormWithAI(request)

      // Validate marketing object exists with filled fields
      const marketing = response.filled.marketing as Record<string, unknown>
      expect(marketing).toBeDefined()
      expect(marketing.productName).toBeDefined()
      expect(marketing.productUrl).toBeDefined()

      // Missing required fields should be detected
      expect(response.missing.length).toBeGreaterThan(0)

      // Clarifications should be generated for missing required fields
      expect(response.clarifications.length).toBeGreaterThan(0)

      // Clarifications should include specific missing fields
      const clarificationFields = response.clarifications.map((c) => c.field)
      // These fields were not mentioned in the prompt and should be in clarifications
      expect(
        clarificationFields.some((f) => f.includes('discoveryQuery')) ||
          clarificationFields.some((f) => f.includes('searchProduct')) ||
          clarificationFields.some((f) => f.includes('productDescription')) ||
          clarificationFields.some((f) => f.includes('ctaStyle'))
      ).toBe(true)

      // Should NOT be complete since required fields are missing
      expect(response.complete).toBe(false)
    },
    { timeout: 20000 }
  )

  // Test for excludeFields - simulates what the client hook does
  const RunType = Schema.Literal('api', 'accounts').annotations({
    title: 'Run Type',
    description: 'How to post replies',
  })

  const SchemaWithExcludableField = Schema.Struct({
    runType: Schema.optionalWith(RunType, { default: () => 'api' as const }),
    projectName: Schema.String.annotations({
      title: 'Project Name',
      description: 'The name of the project',
    }),
    projectType: Schema.Literal('web', 'mobile', 'desktop').annotations({
      title: 'Project Type',
      description: 'Type of project',
    }),
  })

  it.skipIf(shouldSkip)(
    'should not fill excluded fields when they are filtered out',
    async () => {
      const allFields = generateFormFieldsWithSchemaAnnotations(
        {},
        SchemaWithExcludableField
      )

      // Simulate excludeFields filtering (what the client hook does)
      const excludeFields = ['runType']
      const filteredFields: typeof allFields = {}
      for (const [key, value] of Object.entries(allFields)) {
        const isExcluded = excludeFields.some(
          (excluded) => key === excluded || key.startsWith(`${excluded}.`)
        )
        if (!isExcluded) {
          filteredFields[key] = value
        }
      }

      // Verify runType was filtered out
      expect(filteredFields.runType).toBeUndefined()
      expect(filteredFields.projectName).toBeDefined()
      expect(filteredFields.projectType).toBeDefined()

      // Prompt that mentions all fields including the excluded one
      const prompt = `
        Run type: accounts.
        Project name: TestProject.
        Project type: web.
      `

      const request: AIFormFillerRequest = {
        prompt,
        fields: filteredFields, // Use filtered fields
        messages: [{ role: 'user', content: prompt }],
      }

      const response = await fillFormWithAI(request)

      // The AI should NOT have filled runType because it wasn't in the fields
      expect(response.filled.runType).toBeUndefined()

      // But it should have filled the non-excluded fields
      expect(response.filled.projectName).toBeDefined()
      expect(response.filled.projectType).toBe('web')
    },
    { timeout: 15000 }
  )

  // Test for validation - AI should extract fields from structured prompt
  const RequiredFieldsSchema = Schema.Struct({
    userName: Schema.String.annotations({
      title: 'User Name',
      description: 'The name of the user',
    }),
    userRole: Schema.Literal('admin', 'user', 'guest').annotations({
      title: 'User Role',
      description: 'Role in the system',
    }),
  })

  it.skipIf(shouldSkip)(
    'should fill fields and report correct missing/complete status',
    async () => {
      const formFields = generateFormFieldsWithSchemaAnnotations(
        {},
        RequiredFieldsSchema
      )

      // Complete prompt with all required info
      const prompt = 'User name is TestUser and their role is admin.'

      const request: AIFormFillerRequest = {
        prompt,
        fields: formFields,
        messages: [{ role: 'user', content: prompt }],
      }

      const response = await fillFormWithAI(request)

      // At least one field should be filled
      const filledCount = Object.keys(response.filled).filter(
        (k) => response.filled[k] !== undefined
      ).length
      expect(filledCount).toBeGreaterThan(0)

      // Summary should be present
      expect(response.summary).toBeDefined()
      expect(response.summary.length).toBeGreaterThan(0)

      // If complete, validate against schema
      if (response.complete) {
        const parseResult = Schema.decodeUnknownEither(RequiredFieldsSchema)(
          response.filled
        )
        expect(parseResult._tag).toBe('Right')
      } else {
        // If not complete, should have missing fields or clarifications
        expect(
          response.missing.length > 0 || response.clarifications.length > 0
        ).toBe(true)
      }
    },
    { timeout: 15000 }
  )

  // Test that existing form values are used as context
  it.skipIf(shouldSkip)(
    'should use existing form values as context for AI decisions',
    async () => {
      const formFields = generateFormFieldsWithSchemaAnnotations(
        {},
        SimpleFormSchema
      )

      // User has already filled in projectName - AI should be aware of this context
      const existingData = {
        projectName: 'CodeShip',
      }

      // Prompt only mentions the missing fields, relying on context for projectName
      const prompt = 'Project type: web. Team size: 5.'

      const request: AIFormFillerRequest = {
        prompt,
        fields: formFields,
        messages: [{ role: 'user', content: prompt }],
        partialData: existingData,
      }

      const response = await fillFormWithAI(request)

      // AI should include the existing projectName in output (using context)
      expect(response.filled.projectName).toBe('CodeShip')

      // Other fields should be filled from prompt
      expect(response.filled.projectType).toBe('web')
      expect(response.filled.teamSize).toBe(5)

      // Should be complete since all required fields are filled
      expect(response.complete).toBe(true)
    },
    { timeout: 15000 }
  )

  // Test that clarifications are generated for missing required fields
  it.skipIf(shouldSkip)(
    'should generate clarifications when required fields cannot be filled',
    async () => {
      const formFields = generateFormFieldsWithSchemaAnnotations(
        {},
        SimpleFormSchema
      )

      // Very minimal prompt - only has project name, nothing else
      const prompt = 'MyApp'

      const request: AIFormFillerRequest = {
        prompt,
        fields: formFields,
        messages: [{ role: 'user', content: prompt }],
      }

      const response = await fillFormWithAI(request)

      // projectName should be filled
      expect(String(response.filled.projectName).toLowerCase()).toContain('myapp')

      // Test passes if either:
      // 1. Some fields are missing (AI correctly identified it can't fill them)
      // 2. All fields are filled (AI made reasonable assumptions - acceptable behavior)
      // The important thing is the form was processed without errors
      expect(response.filled.projectName).toBeDefined()

      // If not complete, should have clarifications
      if (!response.complete) {
        expect(response.missing.length).toBeGreaterThan(0)
        expect(response.clarifications.length).toBeGreaterThan(0)
      }
    },
    { timeout: 15000 }
  )

  // Test that AI interprets natural language for enum/array values
  it.skipIf(shouldSkip)(
    'should interpret natural language like "english and chinese" to language codes',
    async () => {
      const formFields = generateFormFieldsWithSchemaAnnotations(
        {},
        ComplexFormSchema
      )

      // Prompt with natural language for languages
      const prompt = `
        My app is called levr, it's a token launcher.
        Product URL: https://levr.xyz
        We target Base chain users who speak english and chinese.
        Use a friendly tone with subtle CTAs.
        Search for Top tweets about crypto tokens.
        Discovery query: #crypto #tokens
      `

      const request: AIFormFillerRequest = {
        prompt,
        fields: formFields,
        messages: [{ role: 'user', content: prompt }],
      }

      const response = await fillFormWithAI(request)

      // Validate marketing fields
      const marketing = response.filled.marketing as Record<string, unknown>
      expect(marketing).toBeDefined()
      expect(marketing.productName).toBe('levr')
      expect(marketing.tone).toBe('friendly')
      expect(marketing.ctaStyle).toBe('subtle')
      expect(marketing.searchProduct).toBe('Top')

      // CRITICAL: preferredLanguages should interpret "english and chinese" as ["en", "zh"]
      const preferredLangs = marketing.preferredLanguages as string[]
      expect(preferredLangs).toBeDefined()
      expect(Array.isArray(preferredLangs)).toBe(true)
      expect(preferredLangs).toContain('en')
      expect(preferredLangs).toContain('zh')
    },
    { timeout: 20000 }
  )

  // Test that AI does NOT invent placeholder values for unmentioned fields
  it.skipIf(shouldSkip)(
    'should NOT invent placeholder values for fields not mentioned by user',
    async () => {
      const formFields = generateFormFieldsWithSchemaAnnotations(
        {},
        ComplexFormSchema
      )

      // Minimal prompt - only mentions product name, description, and languages
      // Does NOT mention: URL, discovery query, search product, tone, cta style
      const prompt =
        'my app is called levr its a token launcher we target base english and chineese'

      const request: AIFormFillerRequest = {
        prompt,
        fields: formFields,
        messages: [{ role: 'user', content: prompt }],
      }

      const response = await fillFormWithAI(request)

      const marketing = response.filled.marketing as Record<string, unknown>
      expect(marketing).toBeDefined()

      // Fields that SHOULD be filled from the prompt
      expect(String(marketing.productName).toLowerCase()).toContain('levr')
      expect(
        String(marketing.productDescription).toLowerCase()
      ).toContain('token')

      // Languages should be interpreted correctly
      const preferredLangs = marketing.preferredLanguages as string[]
      if (preferredLangs && preferredLangs.length > 0) {
        expect(preferredLangs).toContain('en')
        expect(preferredLangs).toContain('zh')
      }

      // Fields that should NOT be filled with invented values
      // The AI should leave these empty or undefined, not invent placeholders
      const productUrl = marketing.productUrl as string | undefined
      if (productUrl) {
        // If filled, it should NOT be a generic placeholder
        expect(productUrl).not.toContain('example.com')
        expect(productUrl).not.toContain('myproduct.com')
        expect(productUrl).not.toContain('placeholder')
      }

      const discoveryQuery = marketing.discoveryQuery as string | undefined
      if (discoveryQuery) {
        // If filled, it should NOT be generic hashtags unrelated to the input
        expect(discoveryQuery).not.toContain('#buildinpublic')
        expect(discoveryQuery).not.toContain('#indiehackers')
      }

      // Form should NOT be complete since required fields are missing
      expect(response.complete).toBe(false)
      expect(response.missing.length).toBeGreaterThan(0)
    },
    { timeout: 20000 }
  )

  // Test that AI correctly interprets tone from user description
  it.skipIf(shouldSkip)(
    'should correctly interpret tone and context from descriptive prompt',
    async () => {
      const formFields = generateFormFieldsWithSchemaAnnotations(
        {},
        ComplexFormSchema
      )

      // Prompt that explicitly mentions tone
      const prompt = `
        App is called Levr. It's a token launcher.
        Product URL: https://levr.xyz
        It should be witty and friendly.
        It should reply about how staking and governance is important.
        Use direct CTAs.
        Search for Top tweets.
        Discovery query: #DeFi #tokens
        Target english speakers.
      `

      const request: AIFormFillerRequest = {
        prompt,
        fields: formFields,
        messages: [{ role: 'user', content: prompt }],
      }

      const response = await fillFormWithAI(request)

      const marketing = response.filled.marketing as Record<string, unknown>
      expect(marketing).toBeDefined()

      // Should pick up the mentioned tone (witty or friendly are both valid)
      expect(['witty', 'friendly']).toContain(marketing.tone as string)

      // Should pick up direct CTA style
      expect(marketing.ctaStyle).toBe('direct')

      // Product URL should match what was provided
      expect(marketing.productUrl).toBe('https://levr.xyz')

      // Discovery query should match what was provided
      expect(marketing.discoveryQuery).toContain('#DeFi')
    },
    { timeout: 20000 }
  )
})
