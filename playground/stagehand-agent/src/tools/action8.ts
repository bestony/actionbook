import { tool } from 'ai'
import { Actionbook } from '@actionbookdev/sdk'

export function createActionbookTools(client: Actionbook) {
  return {
    searchActions: tool({
      description: client.searchActions.description,
      inputSchema: client.searchActions.params.zod,
      execute: async (input) => {
        try {
          const result = await client.searchActions(input)
          return { success: true, data: result }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      },
    }),
    getActionById: tool({
      description: client.getActionById.description,
      inputSchema: client.getActionById.params.zod,
      execute: async (input) => {
        try {
          const result = await client.getActionById(input.id)
          return { success: true, data: result }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      },
    }),
  }
}
