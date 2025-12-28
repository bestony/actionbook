import { tool } from 'ai'
import { z } from 'zod'
import { Stagehand } from '@browserbasehq/stagehand'

/**
 * Create Stagehand browser automation tools
 */
export function createStagehandTools(stagehand: Stagehand) {
  return {
    /**
     * Navigate to a URL
     */
    goto: tool({
      description: 'Navigate to a specific URL in the browser',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to navigate to'),
        waitUntil: z
          .enum(['load', 'domcontentloaded', 'networkidle'])
          .optional()
          .describe('When to consider navigation succeeded'),
      }),
      execute: async ({ url, waitUntil }) => {
        try {
          const page = stagehand.context.pages()[0]
          await page.goto(url, { waitUntil: waitUntil || 'load' })

          const currentUrl = page.url()
          const title = await page.title()

          return {
            success: true,
            url: currentUrl,
            title,
            message: `Successfully navigated to ${currentUrl}`,
          }
        } catch (error) {
          return {
            success: false,
            url,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      },
    }),

    /**
     * Get page info (URL and title)
     */
    pageInfo: tool({
      description:
        'Get information about the current browser page (URL and title)',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const page = stagehand.context.pages()[0]
          const url = page.url()
          const title = await page.title()

          return { success: true, url, title }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      },
    }),

    /**
     * Take a screenshot
     */
    screenshot: tool({
      description: 'Take a screenshot of the current browser page',
      inputSchema: z.object({
        fullPage: z
          .boolean()
          .optional()
          .describe('Whether to take a full page screenshot'),
      }),
      execute: async ({ fullPage }) => {
        try {
          const page = stagehand.context.pages()[0]
          const buffer = await page.screenshot({ fullPage: fullPage ?? true })

          return {
            type: 'image' as const,
            data: buffer.toString('base64'),
          }
        } catch (error) {
          return {
            type: 'error' as const,
            message: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      },
      toModelOutput(result) {
        return {
          type: 'content',
          value:
            result.type === 'error'
              ? [{ type: 'text', text: result.message }]
              : [
                  { type: 'text', text: 'Screenshot taken successfully' },
                  { type: 'media', data: result.data, mediaType: 'image/png' },
                ],
        }
      },
    }),

    /**
     * Perform action using natural language
     */
    act: tool({
      description: `Perform a single browser action using natural language.

IMPORTANT: Break complex actions into small, single-step actions for best results.

Supported actions:
" CLICK - click buttons, links, checkboxes (e.g., "click the submit button")
" FILL - enter text into input fields (e.g., "fill the email field with john@example.com")
" TYPE - type text into focused elements (e.g., "type OpenAI into the search box")
" PRESS - keyboard key presses (e.g., "press Enter", "press Tab")
" SCROLL - navigate page content (e.g., "scroll to bottom", "scroll to top")
" SELECT - choose from dropdowns (e.g., "select Large from the size dropdown")

Best practices:
" Use one action at a time - avoid combining multiple actions
" Be specific about target elements and values
" For complex workflows, chain multiple act calls sequentially`,
      inputSchema: z.object({
        instruction: z
          .string()
          .describe(
            'A single, atomic browser action to perform. Examples: "click the submit button", "fill the email field with test@example.com", "type OpenAI into the search box", "press Enter"'
          ),
      }),
      execute: async ({ instruction }) => {
        try {
          await stagehand.act(instruction)
          return {
            success: true,
            action: instruction,
            message: `Action performed: ${instruction}`,
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'

          if (
            errorMessage.includes('No object generated') ||
            errorMessage.includes('response did not match schema')
          ) {
            return {
              success: false,
              action: instruction,
              error:
                'Element not found or action could not be performed. The page may have changed or the element is not visible.',
            }
          }

          return {
            success: false,
            action: instruction,
            error: errorMessage,
          }
        }
      },
    }),

    /**
     * Execute a single predefined action from actionbook
     */
    actSingleAction: tool({
      description:
        'Execute a single predefined Stagehand action. Use this when you have a single JSON action item from actionbook.',
      inputSchema: z.object({
        selector: z
          .string()
          .describe('The selector (XPath or CSS) used to target the element'),
        description: z.string().describe('Description of the action'),
        method: z
          .string()
          .describe('The method used (e.g., "click", "fill", "type")'),
        arguments: z
          .array(z.string())
          .describe('Arguments passed to the method'),
      }),
      execute: async ({ selector, description, method, arguments: args }) => {
        try {
          console.log(`\n<� Executing action: ${method} on ${selector}`)

          const action = { selector, description, method, arguments: args }
          const result = await stagehand.act(action)

          console.log(` Action completed`)
          return { success: true, action: method, selector, result }
        } catch (error) {
          console.error(
            `L Failed: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          )
          return {
            success: false,
            action: method,
            selector,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      },
    }),

    /**
     * Execute multiple predefined actions from actionbook in sequence
     */
    actMultiActions: tool({
      description:
        'Execute a batch of predefined Stagehand actions in sequence. Use this when you have multiple JSON action items from actionbook.',
      inputSchema: z.object({
        actions: z
          .array(
            z.object({
              selector: z.string().describe('The selector (XPath or CSS)'),
              description: z.string().describe('Description of the action'),
              method: z.string().describe('The method (e.g., "click", "fill")'),
              arguments: z
                .array(z.string())
                .describe('Arguments for the method'),
            })
          )
          .describe('Array of Stagehand action objects to execute in sequence'),
      }),
      execute: async ({ actions }) => {
        const results = []

        try {
          console.log(`\n<� Executing batch of ${actions.length} actions...`)

          for (let i = 0; i < actions.length; i++) {
            const action = actions[i]
            console.log(`  ${i + 1}. ${action.method} on ${action.selector}`)

            try {
              const result = await stagehand.act(action)
              results.push({
                index: i,
                action: action.method,
                selector: action.selector,
                success: true,
                result,
              })
            } catch (error) {
              console.error(
                `  L Failed: ${
                  error instanceof Error ? error.message : 'Unknown error'
                }`
              )
              results.push({
                index: i,
                action: action.method,
                selector: action.selector,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              })
              break // Stop on first failure
            }
          }

          const successCount = results.filter((r) => r.success).length
          console.log(`\n Completed ${successCount}/${actions.length} actions`)

          return {
            success: successCount === actions.length,
            totalActions: actions.length,
            successfulActions: successCount,
            results,
          }
        } catch (error) {
          return {
            success: false,
            totalActions: actions.length,
            successfulActions: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
            results,
          }
        }
      },
    }),
  }
}
