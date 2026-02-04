import { ActionbookError, ErrorCodes } from './errors.js'
import {
  ChunkSearchResult,
  ChunkActionDetail,
  SearchType,
  SourceListResult,
  SourceSearchResult,
} from './types.js'

const DEFAULT_BASE_URL = 'https://api.actionbook.dev'

/**
 * Custom fetch function type
 */
export type FetchFunction = typeof fetch

export interface ApiClientOptions {
  apiKey?: string
  baseUrl?: string
  timeoutMs?: number
  retry?: Partial<RetryOptions>
  /**
   * Custom fetch function. Defaults to global fetch.
   * Use this to provide a custom implementation with proxy support, etc.
   *
   * @example
   * ```typescript
   * import { fetch as undiciFetch, ProxyAgent } from 'undici';
   *
   * const proxyAgent = new ProxyAgent('http://proxy:8080');
   * const client = new ApiClient({
   *   apiKey: 'xxx',
   *   fetch: (url, init) => undiciFetch(url, { ...init, dispatcher: proxyAgent }),
   * });
   * ```
   */
  fetch?: FetchFunction
}

/**
 * Parameters for searchActions API
 */
export interface SearchActionsParams {
  query: string
  domain?: string
  background?: string
  url?: string
  page?: number
  page_size?: number
}

/**
 * @deprecated Use SearchActionsParams instead
 */
export interface SearchActionsLegacyParams {
  query: string
  type?: SearchType
  limit?: number
  sourceIds?: string
  minScore?: number
}

