# @actionbookdev/cli

CLI for Actionbook - Get website action manuals for AI agents.

## Installation

```bash
npm install -g @actionbookdev/cli
```

## Quick Start

```bash
# Search for actions
actionbook search "airbnb search"

# Get action details by area_id
actionbook get "airbnb.com:/:default"

# Browser automation (requires agent-browser)
actionbook browser open example.com
actionbook browser snapshot -i
```

## Commands

### `actionbook search <query>`

Search for action manuals by keyword.

```bash
actionbook search "google login"
actionbook search "airbnb" --domain airbnb.com
actionbook search "login" --page 2 --page-size 20
```

**Options:**
- `-d, --domain <domain>` - Filter by domain (e.g., "airbnb.com")
- `-u, --url <url>` - Filter by URL
- `-p, --page <number>` - Page number (default: `1`)
- `-s, --page-size <number>` - Results per page 1-100 (default: `10`)

**Alias:** `actionbook s`

### `actionbook get <area_id>`

Get complete action details by area ID.

```bash
actionbook get "airbnb.com:/:default"
actionbook get "github.com:/login:default"
```

**Alias:** `actionbook g`

### `actionbook browser [command]`

Execute browser automation commands. This command forwards all arguments to `agent-browser` CLI.

```bash
# Open a website
actionbook browser open example.com

# Take interactive snapshot
actionbook browser snapshot -i

# Click element by reference
actionbook browser click @e1

# Fill input field
actionbook browser fill @e3 "test@example.com"

# Check current session
actionbook browser session

# Close browser
actionbook browser close
```

**Setup:**

```bash
# npm (recommended)
# Download Chromium
actionbook browser install

# Linux users - include system dependencies
actionbook browser install --with-deps
# or manually: npx playwright install-deps chromium
```

**Common Commands:**
- `open <url>` - Navigate to URL
- `snapshot -i` - Get interactive elements with references
- `click <selector>` - Click element (or @ref)
- `fill <selector> <text>` - Fill input field
- `type <selector> <text>` - Type into element
- `wait <selector|ms>` - Wait for element or time
- `screenshot [path]` - Take screenshot
- `close` - Close browser

**For full command list:**

```bash
actionbook browser --help
actionbook browser  # Shows full agent-browser help
```

**Learn more:** [agent-browser on GitHub](https://github.com/vercel-labs/agent-browser)

## Authentication

Set your API key via environment variable:

```bash
export ACTIONBOOK_API_KEY=your_api_key
```

Or pass it as an option:

```bash
actionbook --api-key your_api_key search "query"
```

## Output Format

The CLI outputs plain text results optimized for both human readability and AI agent consumption.

## Examples

### Typical Workflow

```bash
# 1. Search for actions
actionbook search "airbnb search"

# 2. Get details for a specific action using area_id from search results
actionbook get "airbnb.com:/:default"

# 3. Use the selectors in your automation script
```

### Filter by Domain

```bash
# Search within a specific domain
actionbook search "login" --domain github.com
```

### Browser Automation Workflow

```bash
# 1. Get action details with verified selectors
actionbook get "github.com:/login:default"

# 2. Use browser command to automate
actionbook browser open "https://github.com/login"
actionbook browser snapshot -i
actionbook browser fill @e1 "username"
actionbook browser fill @e2 "password"
actionbook browser click @e3
```

## Related Packages

- [`@actionbookdev/sdk`](https://www.npmjs.com/package/@actionbookdev/sdk) - JavaScript/TypeScript SDK
- [`@actionbookdev/mcp`](https://www.npmjs.com/package/@actionbookdev/mcp) - MCP Server for AI agents

## License

MIT
