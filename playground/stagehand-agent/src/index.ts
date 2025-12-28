import 'dotenv/config'
import { generateText, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import { Actionbook } from '@actionbookdev/sdk'
import { Stagehand } from '@browserbasehq/stagehand'
import { createActionbookTools } from './tools/actionbook.js'
import { createStagehandTools } from './tools/stagehand.js'

const PROVIDER = 'openai'
const MODEL = 'gpt-5'

const SYSTEM_PROMPT = `You are an AI agent that helps users perform tasks on the web using browser automation.

## Available Tools

### Actionbook Tools (for getting action information)
- **searchActions**: Search for action manuals by keyword. Use this to find relevant actions before performing them.
- **getActionById**: Get complete action details by ID, including selectors and step-by-step instructions.

### Browser Tools (for interacting with the browser)
- **goto**: Navigate to a URL
- **pageInfo**: Get current page URL and title
- **screenshot**: Take a screenshot of the current page
- **act**: Perform a single browser action using natural language (click, fill, type, press, scroll, select)
- **actSingleAction**: Execute a predefined action from actionbook (with selector, method, arguments)
- **actMultiActions**: Execute multiple predefined actions in sequence

## Workflow
1. **Understand the task**: Parse the user's request to understand what they want to accomplish.
2. **Navigate first**: Use \`goto\` to navigate to the target website if not already there.
3. **Search for actions**: Use \`searchActions\` to find relevant action manuals for the website/task.
4. **Get action details**: Use \`getActionById\` to get detailed selectors and instructions.
5. **Execute actions**: Use the browser tools to perform the actions:
   - If you have actionbook data with selectors, use \`actSingleAction\` or \`actMultiActions\`
   - If you need to perform ad-hoc actions, use \`act\` with natural language
6. **Verify results**: Use \`pageInfo\` or \`screenshot\` to verify the action was successful.

## Best Practices

- Always search for actionbook data first - it provides tested, reliable selectors
- Break complex tasks into small, single-step actions
- Verify each step before proceeding to the next
- If an action fails, try alternative approaches or use natural language \`act\`
`

async function main() {
  // Initialize Stagehand with LOCAL environment
  const stagehand = new Stagehand({
    env: 'LOCAL',
    model: `${PROVIDER}/${MODEL}`,
    localBrowserLaunchOptions: {
      headless: process.env.HEADLESS === 'true',
      viewport: {
        width: 1280,
        height: 720,
      },
    },
    verbose: 1,
  })

  await stagehand.init()

  const actionbook = new Actionbook({ apiKey: process.env.ACTIONBOOK_API_KEY })

  try {
    // Create all tools
    const actionbookTools = createActionbookTools(actionbook)
    const stagehandTools = createStagehandTools(stagehand)

    const tools = {
      ...actionbookTools,
      ...stagehandTools,
    }

    // Get task from command line or use default
    const task =
      'Go to airbnb.com and search for a place to stay in Tokyo for 2 guests.'

    console.log(`\n🚀 Starting agent with task: ${task}\n`)

    // Run the agent using AI SDK's generateText with tools
    const result = await generateText({
      model: openai(MODEL),
      system: SYSTEM_PROMPT,
      prompt: task,
      tools,
      stopWhen: stepCountIs(30),
      onStepFinish({ text, toolCalls, toolResults }) {
        if (toolCalls && toolCalls.length > 0) {
          for (const toolCall of toolCalls) {
            console.log(`\n🔧 Tool: ${toolCall.toolName}`)
            console.log(`   Input: ${JSON.stringify(toolCall.input)}`)
          }
        }
        if (toolResults && toolResults.length > 0) {
          for (const toolResult of toolResults) {
            const preview =
              JSON.stringify(toolResult.output).slice(0, 200) +
              (JSON.stringify(toolResult.output).length > 200 ? '...' : '')
            console.log(`   Output: ${preview}`)
          }
        }
        if (text) {
          console.log(`\n💬 Assistant: ${text}`)
        }
      },
    })

    console.log('\n✅ Agent completed!')
    console.log('\n📝 Final Response:')
    console.log(result.text)

    console.log('\n📊 Usage:')
    console.log(`   Steps: ${result.steps.length}`)
    console.log(
      `   Tool calls: ${result.steps.reduce(
        (acc, step) => acc + (step.toolCalls?.length || 0),
        0
      )}`
    )
    console.log(
      `   Tokens: ${result.usage.inputTokens} input + ${result.usage.outputTokens} output`
    )
  } catch (error) {
    console.error('❌ Agent error:', error)
    throw error
  } finally {
    await stagehand.close()
  }
}

main().catch(console.error)