type RetryOptions = {
  maxRetries: number
  retryDelay: number
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly timeoutMs: number
  private readonly retry: RetryOptions
  private readonly fetchFn: FetchFunction

  constructor(options: ApiClientOptions) {
    this.baseUrl = (options.baseUrl ?? process.env.ACTIONBOOK_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.apiKey = options.apiKey ?? ''
    this.timeoutMs = options.timeoutMs ?? 30000
    this.retry = {
      maxRetries: options.retry?.maxRetries ?? 3,
      retryDelay: options.retry?.retryDelay ?? 1000,
    }
    this.fetchFn = options.fetch ?? globalThis.fetch
  }

  async healthCheck(): Promise<boolean> {
    const url = new URL('/api/health', this.baseUrl)
    const res = await this.request<{ status: string }>(url.toString())
    return res?.status === 'ok' || res?.status === 'healthy'
  }

  /**
   * @deprecated Use searchActions() instead. This legacy method returns JSON.
   */
  async searchActionsLegacy(params: SearchActionsLegacyParams): Promise<ChunkSearchResult> {
    const url = new URL('/api/actions/search', this.baseUrl)
    url.searchParams.set('q', params.query)
    if (params.type) url.searchParams.set('type', params.type)
    if (params.limit) url.searchParams.set('limit', String(params.limit))
    if (params.sourceIds) url.searchParams.set('sourceIds', params.sourceIds)
    if (params.minScore !== undefined)
      url.searchParams.set('minScore', String(params.minScore))

    return this.request<ChunkSearchResult>(url.toString())
  }

  async getActionById(id: string): Promise<ChunkActionDetail> {
    const url = new URL('/api/actions', this.baseUrl)
    url.searchParams.set('id', id)
    return this.request<ChunkActionDetail>(url.toString())
  }

  async listSources(limit?: number): Promise<SourceListResult> {
    const url = new URL('/api/sources', this.baseUrl)
    if (limit) url.searchParams.set('limit', String(limit))
    return this.request<SourceListResult>(url.toString())
  }

  async searchSources(
    query: string,
    limit?: number
  ): Promise<SourceSearchResult> {
    const url = new URL('/api/sources/search', this.baseUrl)
    url.searchParams.set('q', query)
    if (limit) url.searchParams.set('limit', String(limit))
    return this.request<SourceSearchResult>(url.toString())
  }

  // ============================================
  // Text-based API methods (primary)
  // ============================================

  /**
   * Search for actions.
   * Returns plain text formatted for LLM consumption.
   */
  async searchActions(params: SearchActionsParams): Promise<string> {
    const url = new URL('/api/search_actions', this.baseUrl)
    url.searchParams.set('query', params.query)
    if (params.domain) url.searchParams.set('domain', params.domain)
    if (params.background) url.searchParams.set('background', params.background)
    if (params.url) url.searchParams.set('url', params.url)
    if (params.page) url.searchParams.set('page', String(params.page))
    if (params.page_size) url.searchParams.set('page_size', String(params.page_size))

    return this.requestText(url.toString())
  }

  /**
   * Get action details by area_id.
   * Returns plain text formatted for LLM consumption.
   */
  async getActionByAreaId(areaId: string): Promise<string> {
    const url = new URL('/api/get_action_by_area_id', this.baseUrl)
    url.searchParams.set('area_id', areaId)

    return this.requestText(url.toString())
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    for (let attempt = 0; attempt <= this.retry.maxRetries; attempt += 1) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'X-API-Key': this.apiKey,
          ...((init?.headers as Record<string, string>) ?? {}),
        }

        const response = await this.fetchFn(url, {
          method: init?.method ?? 'GET',
          headers,
          signal: controller.signal,
          ...(init?.body != null ? { body: init.body } : {}),
        })
        clearTimeout(timeout)

        if (!response.ok) {
          const body = await safeParseJson(response)
          const code =
            response.status === 404
              ? ErrorCodes.NOT_FOUND
              : response.status === 429
              ? ErrorCodes.RATE_LIMITED
              : ErrorCodes.API_ERROR
          throw new ActionbookError(
            code,
            body?.message ?? `API request failed with status ${response.status}`
          )
        }

        const data = (await response.json()) as T
        return data
      } catch (error) {
        const isAbort =
          error instanceof DOMException && error.name === 'AbortError'
        const shouldRetry =
          isAbort ||
          (error instanceof ActionbookError &&
            error.code === ErrorCodes.TIMEOUT)

        if (attempt < this.retry.maxRetries && shouldRetry) {
          await delay(this.retry.retryDelay)
          continue
        }

        if (error instanceof ActionbookError) {
          throw error
        }

        const message =
          error instanceof Error ? error.message : 'Unknown API error'
        throw new ActionbookError(ErrorCodes.API_ERROR, message)
      }
    }

    throw new ActionbookError(
      ErrorCodes.INTERNAL_ERROR,
      'Request failed after retries'
    )
  }

  /**
   * Make a request expecting text response (for new text-based APIs)
   */
  private async requestText(url: string, init?: RequestInit): Promise<string> {
    for (let attempt = 0; attempt <= this.retry.maxRetries; attempt += 1) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

        const headers: Record<string, string> = {
          Accept: 'text/plain',
          'X-API-Key': this.apiKey,
          ...((init?.headers as Record<string, string>) ?? {}),
        }

        const response = await this.fetchFn(url, {
          method: init?.method ?? 'GET',
          headers,
          signal: controller.signal,
          ...(init?.body != null ? { body: init.body } : {}),
        })
        clearTimeout(timeout)

        const text = await response.text()

        if (!response.ok) {
          const code =
            response.status === 404
              ? ErrorCodes.NOT_FOUND
              : response.status === 429
                ? ErrorCodes.RATE_LIMITED
                : ErrorCodes.API_ERROR
          throw new ActionbookError(
            code,
            text || `API request failed with status ${response.status}`
          )
        }

        return text
      } catch (error) {
        const isAbort =
          error instanceof DOMException && error.name === 'AbortError'
        const shouldRetry =
          isAbort ||
          (error instanceof ActionbookError &&
            error.code === ErrorCodes.TIMEOUT)

        if (attempt < this.retry.maxRetries && shouldRetry) {
          await delay(this.retry.retryDelay)
          continue
        }

        if (error instanceof ActionbookError) {
          throw error
        }

        const message =
          error instanceof Error ? error.message : 'Unknown API error'
        throw new ActionbookError(ErrorCodes.API_ERROR, message)
      }
    }

    throw new ActionbookError(
      ErrorCodes.INTERNAL_ERROR,
      'Request failed after retries'
    )
  }
}

async function safeParseJson(response: Response): Promise<any> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
