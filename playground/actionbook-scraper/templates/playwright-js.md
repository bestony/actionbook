# Playwright JavaScript Template

Template for generating Node.js scraper scripts using Playwright.

## Generate → Verify → Fix Loop

**Scripts generated with this template are automatically verified:**

1. Generate Playwright script
2. Write to temp file and execute with `node`
3. Check if output file has data
4. If failed: analyze error, fix, retry (max 3x)
5. Output verified script + data preview

## Best For

- Dynamic pages with JavaScript rendering
- Single Page Applications (SPAs)
- Pages with lazy loading / infinite scroll
- Pages with click-to-expand patterns
- Complex interactions required

## Dependencies

```bash
npm install playwright
```

## Base Template

```javascript
const { chromium } = require('playwright');
const fs = require('fs');

// Configuration
const CONFIG = {
  url: '{{URL}}',
  outputFile: '{{OUTPUT_FILE}}',
  headless: true,
  timeout: 30000,
  scrollDelay: 1000,
  clickDelay: 300,
};

// Selectors from Actionbook
const SELECTORS = {
  container: '{{CONTAINER_SELECTOR}}',
  item: '{{ITEM_SELECTOR}}',
  // Add field selectors
  {{FIELD_SELECTORS}}
  // Add action selectors
  {{ACTION_SELECTORS}}
};

async function scrollToLoadAll(page) {
  console.log('Scrolling to load all content...');
  let previousHeight = 0;
  let currentHeight = await page.evaluate(() => document.body.scrollHeight);
  let scrollCount = 0;

  while (previousHeight !== currentHeight) {
    previousHeight = currentHeight;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(CONFIG.scrollDelay);
    currentHeight = await page.evaluate(() => document.body.scrollHeight);
    scrollCount++;
    console.log(`  Scroll ${scrollCount}: height ${currentHeight}px`);
  }

  console.log(`Finished scrolling after ${scrollCount} scrolls`);
}

async function expandAllItems(page) {
  if (!SELECTORS.expandButton) return;

  console.log('Expanding all items...');
  const buttons = await page.$$(SELECTORS.expandButton);
  console.log(`  Found ${buttons.length} items to expand`);

  for (let i = 0; i < buttons.length; i++) {
    try {
      await buttons[i].scrollIntoViewIfNeeded();
      await buttons[i].click();
      await page.waitForTimeout(CONFIG.clickDelay);

      if ((i + 1) % 10 === 0) {
        console.log(`  Expanded ${i + 1}/${buttons.length}`);
      }
    } catch (e) {
      console.log(`  Failed to expand item ${i + 1}: ${e.message}`);
    }
  }
}

async function extractData(page) {
  console.log('Extracting data...');

  const data = await page.$$eval(SELECTORS.item, (items, selectors) => {
    return items.map(item => {
      const result = {};

      {{EXTRACTION_LOGIC}}

      return result;
    });
  }, SELECTORS);

  console.log(`  Extracted ${data.length} items`);
  return data;
}

async function main() {
  console.log(`Starting scrape of ${CONFIG.url}`);
  console.log('='.repeat(50));

  const browser = await chromium.launch({ headless: CONFIG.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to page
    console.log('Navigating to page...');
    await page.goto(CONFIG.url, {
      waitUntil: 'networkidle',
      timeout: CONFIG.timeout,
    });

    // Wait for content to load
    console.log('Waiting for content...');
    await page.waitForSelector(SELECTORS.item, { timeout: CONFIG.timeout });

    // Scroll to load all content (for lazy loading)
    {{SCROLL_SECTION}}

    // Expand all items (for click-to-expand patterns)
    {{EXPAND_SECTION}}

    // Extract data
    const data = await extractData(page);

    // Save results
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(data, null, 2));
    console.log('='.repeat(50));
    console.log(`Success! Saved ${data.length} items to ${CONFIG.outputFile}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
```

## Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{URL}}` | Target URL | `https://example.com/page` |
| `{{OUTPUT_FILE}}` | Output filename | `data.json` |
| `{{CONTAINER_SELECTOR}}` | Container element | `.card-list` |
| `{{ITEM_SELECTOR}}` | Repeating item | `.card-item` |
| `{{FIELD_SELECTORS}}` | Field selectors object | `name: '.card__name'` |
| `{{ACTION_SELECTORS}}` | Action button selectors | `expandButton: 'button.expand'` |
| `{{EXTRACTION_LOGIC}}` | Data extraction code | See examples below |
| `{{SCROLL_SECTION}}` | Scroll handling code | `await scrollToLoadAll(page);` |
| `{{EXPAND_SECTION}}` | Expand handling code | `await expandAllItems(page);` |

## Extraction Logic Examples

### Simple field extraction
```javascript
result.name = item.querySelector('.card__name')?.textContent?.trim();
result.description = item.querySelector('.card__desc')?.textContent?.trim();
result.url = item.querySelector('a')?.href;
```

### dt/dd pattern extraction
```javascript
const infoItems = item.querySelectorAll('.info-item');
infoItems.forEach(info => {
  const label = info.querySelector('dt')?.textContent?.trim().toLowerCase();
  const value = info.querySelector('dd')?.textContent?.trim();
  if (label && value) {
    result[label.replace(/[^a-z0-9]/g, '_')] = value;
  }
});
```

### Nested data extraction
```javascript
result.tags = Array.from(item.querySelectorAll('.tag'))
  .map(tag => tag.textContent?.trim())
  .filter(Boolean);
```

## Conditional Sections

### With scroll handling
```javascript
// Scroll to load all content (for lazy loading)
await scrollToLoadAll(page);
```

### Without scroll handling
```javascript
// No scroll handling needed for static content
```

### With expand handling
```javascript
// Expand all items (for click-to-expand patterns)
await expandAllItems(page);
```

### Without expand handling
```javascript
// No expand handling needed
```

## Output Formats

### JSON (default)
```javascript
fs.writeFileSync(CONFIG.outputFile, JSON.stringify(data, null, 2));
```

### CSV
```javascript
const headers = Object.keys(data[0]).join(',');
const rows = data.map(item =>
  Object.values(item).map(v =>
    `"${String(v).replace(/"/g, '""')}"`
  ).join(',')
);
fs.writeFileSync(CONFIG.outputFile, [headers, ...rows].join('\n'));
```
