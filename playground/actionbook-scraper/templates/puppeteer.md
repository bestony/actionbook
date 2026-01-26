# Puppeteer Template

Template for generating Node.js scraper scripts using Puppeteer.

## Best For

- Simple static pages
- Lightweight scraping tasks
- Projects already using Puppeteer
- Quick extraction without complex interactions

## Dependencies

```bash
npm install puppeteer
```

## Base Template

```javascript
const puppeteer = require('puppeteer');
const fs = require('fs');

// Configuration
const CONFIG = {
  url: '{{URL}}',
  outputFile: '{{OUTPUT_FILE}}',
  headless: 'new',
  timeout: 30000,
};

// Selectors from Actionbook
const SELECTORS = {
  container: '{{CONTAINER_SELECTOR}}',
  item: '{{ITEM_SELECTOR}}',
  // Field selectors
  {{FIELD_SELECTORS}}
};

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

  const browser = await puppeteer.launch({ headless: CONFIG.headless });
  const page = await browser.newPage();

  try {
    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });

    // Navigate to page
    console.log('Navigating to page...');
    await page.goto(CONFIG.url, {
      waitUntil: 'networkidle2',
      timeout: CONFIG.timeout,
    });

    // Wait for content to load
    console.log('Waiting for content...');
    await page.waitForSelector(SELECTORS.item, { timeout: CONFIG.timeout });

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
| `{{EXTRACTION_LOGIC}}` | Data extraction code | See examples below |

## Extraction Logic Examples

### Simple field extraction
```javascript
result.name = item.querySelector('.card__name')?.textContent?.trim();
result.description = item.querySelector('.card__desc')?.textContent?.trim();
result.url = item.querySelector('a')?.href;
result.image = item.querySelector('img')?.src;
```

### Table row extraction
```javascript
const cells = item.querySelectorAll('td');
result.col1 = cells[0]?.textContent?.trim();
result.col2 = cells[1]?.textContent?.trim();
result.col3 = cells[2]?.textContent?.trim();
```

### List extraction
```javascript
result.title = item.querySelector('.title')?.textContent?.trim();
result.items = Array.from(item.querySelectorAll('.list-item'))
  .map(li => li.textContent?.trim())
  .filter(Boolean);
```

## Extended Template (with scroll support)

For pages that need scroll handling:

```javascript
const puppeteer = require('puppeteer');
const fs = require('fs');

const CONFIG = {
  url: '{{URL}}',
  outputFile: '{{OUTPUT_FILE}}',
  headless: 'new',
  timeout: 30000,
  scrollDelay: 1000,
};

const SELECTORS = {
  item: '{{ITEM_SELECTOR}}',
  {{FIELD_SELECTORS}}
};

async function autoScroll(page) {
  console.log('Scrolling to load all content...');

  await page.evaluate(async (scrollDelay) => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, scrollDelay);
    });
  }, CONFIG.scrollDelay);

  console.log('Finished scrolling');
}

async function main() {
  const browser = await puppeteer.launch({ headless: CONFIG.headless });
  const page = await browser.newPage();

  try {
    await page.goto(CONFIG.url, { waitUntil: 'networkidle2' });
    await page.waitForSelector(SELECTORS.item);

    // Scroll to load all content
    await autoScroll(page);

    // Extract data
    const data = await page.$$eval(SELECTORS.item, (items) => {
      return items.map(item => ({
        {{INLINE_EXTRACTION}}
      }));
    });

    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(data, null, 2));
    console.log(`Saved ${data.length} items`);

  } finally {
    await browser.close();
  }
}

main();
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
    `"${String(v || '').replace(/"/g, '""')}"`
  ).join(',')
);
fs.writeFileSync(CONFIG.outputFile, [headers, ...rows].join('\n'));
```

### NDJSON (newline-delimited JSON)
```javascript
const ndjson = data.map(item => JSON.stringify(item)).join('\n');
fs.writeFileSync(CONFIG.outputFile, ndjson);
```

## Puppeteer vs Playwright

| Feature | Puppeteer | Playwright |
|---------|-----------|------------|
| Browser support | Chrome/Chromium | Chrome, Firefox, Safari |
| Auto-wait | Manual | Built-in |
| Network interception | Yes | Yes (better API) |
| File size | Smaller | Larger |
| Best for | Simple tasks | Complex interactions |

## When to Choose Puppeteer

1. **Static pages** - Content loads without JavaScript
2. **Simple extraction** - No clicks, scrolls, or complex waits needed
3. **Lightweight needs** - Smaller dependency footprint
4. **Existing codebase** - Already using Puppeteer
5. **Chrome only** - No need for cross-browser support
