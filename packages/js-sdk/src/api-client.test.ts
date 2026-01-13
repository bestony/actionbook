import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './api-client.js'
import { ActionbookError, ErrorCodes } from './errors.js'

const API_URL = 'http://localhost:3100'

// Create mock function
const fetchMock = vi.fn()

// Mock global fetch
vi.stubGlobal('fetch', fetchMock)

describe('ApiClient', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  describe('constructor', () => {
    it('uses default base URL when not provided', () => {
      const client = new ApiClient({ apiKey: 'test-key' })
      // We can't directly access private baseUrl, but we can verify it works
      expect(client).toBeInstanceOf(ApiClient)
    })

    it('uses custom base URL when provided', () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com',
      })
      expect(client).toBeInstanceOf(ApiClient)
    })

    it('strips trailing slash from base URL', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com/',
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      )

      await client.healthCheck()
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toBe('https://custom.api.com/api/health')
    })
  })

  describe('searchActions', () => {
    it('calls search endpoint with query params', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            query: 'company',
            results: [],
            count: 0,
            total: 0,
            hasMore: false,
          }),
          { status: 200 }
        )
      )

      await client.searchActions({
        query: 'company',
        type: 'hybrid',
        limit: 10,
      })
      const url = new URL(fetchMock.mock.calls[0][0] as string)
      expect(url.pathname).toBe('/api/actions/search')
      expect(url.searchParams.get('q')).toBe('company')
      expect(url.searchParams.get('type')).toBe('hybrid')
      expect(url.searchParams.get('limit')).toBe('10')
    })

    it('includes optional sourceIds parameter', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            query: 'test',
            results: [],
            count: 0,
            total: 0,
            hasMore: false,
          }),
          { status: 200 }
        )
      )

      await client.searchActions({ query: 'test', sourceIds: '1,2,3' })
      const url = new URL(fetchMock.mock.calls[0][0] as string)
      expect(url.searchParams.get('sourceIds')).toBe('1,2,3')
    })

    it('includes minScore parameter', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            query: 'test',
            results: [],
            count: 0,
            total: 0,
            hasMore: false,
          }),
          { status: 200 }
        )
      )

      await client.searchActions({ query: 'test', minScore: 0.7 })
      const url = new URL(fetchMock.mock.calls[0][0] as string)
      expect(url.searchParams.get('minScore')).toBe('0.7')
    })
  })

  describe('getActionById', () => {
    it('gets action by URL-based id', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      const testActionId = 'https://example.com/page'
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            action_id: testActionId,
            content: 'Test content',
            elements: null,
            createdAt: '2025-12-05T00:00:00.000Z',
            documentId: 1,
            documentTitle: 'Test Doc',
            documentUrl: 'https://example.com/page',
            chunkIndex: 0,
            heading: 'Test',
            tokenCount: 100,
          }),
          { status: 200 }
        )
      )

      const result = await client.getActionById(testActionId)
      expect(result.action_id).toBe(testActionId)
      expect(result.content).toBe('Test content')

      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toBe(`${API_URL}/api/actions?id=${encodeURIComponent(testActionId)}`)
    })

    it('supports fuzzy matching with domain-only input', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      const inputId = 'releases.rs'
      const matchedUrl = 'https://releases.rs/'
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            action_id: matchedUrl,
            content: 'Releases content',
            elements: null,
            createdAt: '2025-12-05T00:00:00.000Z',
            documentId: 1,
            documentTitle: 'Releases',
            documentUrl: matchedUrl,
            chunkIndex: 0,
            heading: 'Releases',
            tokenCount: 100,
          }),
          { status: 200 }
        )
      )

      const result = await client.getActionById(inputId)
      expect(result.action_id).toBe(matchedUrl)

      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toBe(`${API_URL}/api/actions?id=${encodeURIComponent(inputId)}`)
    })
  })

  describe('error handling', () => {
    it('throws ActionbookError with NOT_FOUND code on 404', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
      )

      const nonExistentUrl = 'https://non-existent-domain.test/page'
      await expect(client.getActionById(nonExistentUrl)).rejects.toBeInstanceOf(
        ActionbookError
      )
      try {
        await client.getActionById(nonExistentUrl)
      } catch (error) {
        if (error instanceof ActionbookError) {
          expect(error.code).toBe(ErrorCodes.NOT_FOUND)
        }
      }
    })

    it('throws ActionbookError with RATE_LIMITED code on 429', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ message: 'rate limited' }), {
          status: 429,
        })
      )

      try {
        await client.searchActions({ query: 'test' })
      } catch (error) {
        expect(error).toBeInstanceOf(ActionbookError)
        if (error instanceof ActionbookError) {
          expect(error.code).toBe(ErrorCodes.RATE_LIMITED)
        }
      }
    })

    it('throws ActionbookError with API_ERROR code on other errors', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ message: 'server error' }), {
          status: 500,
        })
      )

      try {
        await client.searchActions({ query: 'test' })
      } catch (error) {
        expect(error).toBeInstanceOf(ActionbookError)
        if (error instanceof ActionbookError) {
          expect(error.code).toBe(ErrorCodes.API_ERROR)
        }
      }
    })
  })

  describe('headers', () => {
    it('includes API key in X-API-Key header', async () => {
      const client = new ApiClient({
        apiKey: 'my-secret-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      )

      await client.healthCheck()
      const options = fetchMock.mock.calls[0][1] as RequestInit
      expect(options.headers).toHaveProperty('X-API-Key', 'my-secret-key')
    })

    it('includes content-type header', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      )

      await client.healthCheck()
      const options = fetchMock.mock.calls[0][1] as RequestInit
      expect(options.headers).toHaveProperty('content-type', 'application/json')
    })
  })

  describe('listSources', () => {
    it('calls sources endpoint', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            results: [],
            count: 0,
          }),
          { status: 200 }
        )
      )

      await client.listSources()
      const url = new URL(fetchMock.mock.calls[0][0] as string)
      expect(url.pathname).toBe('/api/sources')
    })

    it('includes limit parameter when provided', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            results: [],
            count: 0,
          }),
          { status: 200 }
        )
      )

      await client.listSources(50)
      const url = new URL(fetchMock.mock.calls[0][0] as string)
      expect(url.searchParams.get('limit')).toBe('50')
    })
  })

  describe('searchSources', () => {
    it('calls sources search endpoint', async () => {
      const client = new ApiClient({
        apiKey: 'test-key',
        baseUrl: API_URL,
        retry: { maxRetries: 0 },
      })
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            query: 'airbnb',
            results: [],
            count: 0,
          }),
          { status: 200 }
        )
      )

      await client.searchSources('airbnb')
      const url = new URL(fetchMock.mock.calls[0][0] as string)
      expect(url.pathname).toBe('/api/sources/search')
      expect(url.searchParams.get('q')).toBe('airbnb')
    })
  })
})
