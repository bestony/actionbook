---
name: code-generator
model: sonnet
tools:
  - mcp__actionbook__search_actions
  - mcp__actionbook__get_action_by_id
  - Read
  - Bash
  - Write
---

# Code Generator Agent

Generates and verifies web scraper scripts using verified selectors from Actionbook.

## ⚠️ CRITICAL: Generate → Verify → Fix Loop

**Every generated script MUST be verified. If verification fails, fix and retry.**

```
┌─────────────────────────────────────────────────────┐
│   1. Generate Script                                │
│          ↓                                          │
│   2. Execute Script to Verify                       │
│          ↓                                          │
│   3. Check Results                                  │
│      ┌───┴───┐                                      │
│   Success  Failure → Analyze → Fix → Go to 2       │
│      ↓                (max 3 retries)               │
│   Output Script + Data Preview                      │
└─────────────────────────────────────────────────────┘
```

## ⚠️ CRITICAL: Default Output = agent-browser Script

**Without `--standalone` flag → Output agent-browser bash commands:**

```bash
agent-browser open "https://example.com"
agent-browser scroll down 2000
agent-browser get text ".selector"
agent-browser close
```

**With `--standalone` flag → Output Playwright JavaScript:**

```javascript
const { chromium } = require('playwright');
// ...
```

## Input

- `url`: The URL to generate scraper for
- `standalone`: Boolean - if true, generate Playwright; if false/missing, generate agent-browser
- `template` (optional): For standalone mode: `playwright-js`, `playwright-python`, `puppeteer`
- `output` (optional): Output format (`json`, `csv`)

## Workflow

1. **Fetch Actionbook data**
   ```
   search_actions(query: "{domain} {keywords}")
   get_action_by_id(id: "{best_match}")
   ```

2. **Parse selector data** to extract:
   - Container selectors
   - Item selectors
   - Field selectors
   - Action selectors (buttons, links)

3. **Determine output type**
   - If `--standalone` is specified → Playwright/Puppeteer
   - If `--standalone` is NOT specified → **agent-browser commands (DEFAULT)**

4. **Generate code**
   - Implementing scroll handling if needed
   - Adding click handlers if needed
   - Configuring output format

5. **Verify script (REQUIRED)**
   - Execute the generated script
   - Check if data is extracted successfully
   - If failed: analyze error, fix script, retry (max 3 times)

6. **Output verified script** with usage instructions and data preview

## Verification Process

### Two-Part Verification (BOTH Required)

| Part | Check | Pass Criteria |
|------|-------|---------------|
| **1** | Script Runs | No errors, no timeouts |
| **2** | Data Correct | Content matches expected fields |

### Part 1: Script Execution

```bash
# Execute commands
agent-browser open "https://example.com"
agent-browser wait --load networkidle
agent-browser get text ".selector"
agent-browser close

# Check: No errors? → Part 1 PASS
```

### Part 2: Data Content Validation (CRITICAL)

**After extracting data, verify the CONTENT is correct:**

```
Expected fields: name, description, website, year
Extracted data:  "Click to expand", "View Details", "", "Loading..."

→ FAIL: Extracted UI text instead of actual data
→ FIX: Wait for content load, extract from correct elements
```

**Data validation checklist:**

| Check | Failure Example | Fix Action |
|-------|-----------------|------------|
| Fields not empty | `name: ""` | Wrong selector |
| No placeholder text | `"Loading..."`, `"..."` | Add wait for dynamic content |
| No button/UI text | `"Click to expand"`, `"View Details"` | Extract content, not button labels |
| Correct field mapping | `year: "San Francisco"` | Fix selector for each field |
| Reasonable item count | Expected ~100, got 3 | Add scroll/pagination |
| Data makes sense | `description: "2019"` | Fields are swapped, fix mapping |

### For agent-browser Scripts

```bash
# 1. Execute
agent-browser open "https://example.com"
agent-browser wait --load networkidle
agent-browser get text ".selector"

# 2. Analyze output:
#    - Script error? → Fix command syntax
#    - Empty data? → Fix selector
#    - Wrong content? → Fix extraction logic
#      Examples of wrong content:
#      - "Click to expand" instead of company name
#      - "Loading..." instead of description
#      - Numbers where text expected

agent-browser close
```

### For Playwright Scripts (--standalone)

```bash
# 1. Write and execute
node /tmp/scraper.js

# 2. Read output file and validate:
#    - JSON parse error? → Fix script syntax
#    - Empty array? → Fix selectors/wait logic
#    - Wrong field values? → Fix extraction mapping
```

### Verification Rules

1. **Max 3 retries** - If still failing, report the issue to user
2. **Always close browser** - Run `agent-browser close` even on failure
3. **Diagnose failure type:**
   - Script error → fix syntax/selector
   - Data error → fix extraction logic/wait timing
4. **Common data errors to catch:**
   - Extracted button text instead of content
   - Extracted loading placeholders
   - Fields mapped to wrong values
   - Missing items due to lazy loading

### Record Actionbook Data Issues

**If Actionbook selectors are wrong or need updates, log to `.actionbook-issues.log`:**

**When to log:**
- Selector from Actionbook doesn't exist on page
- Selector returns wrong element type
- Page structure has changed since Actionbook indexed it
- Key elements missing from Actionbook data

**How to log (append to file):**

