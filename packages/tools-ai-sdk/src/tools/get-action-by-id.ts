import { tool } from 'ai'
import {
  getActionByAreaIdSchema,
  getActionByAreaIdDescription,
  type GetActionByAreaIdInput,
} from '@actionbookdev/sdk'
import { getClient, success, failure, type ToolOptions, type ToolResponse } from './utils.js'

/**
 * Get complete action details by area ID.
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
 *   prompt: 'Get details for action airbnb.com:/:default',
 *   tools: {
 *     getActionById: getActionById(),
 *   },
 * })
 * ```
 */
export function getActionById(options?: ToolOptions) {
  return tool({
    description: getActionByAreaIdDescription,
    parameters: getActionByAreaIdSchema,
    execute: async (input: GetActionByAreaIdInput): Promise<ToolResponse<string>> => {
      try {
        const client = getClient(options)
        const result = await client.getActionByAreaId(input.area_id)
        return success(result)
      } catch (error) {
        return failure(error)
      }
    },
  })
}
