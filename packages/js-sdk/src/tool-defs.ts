import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { toolInputToJsonSchema } from './schema-utils.js'

/**
 * Tool params interface with both JSON Schema and Zod formats
 */
export interface ToolParams<T extends z.ZodTypeAny> {
  /** JSON Schema format for OpenAI, Anthropic, Gemini SDKs */
  json: Record<string, unknown>
  /** Zod schema for Vercel AI SDK */
  zod: T
}

/**
 * Tool definition interface for MCP and other frameworks
 */
export interface ToolDefinition<T extends z.ZodTypeAny> {
  /** Tool name (snake_case, e.g., "search_actions") */
  name: string
  /** Tool description for LLM */
  description: string
  /** Input schema (Zod) */
  inputSchema: T
  /** Tool handler function */
  handler: (input: z.infer<T>) => Promise<string>
}

/**
 * Create a tool definition
 */
export function defineTool<T extends z.ZodTypeAny>(
  definition: ToolDefinition<T>
): ToolDefinition<T> {
  return definition
}

/**
 * Create tool params from a Zod schema
 */
function createParams<T extends z.ZodTypeAny>(schema: T): ToolParams<T> {
  return {
    json: zodToJsonSchema(schema, { $refStrategy: 'none' }),
    zod: schema,
  }
}

/**
 * Create tool params with cleaned JSON Schema (for Claude/MCP compatibility)
 */
export function createCleanParams<T extends z.ZodTypeAny>(
  schema: T
): ToolParams<T> {
  return {
    json: toolInputToJsonSchema(schema) as Record<string, unknown>,
    zod: schema,
  }
}

// ============================================
// searchActions tool definition (new text API)
// ============================================

export const searchActionsSchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(200, 'Query too long')
    .describe(
      "Search keyword describing the action you want to perform (e.g., 'airbnb search', 'login button', 'google login')"
    ),
  domain: z
    .string()
    .optional()
    .describe(
      "Filter by domain name to narrow search scope (e.g., 'airbnb.com', 'google.com')"
    ),
  background: z
    .string()
    .optional()
    .describe(
      'Background context for the search - describe what you are trying to accomplish (helps improve search relevance)'
    ),
  url: z
    .string()
    .optional()
    .describe(
      'Filter by specific page URL when you know the exact page'
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page number for pagination (default: 1)'),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Number of results per page (1-100, default: 10)'),
})

export type SearchActionsInput = z.infer<typeof searchActionsSchema>

export const searchActionsDescription = `Search for website action manuals by keyword.

Use this tool to find actions, page elements, and their selectors for browser automation.

**Parameters:**
- query (required): Search keyword describing the action
- domain (optional): Filter by website domain (e.g., 'airbnb.com')
- background (optional): Context for your search - describe what you're trying to accomplish
- url (optional): Filter by specific page URL
- page (optional): Page number for pagination
- page_size (optional): Results per page (default: 10)

**Example queries:**
- "airbnb search" → find Airbnb search-related actions
- "google login" → find Google login actions
- "linkedin message" → find LinkedIn messaging actions

**Typical workflow:**
1. Search for actions: search_actions({ query: "airbnb search" })
2. Get area_id from results (e.g., "airbnb.com:/:default")
3. Get full details: get_action_by_area_id({ area_id: "airbnb.com:/:default" })
4. Use returned selectors with Playwright/browser automation

Returns area_id identifiers with descriptions and health scores.`

export const searchActionsParams = createParams(searchActionsSchema)

// ============================================
// searchActions tool definition (legacy JSON API)
// ============================================

export const searchActionsLegacySchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(200, 'Query too long')
    .describe(
      "Search keyword (e.g., 'airbnb search', 'login button', 'google login')"
    ),
  type: z
    .enum(['vector', 'fulltext', 'hybrid'])
    .optional()
    .describe('Search type: vector (semantic), fulltext (keyword), or hybrid (default)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum number of results to return (1-100, default: 5)'),
  sourceIds: z
    .string()
    .optional()
    .describe("Comma-separated source IDs to filter by (e.g., '1,2,3')"),
  minScore: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Minimum similarity score (0-1, e.g., 0.7 for high relevance only)'),
})

export type SearchActionsLegacyInput = z.infer<typeof searchActionsLegacySchema>

export const searchActionsLegacyDescription = `[LEGACY] Search for action manuals by keyword.

Use this tool to find website actions, page elements, and their selectors for browser automation.

**Example queries:**
- "airbnb search" → find Airbnb search-related actions
- "google login" → find Google login actions
- "linkedin message" → find LinkedIn messaging actions

**Typical workflow:**
1. Search for actions: searchActions("airbnb search")
2. Get action_id from results (URL-based, e.g., "https://example.com/page")
3. Get full details: getActionById("https://example.com/page")
4. Use returned selectors with Playwright/browser automation

Returns URL-based action IDs with content previews and relevance scores.`

export const searchActionsLegacyParams = createParams(searchActionsLegacySchema)

