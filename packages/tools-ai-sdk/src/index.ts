/**
 * @actionbookdev/tools-ai-sdk
 *
 * Actionbook tools for Vercel AI SDK
 *
 * @example
 * ```typescript
 * import { searchActions, getActionById } from '@actionbookdev/tools-ai-sdk'
 * import { generateText } from 'ai'
 * import { openai } from '@ai-sdk/openai'
 *
 * const { text } = await generateText({
 *   model: openai('gpt-4o'),
 *   prompt: 'Search for Airbnb login actions and get the details',
 *   tools: {
 *     searchActions: searchActions(),
 *     getActionById: getActionById(),
 *   },
 * })
 * ```
 *
 * @packageDocumentation
 */

export { searchActions, getActionById } from './tools/index.js'
export type { ToolOptions, ToolResult, ToolError, ToolResponse } from './tools/index.js'
