import { Actionbook } from '@actionbookdev/sdk'

/**
 * Tool options for configuration
 */
export interface ToolOptions {
  /** API key for authentication. Falls back to ACTIONBOOK_API_KEY env var. */
  apiKey?: string
  /** Base URL for the API (default: https://api.actionbook.dev) */
  baseUrl?: string
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number
}

/**
 * Result wrapper for tool execution
 */
export interface ToolResult<T> {
  success: true
  data: T
}

export interface ToolError {
  success: false
  error: string
}

export type ToolResponse<T> = ToolResult<T> | ToolError

/**
 * Create a tool result wrapper
 */
export function success<T>(data: T): ToolResult<T> {
  return { success: true, data }
}

/**
 * Create a tool error wrapper
 */
export function failure(error: unknown): ToolError {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }
}

// Singleton client cache
let cachedClient: Actionbook | null = null
let cachedOptions: ToolOptions = {}

/**
 * Get or create a cached Actionbook client
 */
export function getClient(options?: ToolOptions): Actionbook {
  const opts = options ?? {}

  // Check if we need to create a new client
  const needsNewClient =
    !cachedClient ||
    opts.apiKey !== cachedOptions.apiKey ||
    opts.baseUrl !== cachedOptions.baseUrl ||
    opts.timeoutMs !== cachedOptions.timeoutMs

  if (needsNewClient) {
    cachedClient = new Actionbook({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      timeoutMs: opts.timeoutMs,
    })
    cachedOptions = opts
  }

  return cachedClient!
}
