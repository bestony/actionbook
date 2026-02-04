import { describe, expect, it, vi } from 'vitest'
import { ActionbookMcpServer } from './server.js'
import { ServerConfig } from './lib/config.js'

const baseConfig: ServerConfig = {
  apiUrl: 'http://localhost:3100',
  transport: 'stdio',
  logLevel: 'info',
  timeout: 30000,
  retry: { maxRetries: 0, retryDelay: 0 },
}

describe('ActionbookMcpServer', () => {
  const mockTextResponse = `## Overview

Found 0 actions matching your query.
- Total: 0
- Page: 1 of 1

----------

## Results
`

  it('registers tools', () => {
    const server = new ActionbookMcpServer(baseConfig, {
      apiClient: {
        searchActions: vi
          .fn()
          .mockResolvedValue({ results: [], total: 0, hasMore: false }),
        searchActions: vi.fn().mockResolvedValue(mockTextResponse),
        getActionById: vi.fn(),
        getActionByAreaId: vi.fn(),
        healthCheck: vi.fn(),
      } as any,
    })

    const tools = server.listTools()
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['search_actions', 'get_action_by_id', 'get_action_by_area_id'])
    )
  })

  it('executes tool handlers', async () => {
    const apiClient = {
      searchActions: vi
        .fn()
        .mockResolvedValue({ results: [], total: 0, hasMore: false }),
      searchActions: vi.fn().mockResolvedValue(mockTextResponse),
      getActionById: vi.fn(),
      getActionByAreaId: vi.fn(),
      healthCheck: vi.fn(),
    }
    const server = new ActionbookMcpServer(baseConfig, {
      apiClient: apiClient as any,
    })
    const output = await server.callTool('search_actions', {
      query: 'airbnb',
    })
    // Now uses text API, which returns markdown directly
    expect(output).toContain('## Overview')
    expect(apiClient.searchActions).toHaveBeenCalledWith({
      query: 'airbnb',
      domain: undefined,
      url: undefined,
      page: undefined,
      page_size: undefined,
    })
  })
})