// ============================================
// getActionByAreaId tool definition (new text API)
// ============================================

export const getActionByAreaIdSchema = z.object({
  area_id: z
    .string()
    .min(1, 'Area ID cannot be empty')
    .describe(
      "Semantic area ID from search_actions results (format: 'site:path:area', e.g., 'airbnb.com:/:default')"
    ),
})

export type GetActionByAreaIdInput = z.infer<typeof getActionByAreaIdSchema>

export const getActionByAreaIdDescription = `Get complete action details by area_id, including DOM selectors and element information.

**Area ID Format:**
Area IDs use semantic format: \`site:path:area\`
- site: Domain name (e.g., 'airbnb.com')
- path: URL pathname (e.g., '/', '/s/homes')
- area: Area identifier within the page (e.g., 'search_form', 'default')

Example: \`airbnb.com:/:default\`

**What you get:**
- Full page/area content with description and functions
- Interactive elements with selectors (CSS, XPath)
- Element types and allowed methods (click, type, etc.)
- Health score indicating selector reliability

**Use returned selectors with browser automation:**
\`\`\`javascript
// Example using CSS selector from response
await page.locator('[data-testid="search-button"]').click();
\`\`\`

**Typical workflow:**
1. Search for actions: search_actions({ query: "airbnb search" })
2. Get area_id from results (e.g., "airbnb.com:/:default")
3. Get full details: get_action_by_area_id({ area_id: "airbnb.com:/:default" })
4. Extract selectors and use in browser automation`

export const getActionByAreaIdParams = createParams(getActionByAreaIdSchema)

// ============================================
// getActionById tool definition (legacy JSON API)
// ============================================

export const getActionByIdSchema = z.object({
  id: z
    .string()
    .min(1, 'Action ID cannot be empty')
    .describe(
      "Action ID - full URL (e.g., 'https://example.com/page') or partial domain (e.g., 'example.com/page', 'releases.rs')"
    ),
})

export type GetActionByIdInput = z.infer<typeof getActionByIdSchema>

export const getActionByIdDescription = `[LEGACY] Get complete action details by action ID, including DOM selectors and step-by-step instructions.

**Action ID Format:**
Action IDs support both full URLs and fuzzy matching:
- Full URL: \`https://example.com/docs/page\`
- Domain + path: \`example.com/docs/page\` (auto-matches https://example.com/docs/page)
- Domain only: \`releases.rs\` (matches https://releases.rs/)
- With chunk: \`https://example.com/page#chunk-1\`

**What you get:**
- Full action content/documentation
- Page element selectors (CSS, XPath)
- Element types and allowed methods (click, type, extract, etc.)
- Document metadata (title, URL)

**Use returned selectors with browser automation:**
\`\`\`javascript
const selector = '.search-button';
await page.locator(selector).click();
\`\`\`

**Typical workflow:**
1. Search for actions: searchActions("airbnb search")
2. Get action_id from results (e.g., "https://docs.airbnb.com/search")
3. Get full details: getActionById("docs.airbnb.com/search") // fuzzy match works!
4. Extract selectors and use in automation`

export const getActionByIdParams = createParams(getActionByIdSchema)

// ============================================
// listSources tool definition
// ============================================

export const listSourcesSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Maximum number of sources to return (1-200, default: 50)'),
})

export type ListSourcesInput = z.infer<typeof listSourcesSchema>

export const listSourcesDescription = `List all available sources (websites) in the Actionbook database.

Use this tool to:
- Discover what websites/sources are available
- Get source IDs for filtering search_actions
- View source metadata (name, URL, description, tags)

**Typical workflow:**
1. List sources: listSources()
2. Note the source ID you want to search
3. Search actions: searchActions({ query: "login", sourceIds: "1" })

Returns source IDs, names, URLs, and metadata for each source.`

export const listSourcesParams = createParams(listSourcesSchema)

// ============================================
// searchSources tool definition
// ============================================

export const searchSourcesSchema = z.object({
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(200, 'Query too long')
    .describe(
      'Search keyword to find sources (searches name, description, domain, URL, and tags)'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum number of results to return (1-100, default: 10)'),
})

export type SearchSourcesInput = z.infer<typeof searchSourcesSchema>

export const searchSourcesDescription = `Search for sources (websites) by keyword.

Use this tool to:
- Find specific websites/sources by name or domain
- Search by description or tags
- Get source IDs for filtering search_actions

**Search fields:**
- Source name
- Description
- Domain
- Base URL
- Tags

**Typical workflow:**
1. Search sources: searchSources({ query: "airbnb" })
2. Note the source ID from results
3. Search actions: searchActions({ query: "login", sourceIds: "1" })

**Example queries:**
- "airbnb" → find Airbnb source
- "linkedin" → find LinkedIn source
- "e-commerce" → find sources tagged with e-commerce

Returns matching source IDs, names, URLs, and metadata.`

export const searchSourcesParams = createParams(searchSourcesSchema)
