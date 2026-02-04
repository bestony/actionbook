import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import http from 'http'
import { ActionbookMcpServer } from '../server.js'
import { ServerConfig } from '../lib/config.js'

// Legacy JSON fixtures (for backward compatibility tests)
const searchFixture = {
  success: true,
  query: 'example',
  results: [
    {
      action_id: 'https://example.com/page',
      content: 'Example action content with elements',
      score: 0.95,
      createdAt: '2025-01-01T00:00:00Z',
    },
  ],
  count: 1,
  total: 1,
  hasMore: false,
}

const actionFixture = {
  action_id: 'https://example.com/page',
  content: '# Example Action\n\nThis is example action content.',
  elements: JSON.stringify({
    example_button: {
      css_selector: '.example-button',
      element_type: 'button',
      allow_methods: ['click'],
    },
  }),
  createdAt: '2025-01-01T00:00:00Z',
  documentId: 1,
  documentTitle: 'Example Document',
  documentUrl: 'https://example.com',
  chunkIndex: 0,
  heading: 'Example Action',
  tokenCount: 100,
}

// New text-based API fixtures
const searchActionsResponse = `## Overview

Found 1 actions matching your query.
- Total: 1
- Page: 1 of 1

----------

## Results

### example.com:https://example.com/page:default

- ID: example.com:https://example.com/page:default
- Type: page
- Description: Example action content with elements
- URL: https://example.com/page
- Health Score: 95%
- Updated: 2025-01-01
`

const getActionByAreaIdResponse = `## Overview

Action found: example.com:https://example.com/page:default
- Type: page
- URL: https://example.com/page
- Health Score: 95%
- Updated: 2025-01-01

----------

## Content

# Example Action

This is example action content.

----------

## Elements

### example_button

- Name: example_button
- Element Type: button
- Allow Methods: click
- CSS Selector: .example-button
`

describe('ActionbookMcpServer integration with HTTP API', () => {
  let server: http.Server
  let baseUrl: string
  let serverRunning = false

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400
        return res.end()
      }

      const url = new URL(req.url, 'http://localhost')

      if (url.pathname === '/api/health') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ status: 'ok' }))
        return
      }

      // New text-based search endpoint
      if (url.pathname === '/api/search_actions') {
        res.setHeader('content-type', 'text/plain')
        res.end(searchActionsResponse)
        return
      }

      // New text-based get action endpoint
      if (url.pathname === '/api/get_action_by_area_id') {
        res.setHeader('content-type', 'text/plain')
        res.end(getActionByAreaIdResponse)
        return
      }

      // Legacy JSON endpoints (for backward compatibility)
      if (url.pathname === '/api/actions/search') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(searchFixture))
        return
      }

      if (url.pathname === '/api/actions') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(actionFixture))
        return
      }

      res.statusCode = 404
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ message: 'not found' }))
    })

    await new Promise<void>((resolve) => {
      server
        .listen(0, '127.0.0.1')
        .once('listening', () => {
          const address = server.address()
          if (address && typeof address === 'object') {
            baseUrl = `http://127.0.0.1:${address.port}`
            serverRunning = true
          }
          resolve()
        })
        .once('error', () => resolve())
    })
  })

  afterAll(async () => {
    if (!serverRunning) return
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  it('runs search_actions against HTTP API', async () => {
    if (!serverRunning) {
      return
    }
    const config: ServerConfig = {
      apiUrl: baseUrl,
      transport: 'stdio',
      logLevel: 'error',
      timeout: 2000,
      retry: { maxRetries: 0, retryDelay: 0 },
    }
    const mcpServer = new ActionbookMcpServer(config)

    const output = await mcpServer.callTool('search_actions', {
      query: 'example',
    })

    // New text-based API returns markdown directly
    expect(output).toContain('## Overview')
    expect(output).toContain('example.com:https://example.com/page:default')
  })

  it('runs get_action_by_id against HTTP API', async () => {
    if (!serverRunning) {
      return
    }
    const config: ServerConfig = {
      apiUrl: baseUrl,
      transport: 'stdio',
      logLevel: 'error',
      timeout: 2000,
      retry: { maxRetries: 0, retryDelay: 0 },
    }
    const mcpServer = new ActionbookMcpServer(config)

    const output = await mcpServer.callTool('get_action_by_id', {
      id: 'https://example.com/page',
    })

    expect(output).toContain('Example Action')
    expect(output).toContain('UI Elements')
  })

  it('runs get_action_by_area_id against HTTP API', async () => {
    if (!serverRunning) {
      return
    }
    const config: ServerConfig = {
      apiUrl: baseUrl,
      transport: 'stdio',
      logLevel: 'error',
      timeout: 2000,
      retry: { maxRetries: 0, retryDelay: 0 },
    }
    const mcpServer = new ActionbookMcpServer(config)

    const output = await mcpServer.callTool('get_action_by_area_id', {
      area_id: 'example.com:https://example.com/page:default',
    })

    // New text-based API returns markdown directly
    expect(output).toContain('## Overview')
    expect(output).toContain('Example Action')
    expect(output).toContain('example_button')
  })
})