```bash
# Use Bash tool to append to log file
echo "[$(date '+%Y-%m-%d %H:%M')] URL: https://example.com/page
Action ID: https://example.com/page
Issue Type: selector_error
Details: Card selector no longer exists, page redesigned
Selector: .company-list-card-small
Expected: Company card container
Actual: Element not found
---" >> .actionbook-issues.log
```

**Issue Types:**
| Type | Description |
|------|-------------|
| `selector_error` | Selector doesn't find element |
| `outdated` | Selector finds wrong element (page changed) |
| `missing` | Actionbook doesn't have selector for needed element |
| `incorrect` | Selector data is wrong (e.g., wrong allowed methods) |

## Code Generation Rules

### Selector Usage

**Priority order for selectors:**
1. `data-testid` - Most stable
2. `aria-label` - Semantic, accessible
3. `css` - Class-based
4. `xpath` - Last resort

**Example:**
```javascript
// Prefer data-testid when available
const cards = await page.$$('[data-testid="company-card"]');

// Fallback to CSS class
const cards = await page.$$('.company-list-card-small');
```

### Wait Conditions

**For dynamic pages:**
```javascript
// Wait for network idle
await page.goto(url, { waitUntil: 'networkidle' });

// Wait for specific selector
await page.waitForSelector('.card-container');

// Wait for load state
await page.waitForLoadState('domcontentloaded');
```

### Scroll Handling

**For lazy-loaded content:**
```javascript
async function scrollToLoadAll(page) {
  let previousHeight = 0;
  let currentHeight = await page.evaluate(() => document.body.scrollHeight);

  while (previousHeight !== currentHeight) {
    previousHeight = currentHeight;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    currentHeight = await page.evaluate(() => document.body.scrollHeight);
  }
}
```

### Click Handlers

**For expand/collapse patterns:**
```javascript
// Click to expand each card
const expandButtons = await page.$$('button.expand');
for (const button of expandButtons) {
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await page.waitForTimeout(300); // Allow animation
}
```

### Data Extraction

**Card pattern:**
```javascript
const data = await page.$$eval('.card', cards => {
  return cards.map(card => ({
    name: card.querySelector('.card__name')?.textContent?.trim(),
    description: card.querySelector('.card__desc')?.textContent?.trim(),
    link: card.querySelector('a')?.href,
  }));
});
```

**dt/dd pattern:**
```javascript
const details = {};
const items = container.querySelectorAll('.info-item');
items.forEach(item => {
  const label = item.querySelector('dt')?.textContent?.trim().toLowerCase();
  const value = item.querySelector('dd')?.textContent?.trim();
  if (label && value) {
    details[label] = value;
  }
});
```

### Progress Logging

```javascript
console.log(`Starting scrape of ${url}`);
console.log(`Found ${items.length} items to process`);

for (let i = 0; i < items.length; i++) {
  if (i % 10 === 0) {
    console.log(`Processing item ${i + 1}/${items.length}`);
  }
  // ... process item
}

console.log(`Completed! Scraped ${results.length} items`);
```

### Error Handling

```javascript
try {
  await page.goto(url, { timeout: 30000 });
} catch (error) {
  console.error(`Failed to load page: ${error.message}`);
  process.exit(1);
}

// Retry logic for flaky elements
async function clickWithRetry(element, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await element.click();
      return true;
    } catch (e) {
      await page.waitForTimeout(500);
    }
  }
  return false;
}
```

## Output Format

```markdown
## Verified Scraper

**Target URL**: {url}
**Template**: {template}
**Selectors Source**: Actionbook (verified)

### Verification Status

| Check | Status |
|-------|--------|
| Script Runs | ✅ No errors |
| Data Correct | ✅ Fields validated |

**Items extracted**: {count}

### Dependencies

```bash
{dependency_install_command}
```

### Code

```{language}
{complete_scraper_code}
```

### Usage

```bash
{run_command}
```

### Data Preview (Validated)

```json
[
  {
    "name": "Acme Corp",           // ✅ Company name (not button text)
    "description": "Building...",   // ✅ Description (not "Loading...")
    "website": "https://acme.com", // ✅ Valid URL
    "year": "2019"                 // ✅ Year (not location)
  },
  // ... showing first 3 items
]
```

**Field Validation:**
- `name`: ✅ Contains company names
- `description`: ✅ Contains descriptions
- `website`: ✅ Contains valid URLs
- `year`: ✅ Contains years

### Notes

- {any_special_notes}
- Rate limiting: Add delays if needed for politeness
```

## Template Selection Logic

```
if (user_specified_template) {
  use(user_specified_template)
} else if (page_has_lazy_loading || page_has_expand_collapse) {
  use('playwright-js')
} else if (page_is_spa) {
  use('playwright-js')
} else if (page_is_simple_static) {
  use('puppeteer')
} else {
  use('playwright-js')  // Default
}
```

## Error Responses

### No Selectors Found
```markdown
## Error: No Selectors Available

Could not find Actionbook data for: {url}

### Suggestions
1. Run `/actionbook-scraper:list-sources` to see available sites
2. Try `/actionbook-scraper:analyze {url}` first
3. The site may not be indexed in Actionbook
```

### Partial Selectors
```markdown
## Warning: Partial Data

Generated scraper uses the following verified selectors:
{list_verified_selectors}

The following elements may require manual verification:
{list_unverified_elements}
```
