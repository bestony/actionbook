import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import chalk from 'chalk'

/**
 * Spawn a command with arguments, inheriting stdio
 * Returns the exit code
 * If command is not found (ENOENT), shows installation instructions
 * @param suppressInstallInstructions - If true, don't show installation instructions on ENOENT
 */
export async function spawnCommand(
  command: string,
  args: string[],
  suppressInstallInstructions = false
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    })

    child.on('close', (code, signal) => {
      if (signal) {
        // Process was killed by signal (e.g., SIGINT from Ctrl+C)
        // Convert signal to exit code: 128 + signal number
        resolve(128 + (signal === 'SIGINT' ? 2 : 15))
      } else {
        resolve(code ?? 1)
      }
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      // Command not found - show installation instructions
      if (error.code === 'ENOENT') {
        if (!suppressInstallInstructions) {
          showAgentBrowserInstallation()
        }
        resolve(127) // Standard exit code for command not found
      } else {
        console.error(chalk.red(`Failed to execute ${command}: ${error.message}`))
        resolve(1)
      }
    })
  })
}

/**
 * Spawn agent-browser command using npx from CLI package directory
 * This ensures agent-browser is executed from the CLI's node_modules
 * Replaces "agent-browser" with "actionbook browser" in output
 */
export async function spawnAgentBrowser(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    // Get CLI package root directory (dist/utils/process.js -> ../..)
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const cliPackageRoot = join(__dirname, '..', '..')

    const child = spawn('npx', ['agent-browser', ...args], {
      stdio: ['inherit', 'pipe', 'pipe'], // Inherit stdin, pipe stdout/stderr for transformation
      shell: false,
      env: process.env,
      cwd: cliPackageRoot, // Execute in CLI package directory
    })

    // Transform and output stdout
    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        const output = data.toString().replace(/agent-browser/g, 'actionbook browser')
        process.stdout.write(output)
      })
    }

    // Transform and output stderr
    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        const output = data.toString().replace(/agent-browser/g, 'actionbook browser')
        process.stderr.write(output)
      })
    }

    child.on('close', (code, signal) => {
      if (signal) {
        resolve(128 + (signal === 'SIGINT' ? 2 : 15))
      } else {
        resolve(code ?? 1)
      }
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        console.error(chalk.red('\nnpx command not found.'))
        console.error(chalk.white('Please ensure npm 5.2+ is installed.\n'))
        resolve(127)
      } else {
        console.error(chalk.red(`Failed to execute agent-browser: ${error.message}`))
        resolve(1)
      }
    })
  })
}

/**
 * Show installation instructions for agent-browser
 */
export function showAgentBrowserInstallation(): void {
  console.error(chalk.red('\nagent-browser is not installed or not in PATH.\n'))

  console.error(chalk.white('agent-browser is a fast browser automation CLI for AI agents.'))
  console.error(chalk.white('To install it, run:\n'))

  console.error(chalk.cyan('  npm install -g agent-browser\n'))

  console.error(chalk.white('Learn more: ') + chalk.cyan('https://github.com/vercel-labs/agent-browser\n'))

  console.error(chalk.white('After installation, verify with:\n'))
  console.error(chalk.cyan('  agent-browser --help\n'))
}

/**
 * Find playwright-core CLI path from node_modules
 * Supports both npm and pnpm node_modules structures
 */
function findPlaywrightCoreCli(baseDir: string): string | null {
  const dirsToCheck = [
    baseDir, // Current package dir
    join(baseDir, '..', '..'), // Workspace root (for pnpm workspace)
  ]

  for (const dir of dirsToCheck) {
    // Check pnpm structure - find any playwright-core@* version
    const pnpmDir = join(dir, 'node_modules', '.pnpm')
    if (existsSync(pnpmDir)) {
      try {
        const entries = readdirSync(pnpmDir)
        for (const entry of entries) {
          if (entry.startsWith('playwright-core@')) {
            const cliPath = join(pnpmDir, entry, 'node_modules', 'playwright-core', 'cli.js')
            if (existsSync(cliPath)) {
              return cliPath
            }
          }
        }
      } catch (error) {
        // Ignore read errors, try other methods
      }
    }

    // Check npm flat structure
    const npmFlatPath = join(dir, 'node_modules', 'playwright-core', 'cli.js')
    if (existsSync(npmFlatPath)) {
      return npmFlatPath
    }

    // Check npm nested under agent-browser
    const npmNestedPath = join(dir, 'node_modules', 'agent-browser', 'node_modules', 'playwright-core', 'cli.js')
    if (existsSync(npmNestedPath)) {
      return npmNestedPath
    }
  }

  return null
}

/**
 * Install Chromium browser binaries for agent-browser
 * Uses playwright-core CLI from package dependencies to ensure version compatibility
 * @param installArgs - Additional arguments like ['--with-deps'] for Linux
 */
export async function installAgentBrowser(installArgs: string[] = []): Promise<number> {
  console.log(chalk.cyan('Setting up browser automation...\n'))
  console.log(chalk.yellow('Downloading Chromium browser binaries...\n'))

  // Get CLI package root directory
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const cliPackageRoot = join(__dirname, '..', '..')

  // Find playwright-core CLI
  const playwrightCliPath = findPlaywrightCoreCli(cliPackageRoot)
  if (!playwrightCliPath) {
    console.error(chalk.red('\nFailed to locate playwright-core CLI.'))
    console.error(chalk.white('Please ensure agent-browser and its dependencies are properly installed.\n'))
    return 1
  }

  const installArgs2 = ['install', 'chromium']
  if (installArgs.includes('--with-deps')) {
    installArgs2.push('--with-deps')
  }

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn('node', [playwrightCliPath, ...installArgs2], {
      stdio: 'inherit',
      shell: false,
      env: process.env,
      cwd: cliPackageRoot,
    })

    child.on('close', (code, signal) => {
      if (signal) {
        resolve(128 + (signal === 'SIGINT' ? 2 : 15))
      } else {
        resolve(code ?? 1)
      }
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        console.error(chalk.red('\nnpx command not found.'))
        console.error(chalk.white('Please ensure npm 5.2+ is installed.\n'))
        resolve(127)
      } else {
        console.error(chalk.red(`Failed to install Chromium: ${error.message}`))
        resolve(1)
      }
    })
  })

  if (exitCode === 0) {
    console.log(chalk.green('\n✓ Browser automation setup complete!\n'))
    console.log(chalk.white('You can now use: ') + chalk.cyan('actionbook browser <command>\n'))
  } else {
    console.error(chalk.red('\nBrowser setup encountered an error.'))
    console.error(chalk.white('Please check the output above for details.\n'))
  }

  return exitCode
}
