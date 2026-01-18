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
  const FormSchema = Schema.Struct({
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
    'should fill form and generate clarifications for missing fields',
    async () => {
      const formFields = generateFormFieldsWithSchemaAnnotations({}, FormSchema)

      // Step 1: Incomplete prompt - missing teamSize
      const initialPrompt = 'Project name: TestApp. Project type: mobile.'

      const request: AIFormFillerRequest = {
        prompt: initialPrompt,
        fields: formFields,
        messages: [{ role: 'user', content: initialPrompt }],
      }

      const response = await fillFormWithAI(request)

      // Validate partial extraction
      expect(String(response.filled.projectName).toLowerCase()).toContain(
        'testapp'
      )
      expect(response.filled.projectType).toBe('mobile')

      // Should have missing fields and clarifications
      expect(response.missing.length).toBeGreaterThan(0)
      expect(response.clarifications.length).toBeGreaterThan(0)
      expect(response.complete).toBe(false)

      // Step 2: Follow-up with missing info
      const followUpPrompt = 'Team size: 5.'

      const followUpRequest: AIFormFillerRequest = {
        prompt: followUpPrompt,
        fields: formFields,
        messages: [
          { role: 'user', content: initialPrompt },
          { role: 'user', content: followUpPrompt },
        ],
        partialData: response.filled,
      }

      const followUpResponse = await fillFormWithAI(followUpRequest)

      // Should now have teamSize filled
      expect(followUpResponse.filled.teamSize).toBe(5)
    },
    { timeout: 15000 }
  )
})
