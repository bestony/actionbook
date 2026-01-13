/**
 * Action ID utilities for converting between URL-based IDs and database references.
 *
 * Format:
 * - chunk_index = 0: document URL (e.g., "https://example.com/page")
 * - chunk_index > 0: document URL + fragment (e.g., "https://example.com/page#chunk-1")
 */

export interface ParsedActionId {
  documentUrl: string
  chunkIndex: number
}

/**
 * Generate a URL-based action ID from document URL and chunk index
 */
export function generateActionId(
  documentUrl: string,
  chunkIndex: number
): string {
  if (chunkIndex === 0) {
    return documentUrl
  }
  return `${documentUrl}#chunk-${chunkIndex}`
}

/**
 * Parse a URL-based action ID into document URL and chunk index
 *
 * Examples:
 * - "https://example.com/page" => { documentUrl: "https://example.com/page", chunkIndex: 0 }
 * - "https://example.com/page#chunk-1" => { documentUrl: "https://example.com/page", chunkIndex: 1 }
 * - "https://example.com/page#section" => { documentUrl: "https://example.com/page#section", chunkIndex: 0 }
 */
export function parseActionId(actionId: string): ParsedActionId {
  // Check for #chunk-N pattern at the end
  const chunkMatch = actionId.match(/#chunk-(\d+)$/)

  if (chunkMatch) {
    const chunkIndex = parseInt(chunkMatch[1], 10)
    const documentUrl = actionId.slice(0, -chunkMatch[0].length)
    return { documentUrl, chunkIndex }
  }

  // No chunk fragment - treat entire string as document URL, chunk index 0
  return { documentUrl: actionId, chunkIndex: 0 }
}

/**
 * Validate that a string looks like a valid action ID (URL-based or domain-like)
 * Supports fuzzy matching - accepts domains without protocol
 */
export function isValidActionId(actionId: string): boolean {
  if (!actionId || actionId.trim() === '') {
    return false
  }

  const { documentUrl } = parseActionId(actionId)

  // First try as a full URL
  try {
    new URL(documentUrl)
    return true
  } catch {
    // Not a full URL, check if it looks like a domain
  }

  // Check if it looks like a domain (e.g., "releases.rs", "example.com/path")
  // Must have at least one dot and valid domain characters
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+/
  const normalized = documentUrl.replace(/^https?:\/\//, '')
  return domainPattern.test(normalized)
}

/**
 * Generate candidate URLs from a partial action ID input
 * Used for fuzzy matching - adds protocol and www variations
 */
export function normalizeActionId(input: string): string[] {
  const candidates: string[] = []

  // Always include original input first
  candidates.push(input)

  // If already has protocol, don't add more variations
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return candidates
  }

  // Add https:// variations
  candidates.push(`https://${input}`)
  candidates.push(`https://${input}/`)

  // Add www. variations (only if not already starting with www.)
  if (!input.startsWith('www.')) {
    candidates.push(`https://www.${input}`)
    candidates.push(`https://www.${input}/`)
  }

  return candidates
}

/**
 * Calculate URL similarity score (0-1)
 * Higher score = better match
 *
 * Algorithm:
 * - Exact match (ignoring protocol and trailing slash) = 1
 * - Partial match (input contained in URL) = input.length / url.length
 * - No match = 0
 */
export function urlSimilarity(input: string, url: string): number {
  // Normalize: remove protocol and trailing slash
  const normalizedInput = input
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase()
  const normalizedUrl = url
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase()

  // Exact match = highest score
  if (normalizedInput === normalizedUrl) {
    return 1
  }

  // Partial match: input is contained in URL
  if (normalizedUrl.includes(normalizedInput)) {
    return normalizedInput.length / normalizedUrl.length
  }

  return 0
}
