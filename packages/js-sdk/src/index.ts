// Main client export
export { Actionbook } from './client.js'
export type {
  ActionbookOptions,
  ToolMethod,
  SearchActionsMethod,
  GetActionByAreaIdMethod,
  ListSourcesMethod,
  SearchSourcesMethod,
} from './client.js'

// API client (for advanced usage)
export { ApiClient } from './api-client.js'
export type {
  ApiClientOptions,
  FetchFunction,
  SearchActionsParams,
  SearchActionsLegacyParams,
} from './api-client.js'

// Types
export type {
  SearchType,
  ChunkSearchResult,
  ChunkActionDetail,
  ParsedElements,
  SourceItem,
  SourceListResult,
  SourceSearchResult,
} from './types.js'

// Errors
export { ActionbookError, ErrorCodes, isActionbookError } from './errors.js'
export type { ActionbookErrorCode } from './errors.js'

// Formatter utilities
export {
  formatSearchResults,
  formatActionDetail,
  formatErrorMessage,
  truncateContent,
  formatDate,
} from './formatter.js'

// Schema utilities
export { toolInputToJsonSchema } from './schema-utils.js'

// Tool definitions (for advanced usage)
export {
  // Tool definition utilities
  defineTool,
  createCleanParams,
  // searchActions (new text API)
  searchActionsSchema,
  searchActionsDescription,
  searchActionsParams,
  // searchActions (legacy JSON API)
  searchActionsLegacySchema,
  searchActionsLegacyDescription,
  searchActionsLegacyParams,
  // getActionByAreaId (new text API)
  getActionByAreaIdSchema,
  getActionByAreaIdDescription,
  getActionByAreaIdParams,
  // getActionById (legacy JSON API)
  getActionByIdSchema,
  getActionByIdDescription,
  getActionByIdParams,
  // listSources
  listSourcesSchema,
  listSourcesDescription,
  listSourcesParams,
  // searchSources
  searchSourcesSchema,
  searchSourcesDescription,
  searchSourcesParams,
} from './tool-defs.js'
export type {
  SearchActionsInput,
  SearchActionsLegacyInput,
  GetActionByAreaIdInput,
  GetActionByIdInput,
  ListSourcesInput,
  SearchSourcesInput,
  ToolParams,
  ToolDefinition,
} from './tool-defs.js'
