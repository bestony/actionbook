import { describe, expect, it, beforeAll } from 'vitest'
import { ApiClient } from '../lib/api-client.js'
import { ActionbookError } from '../lib/errors.js'

const API_URL =
  process.env.ACTIONBOOK_API_URL ||
  process.env.ACTIONBOOK_REAL_API_URL ||
  'http://localhost:3100'

let apiAvailable = false

async function tryHealth(client: ApiClient): Promise<boolean> {
  try {
    return await client.healthCheck()
  } catch {
    return false
  }
}

describe('Real API integration (skippable)', () => {
  beforeAll(async () => {
    const client = new ApiClient(API_URL, {
      retry: { maxRetries: 0 },
      timeoutMs: 3000,
    })
    apiAvailable = await tryHealth(client)
    if (!apiAvailable) {
      // Health check failed, still try real requests for debugging
      // eslint-disable-next-line no-console
      console.warn('API health check failed; attempting real calls anyway')
      apiAvailable = true
    }
  })

  it('search_actions hits real API', async () => {
    const client = new ApiClient(API_URL, {
      apiKey: process.env.ACTIONBOOK_API_KEY,
      retry: { maxRetries: 0 },
      timeoutMs: 5000,
    })
    try {
      // searchActions now returns text
      const result = await client.searchActions({
        query: 'airbnb',
        page: 1,
        page_size: 3,
      })
      // Result is now text, not JSON
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    } catch (error) {
      if (error instanceof Error && error.message.includes('fetch failed')) {
        return // treat as skip when fetch not reachable
      }
      if (error instanceof ActionbookError) {
        // Skip when API requires authentication or other API errors
        if (error.message.includes('api-key') || error.message.includes('401')) {
          return
        }
      }
      throw error
    }
  })

  it('get_action_by_id hits real API', async () => {
    const client = new ApiClient(API_URL, {
      apiKey: process.env.ACTIONBOOK_API_KEY,
      retry: { maxRetries: 0 },
      timeoutMs: 5000,
    })
    // Use getActionByAreaId with a known ID; skip if not available
    try {
      const result = await client.getActionByAreaId(
        'airbnb.com:/:default'
      )
      // Result is now text
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    } catch (error) {
      if (error instanceof Error && error.message.includes('fetch failed')) {
        return // treat as skip when fetch not reachable
      }
      if (error instanceof ActionbookError) {
        // Skip when API requires authentication, not found, or other errors
        if (
          error.message.includes('api-key') ||
          error.message.includes('401') ||
          error.code === 'NOT_FOUND'
        ) {
          return
        }
      }
      throw error
    }
  })
})
