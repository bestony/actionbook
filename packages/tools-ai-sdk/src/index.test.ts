import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchActions, getActionById } from './index.js'

// Mock @actionbookdev/sdk
vi.mock('@actionbookdev/sdk', () => {
  const mockSearchActions = vi.fn()
  const mockGetActionById = vi.fn()

  return {
    Actionbook: vi.fn().mockImplementation(() => ({
      searchActions: mockSearchActions,
      getActionById: mockGetActionById,
    })),
    searchActionsSchema: { _def: { typeName: 'ZodObject' } },
    searchActionsDescription: 'Search for action manuals by keyword.',
    getActionByIdSchema: { _def: { typeName: 'ZodObject' } },
    getActionByIdDescription: 'Get complete action details by action ID.',
    __mocks: { mockSearchActions, mockGetActionById },
  }
})

const getMocks = async () => {
  const sdk = await import('@actionbookdev/sdk')
  return (sdk as any).__mocks as {
    mockSearchActions: ReturnType<typeof vi.fn>
    mockGetActionById: ReturnType<typeof vi.fn>
  }
}

describe('@actionbookdev/tools-ai-sdk', () => {
  beforeEach(async () => {
    const { mockSearchActions, mockGetActionById } = await getMocks()
    mockSearchActions.mockReset()
    mockGetActionById.mockReset()
  })

  it('exports searchActions tool', () => {
    const tool = searchActions()
    expect(tool).toBeDefined()
    expect(tool.description).toBe('Search for action manuals by keyword.')
    expect(tool.execute).toBeDefined()
  })

  it('exports getActionById tool', () => {
    const tool = getActionById()
    expect(tool).toBeDefined()
    expect(tool.description).toBe('Get complete action details by action ID.')
    expect(tool.execute).toBeDefined()
  })

  it('searchActions returns success response', async () => {
    const { mockSearchActions } = await getMocks()
    mockSearchActions.mockResolvedValue({ results: [] })

    const tool = searchActions()
    const result = await tool.execute!({ query: 'test' }, { toolCallId: 'test', messages: [] })

    expect(result).toEqual({ success: true, data: { results: [] } })
  })

  it('searchActions returns error response on failure', async () => {
    const { mockSearchActions } = await getMocks()
    mockSearchActions.mockRejectedValue(new Error('API error'))

    const tool = searchActions()
    const result = await tool.execute!({ query: 'test' }, { toolCallId: 'test', messages: [] })

    expect(result).toEqual({ success: false, error: 'API error' })
  })

  it('getActionById returns success response', async () => {
    const { mockGetActionById } = await getMocks()
    mockGetActionById.mockResolvedValue({ action_id: 123 })

    const tool = getActionById()
    const result = await tool.execute!({ id: '123' }, { toolCallId: 'test', messages: [] })

    expect(result).toEqual({ success: true, data: { action_id: 123 } })
  })

  it('getActionById returns error response on failure', async () => {
    const { mockGetActionById } = await getMocks()
    mockGetActionById.mockRejectedValue(new Error('Not found'))

    const tool = getActionById()
    const result = await tool.execute!({ id: '123' }, { toolCallId: 'test', messages: [] })

    expect(result).toEqual({ success: false, error: 'Not found' })
  })

  it('tools accept custom options', () => {
    const tool1 = searchActions({ apiKey: 'key', timeoutMs: 5000 })
    const tool2 = getActionById({ apiKey: 'key', timeoutMs: 5000 })

    expect(tool1).toBeDefined()
    expect(tool2).toBeDefined()
  })
})
