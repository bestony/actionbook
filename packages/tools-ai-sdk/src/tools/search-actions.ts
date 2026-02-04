import { tool } from 'ai'
import {
  searchActionsSchema,
  searchActionsDescription,
  type SearchActionsInput,
} from '@actionbookdev/sdk'
import { getClient, success, failure, type ToolOptions, type ToolResponse } from './utils.js'

/**
 * Search for action manuals by keyword.
 *
 * @param options - Optional configuration (API key, base URL, timeout)
 * @returns Vercel AI SDK tool for searching actions
 *
 * @example
 * ```typescript
 * import { searchActions } from '@actionbookdev/tools-ai-sdk'
 * import { generateText } from 'ai'
 *
 * const { text } = await generateText({
 *   model: yourModel,
 *   prompt: 'Search for Airbnb login actions',
 *   tools: {
 *     searchActions: searchActions(),
 *   },
 * })
 * ```
 */
export function searchActions(options?: ToolOptions) {
  return tool({
    description: searchActionsDescription,
    parameters: searchActionsSchema,
    execute: async (input: SearchActionsInput): Promise<ToolResponse<string>> => {
      try {
        const client = getClient(options)
        const result = await client.searchActions(input)
        return success(result)
      } catch (error) {
        return failure(error)
      }
    },
  })
}
