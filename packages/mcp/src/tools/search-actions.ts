import {
  defineTool,
  searchActionsSchema,
  searchActionsDescription,
  type SearchActionsInput,
} from '@actionbookdev/sdk'
import { ApiClient } from '../lib/api-client.js'

// Re-export for backwards compatibility
export { searchActionsSchema as SearchActionsInputSchema }
export type { SearchActionsInput }

export function createSearchActionsTool(
  apiClient: Pick<ApiClient, 'searchActions'>
) {
  return defineTool({
    name: 'search_actions',
    description: searchActionsDescription,
    inputSchema: searchActionsSchema,
    handler: async (input: SearchActionsInput): Promise<string> => {
      // Use the new text-based API
      return apiClient.searchActions({
        query: input.query,
        domain: input.domain,
        url: input.url,
        page: input.page,
        page_size: input.page_size,
      })
    },
  })
}
