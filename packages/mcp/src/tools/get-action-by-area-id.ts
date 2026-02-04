import {
  defineTool,
  getActionByAreaIdSchema,
  getActionByAreaIdDescription,
  type GetActionByAreaIdInput,
} from '@actionbookdev/sdk'
import { ApiClient } from '../lib/api-client.js'

// Re-export for backwards compatibility
export { getActionByAreaIdSchema as GetActionByAreaIdInputSchema }
export type { GetActionByAreaIdInput }

export function createGetActionByAreaIdTool(
  apiClient: Pick<ApiClient, 'getActionByAreaId'>
) {
  return defineTool({
    name: 'get_action_by_area_id',
    description: getActionByAreaIdDescription,
    inputSchema: getActionByAreaIdSchema,
    handler: async (input: GetActionByAreaIdInput): Promise<string> => {
      // Use the new text-based API
      return apiClient.getActionByAreaId(input.area_id)
    },
  })
}
