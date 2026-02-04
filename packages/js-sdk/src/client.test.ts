import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Actionbook } from './client.js'

// Create mock function
const fetchMock = vi.fn()

// Mock global fetch
vi.stubGlobal('fetch', fetchMock)

describe('Actionbook', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  describe('constructor', () => {
    it('creates instance with API key', () => {
      const client = new Actionbook({ apiKey: 'test-key' })
      expect(client).toBeInstanceOf(Actionbook)
    })

    it('creates instance with custom options', () => {
      const client = new Actionbook({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com',
        timeoutMs: 5000,
      })
      expect(client).toBeInstanceOf(Actionbook)
    })
  })

  describe('searchActions', () => {
    const mockTextResult = `# Search Results for "airbnb"

## 1. airbnb.com:/:default
**Title:** Airbnb Search
**Description:** Search for accommodations on Airbnb

---

Page: 1/1 | Total: 1 results`

    it('searches with string query', async () => {
      const client = new Actionbook({ apiKey: 'test-key' })
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(mockTextResult, { status: 200 }))
      )

      const result = await client.searchActions('airbnb')
      expect(typeof result).toBe('string')
      expect(result).toContain('airbnb')
    })

    it('searches with options object', async () => {
      const client = new Actionbook({ apiKey: 'test-key' })
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(mockTextResult, { status: 200 }))
      )

      const result = await client.searchActions({
        query: 'airbnb',
        domain: 'airbnb.com',
        page: 1,
        page_size: 10,
      })
      expect(typeof result).toBe('string')

      const url = new URL(fetchMock.mock.calls[0][0] as string)
      expect(url.searchParams.get('query')).toBe('airbnb')
      expect(url.searchParams.get('domain')).toBe('airbnb.com')
      expect(url.searchParams.get('page')).toBe('1')
      expect(url.searchParams.get('page_size')).toBe('10')
    })

    it('has description property', () => {
      const client = new Actionbook({ apiKey: 'test-key' })
      expect(client.searchActions.description).toBeDefined()
      expect(typeof client.searchActions.description).toBe('string')
      expect(client.searchActions.description).toContain('Search')
    })

    it('has params property with json and zod', () => {
      const client = new Actionbook({ apiKey: 'test-key' })
      expect(client.searchActions.params).toBeDefined()
      expect(client.searchActions.params.json).toBeDefined()
      expect(client.searchActions.params.zod).toBeDefined()
    })

    it('params.json has correct schema structure', () => {
      const client = new Actionbook({ apiKey: 'test-key' })
      const jsonSchema = client.searchActions.params.json as any
      expect(jsonSchema.type).toBe('object')
      expect(jsonSchema.properties).toHaveProperty('query')
      expect(jsonSchema.required).toContain('query')
    })
  })

  describe('getActionByAreaId', () => {
    const mockTextDetail = `# Airbnb Search

**Area ID:** airbnb.com:/:default
**URL:** https://airbnb.com

## Description
Search for accommodations on Airbnb.

## Elements
- search_button: .search-btn (Search button)`

    it('gets action by area_id string', async () => {
      const client = new Actionbook({ apiKey: 'test-key' })
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(mockTextDetail, { status: 200 }))
      )

      const result = await client.getActionByAreaId('airbnb.com:/:default')
      expect(typeof result).toBe('string')
      expect(result).toContain('Airbnb Search')
    })

    it('gets action with options object', async () => {
      const client = new Actionbook({ apiKey: 'test-key' })
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(mockTextDetail, { status: 200 }))
      )

      const result = await client.getActionByAreaId({ area_id: 'airbnb.com:/:default' })
      expect(typeof result).toBe('string')
      expect(result).toContain('Airbnb')
    })

    it('has description property', () => {
      const client = new Actionbook({ apiKey: 'test-key' })
      expect(client.getActionByAreaId.description).toBeDefined()
      expect(typeof client.getActionByAreaId.description).toBe('string')
      expect(client.getActionByAreaId.description).toContain('action')
    })

    it('has params property with json and zod', () => {
      const client = new Actionbook({ apiKey: 'test-key' })
      expect(client.getActionByAreaId.params).toBeDefined()
      expect(client.getActionByAreaId.params.json).toBeDefined()
      expect(client.getActionByAreaId.params.zod).toBeDefined()
    })

    it('params.json has correct schema structure', () => {
      const client = new Actionbook({ apiKey: 'test-key' })
      const jsonSchema = client.getActionByAreaId.params.json as any
      expect(jsonSchema.type).toBe('object')
      expect(jsonSchema.properties).toHaveProperty('area_id')
      expect(jsonSchema.required).toContain('area_id')
    })
  })

  describe('tool definitions for LLM integration', () => {
    it('can be used with OpenAI SDK format', () => {
      const client = new Actionbook({ apiKey: 'test-key' })

      // OpenAI tool format
      const tool = {
        type: 'function' as const,
        function: {
          name: 'searchActions',
          description: client.searchActions.description,
          parameters: client.searchActions.params.json,
        },
      }

      expect(tool.function.name).toBe('searchActions')
      expect(tool.function.description).toBeDefined()
      expect(tool.function.parameters).toBeDefined()
    })

    it('can be used with Anthropic SDK format', () => {
      const client = new Actionbook({ apiKey: 'test-key' })

      // Anthropic tool format
      const tool = {
        name: 'getActionByAreaId',
        description: client.getActionByAreaId.description,
        input_schema: client.getActionByAreaId.params.json,
      }

      expect(tool.name).toBe('getActionByAreaId')
      expect(tool.description).toBeDefined()
      expect(tool.input_schema).toBeDefined()
    })
  })
})
