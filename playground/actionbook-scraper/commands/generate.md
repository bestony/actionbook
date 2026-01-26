# /actionbook-scraper:generate

Generate web scraper scripts using Actionbook's verified selectors.

## ⚠️ CRITICAL: Generate → Verify → Fix Loop

**Every generated script MUST be verified by executing it. If verification fails, fix and retry.**

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   1. Generate Script                                │
│          ↓                                          │
│   2. Execute Script to Verify                       │
│          ↓                                          │
│   3. Check Results                                  │
│          ↓                                          │
│      ┌───┴───┐                                      │
│      │       │                                      │
│   Success  Failure                                  │
│      │       │                                      │
│      ↓       ↓                                      │
│   Output   Analyze Error → Fix Script → Go to 2    │
│   Script                                            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## ⚠️ CRITICAL: Default Output = agent-browser Script

**When `/generate <url>` is called (without --standalone):**

Output MUST be **agent-browser bash commands**, NOT Playwright/JavaScript:

```bash
agent-browser open "https://example.com"
agent-browser scroll down 2000
agent-browser get text ".selector"
agent-browser close
```

**Do NOT output:**
- Playwright code
- JavaScript code
- .js files
- `const { chromium } = require('playwright')`

---

**Only output Playwright when `--standalone` is specified:**

```
/generate <url> --standalone  →  Playwright .js code
```

## Usage

```
/actionbook-scraper:generate <url> [--standalone] [--template <template>] [--output <format>]
```

## Parameters

- `url` (required): The full URL of the page to scrape
- `--standalone` (optional): Generate Playwright/Puppeteer script instead of agent-browser script
- `--template` (optional): For standalone mode: `playwright-js`, `playwright-python`, `puppeteer`. Default: `playwright-js`
- `--output` (optional): Output format in generated script: `json`, `csv`. Default: `json`

## Two Output Modes

### Default Mode: Generate agent-browser Script

```
/actionbook-scraper:generate https://firstround.com/companies
```

**Output:** agent-browser commands that user can run

```bash
# Generated script - user runs this manually
agent-browser open "https://firstround.com/companies"
agent-browser wait --load networkidle
agent-browser scroll down 2000
agent-browser get text ".company-list-card-small"
agent-browser close
```

### Standalone Mode: Generate Playwright Script

```
/actionbook-scraper:generate https://firstround.com/companies --standalone
```

**Output:** Playwright/Puppeteer JavaScript code that user can run

```javascript
// Generated script - user runs: node scraper.js
const { chromium } = require('playwright');
// ... full script code
```

## Workflow

### Step 1: Search Actionbook

```
search_actions("firstround companies")
→ Returns action_id
```

### Step 2: Get Selectors

```
get_action_by_id(action_id)
→ Returns:
   - Card: .company-list-card-small
   - Name: .company-list-card-small__button-name
   - Expand: button.company-list-card-small__button
```

### Step 3: Generate Script

Use selectors to generate script code.

### Step 4: Verify Script (Two-Part Check)

**Every script must pass BOTH checks:**

| Check | What to Verify |
|-------|----------------|
| **Part 1: Script Runs** | No errors, no timeouts |
| **Part 2: Data Correct** | Content matches expected fields |

**For agent-browser scripts:**
```bash
# Execute commands
agent-browser open "https://example.com"
agent-browser wait --load networkidle
agent-browser get text ".selector"

# Part 1: Check no errors
# Part 2: Check data content is correct:
#   - Fields are not empty
#   - Values are actual data, not "Loading..." or "Click to expand"
#   - Field mapping is correct (name contains name, not year)

agent-browser close
```

**For Playwright scripts (--standalone):**
```bash
# Execute: node /tmp/scraper.js
# Part 1: Check script runs without errors
# Part 2: Check output data is correct:
#   - JSON has expected fields
#   - Values are actual content, not UI text
```

### Step 5: Handle Results

**If BOTH checks pass:**
- Output the verified script
- Show extracted data preview with field validation

**If Part 1 fails (script error):**
- Fix syntax, selector, or timeout issue
- Retry

**If Part 2 fails (wrong data):**
- Analyze what's wrong:
  - Extracted button text instead of content?
  - Extracted placeholder text?
  - Fields mapped incorrectly?
- Fix extraction logic
- Retry

**Max 3 retries** - If still failing, report the specific issue

### Step 6: Return Verified Script to User

Provide:
- The verified script code
- Usage instructions
- Data preview showing correct field values

## Output Format

### Default Mode Output (agent-browser)

```markdown
## Generated Scraper (agent-browser)

**Target URL**: https://firstround.com/companies
**Selectors**: From Actionbook (verified)

### Script

Run these commands in sequence:

```bash
agent-browser open "https://firstround.com/companies"
agent-browser wait --load networkidle
agent-browser wait ".company-list-card-small"

# Scroll to load all cards
agent-browser scroll down 2000
agent-browser wait 1500
agent-browser scroll down 2000
agent-browser wait 1500

# Extract data
agent-browser get text ".company-list-card-small"

# Close browser
agent-browser close
```

### Usage

Copy and run each command in your terminal.

### Expected Output

Company data in text format that you can parse into JSON.
```

### Standalone Mode Output (Playwright)

```markdown
## Generated Scraper (Playwright)

**Target URL**: https://firstround.com/companies
**Template**: playwright-js

### Dependencies

```bash
npm install playwright
```

### Script

```javascript
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://firstround.com/companies', {
    waitUntil: 'networkidle'
  });

  // ... rest of generated code

  await browser.close();
})();
```

### Usage

```bash
node scraper.js
```

### Expected Output

Results saved to `companies.json`
```

## Examples

```bash
# Generate agent-browser script (default)
/actionbook-scraper:generate https://firstround.com/companies

# Generate Playwright JavaScript script
/actionbook-scraper:generate https://firstround.com/companies --standalone

# Generate Playwright Python script
/actionbook-scraper:generate https://example.com/products --standalone --template playwright-python

# Generate Puppeteer script
/actionbook-scraper:generate https://example.com/data --standalone --template puppeteer
```

## Agent

| Mode | Agent | Model |
|------|-------|-------|
| Default (agent-browser) | code-generator | sonnet |
| Standalone (Playwright) | code-generator | sonnet |

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "No selectors found" | Site not indexed | Use `/actionbook-scraper:request-website` |
| "Template not supported" | Invalid template | Use playwright-js, playwright-python, or puppeteer |

## Notes

- Scripts are automatically verified by executing them before output
- If verification fails, the script is automatically fixed and re-verified (up to 3 retries)
- Generated scripts use verified selectors from Actionbook
- Final output includes both the script and a data preview from verification
- Add appropriate delays when running scripts to respect target servers
- **Actionbook issues are logged** to `.actionbook-issues.log` when selectors are wrong or outdated
