import { Command } from 'commander'
import chalk from 'chalk'
import { spawnAgentBrowser, installAgentBrowser } from '../utils/process.js'

export const browserCommand = new Command('browser')
  .description('Execute actionbook browser commands (browser automation)')
  .allowUnknownOption(true) // Critical: allow any args through
  .allowExcessArguments(true)
  .helpOption('-h, --help', 'Display help for actionbook browser')
  .addHelpText(
    'after',
    `
Examples:
  $ actionbook browser open example.com
  $ actionbook browser snapshot -i
  $ actionbook browser click @e1
  $ actionbook browser fill @e3 "test@example.com"

Setup:
  $ actionbook browser install          # Download Chromium browser
  $ actionbook browser install --with-deps  # Linux: include system dependencies

For detailed commands:
  $ actionbook browser

Learn more: ${chalk.cyan('https://github.com/vercel-labs/agent-browser')}
  `
  )
  .action(async (_options, command) => {
    // Get all arguments passed after 'browser'
    const args = command.args

    // If no args and user didn't ask for help, show agent-browser help
    if (args.length === 0) {
      console.log(chalk.yellow('No arguments provided. Showing agent-browser help:\n'))
      const exitCode = await spawnAgentBrowser(['--help'])
      process.exit(exitCode)
      return
    }

    // Special handling for 'install' command - auto-install agent-browser if needed
    if (args[0] === 'install') {
      const exitCode = await installAgentBrowser(args.slice(1))
      process.exit(exitCode)
      return
    }

    // Execute agent-browser with all args
    const exitCode = await spawnAgentBrowser(args)
    process.exit(exitCode)
  })
