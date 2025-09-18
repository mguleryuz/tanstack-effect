/**
 * @description Custom error class that preserves all Effect error properties
 * while still being a proper JavaScript Error for React Query
 */
export class EffectHttpError extends Error {
  readonly _tag: string
  readonly status?: number
  readonly error?: any
  readonly response?: Response
  readonly request?: Request
  readonly validationErrors?: any

  constructor(effectError: any) {
    // Extract the user-friendly message
    const message =
      effectError?.error?.message ||
      effectError?.message ||
      'An unexpected error occurred'
    super(message)

    // Preserve the error name
    this.name = 'EffectHttpError'

    // Copy all properties from the original error
    Object.assign(this, effectError)

    // Ensure specific properties are preserved
    this._tag = effectError._tag || 'UnknownError'
    this.status = effectError.status
    this.error = effectError.error
    this.response = effectError.response
    this.request = effectError.request

    // Enhanced validation error handling
    if (effectError?.error?.issues) {
      this.validationErrors = effectError.error.issues
      console.group('🔍 Effect Validation Error Details')
      console.error('Full Error Object:', effectError)
      console.error('Validation Issues:', effectError.error.issues)
      console.groupEnd()
    } else if (effectError?._tag === 'ResponseError') {
      console.group('🔍 Effect Response Error Details')
      console.error('Full Error Object:', effectError)
      console.error('Response Status:', effectError.status)
      console.error('Response Body:', effectError.error)
      console.groupEnd()
    } else {
      console.group('🔍 Effect Error Details')
      console.error('Full Error Object:', effectError)
      console.error('Error Tag:', effectError._tag)
      console.error('Error Message:', message)
      console.groupEnd()
    }

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, EffectHttpError.prototype)
  }
}
