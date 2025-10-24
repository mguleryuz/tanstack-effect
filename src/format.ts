/**
 * Converts a string to a properly formatted amount string
 * Handles complex formats including commas, multiple periods, and invalid characters
 * @param input - The string to convert
 * @returns The formatted amount string, or empty string if invalid
 */
export function toAmountString(input: string): string {
  if (!input || typeof input !== 'string') return ''

  // Replace commas with periods (normalize decimal separator)
  let sanitized = input.replace(/,/g, '.')

  // Remove all characters except numbers and periods
  sanitized = sanitized.replace(/[^\d.]/g, '')

  // If empty after sanitization, return empty
  if (!sanitized) return ''

  // Handle multiple periods by keeping only the first one
  const parts = sanitized.split('.')
  if (parts.length > 2) {
    sanitized = parts[0] + '.' + parts.slice(1).join('')
  }

  // Remove leading zeros (but keep single 0 before decimal)
  if (sanitized.startsWith('0')) {
    // If it's "0.xxx" keep it
    if (sanitized[1] === '.') {
      sanitized = sanitized
    }
    // If it's "00.xxx" or "000..." remove leading zeros
    else if (sanitized.length > 1 && /^\d/.test(sanitized[1])) {
      sanitized = sanitized.replace(/^0+/, '')
      // If we removed all leading zeros, add one back
      if (!sanitized || sanitized[0] === '.') {
        sanitized = '0' + sanitized
      }
    }
  }

  return sanitized
}

/**
 * Validates if a string is a valid number format
 * @param input - The string to validate
 * @returns true if valid number format
 */
export function isValidNumberFormat(input: string): boolean {
  if (!input || input === '') return true // Allow empty
  const formatted = toAmountString(input)
  return /^\d+(\.\d+)?$/.test(formatted)
}

/**
 * Converts formatted string to a number
 * @param input - The formatted string
 * @returns The number, or NaN if invalid
 */
export function stringToNumber(input: string): number {
  const formatted = toAmountString(input)
  if (!formatted) return NaN
  const num = Number(formatted)
  return num < 0 ? NaN : num // Reject negative numbers
}
