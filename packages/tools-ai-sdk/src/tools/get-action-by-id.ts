import { tool } from 'ai'
import {
  getActionByIdSchema,
  getActionByIdDescription,
  type ChunkActionDetail,
  type GetActionByIdInput,
} from '@actionbookdev/sdk'
import { getClient, success, failure, type ToolOptions, type ToolResponse } from './utils.js'

/**
 * Get complete action details by action ID.
 *
 * @param options - Optional configuration (API key, base URL, timeout)
 * @returns Vercel AI SDK tool for getting action details
 *
 * @example
 * ```typescript
 * import { getActionById } from '@actionbookdev/tools-ai-sdk'
 * import { generateText } from 'ai'
 *
 * const { text } = await generateText({
 *   model: yourModel,
 *   prompt: 'Get details for action https://example.com/page',
 *   tools: {
 *     getActionById: getActionById(),
 *   },
 * })
 * ```
 */
export function getActionById(options?: ToolOptions) {
  return tool({
    description: getActionByIdDescription,
    parameters: getActionByIdSchema,
    execute: async (input: GetActionByIdInput): Promise<ToolResponse<ChunkActionDetail>> => {
      try {
        const client = getClient(options)
        const result = await client.getActionById(input.id)
        return success(result)
      } catch (error) {
        return failure(error)
      }
    },
  })
}
