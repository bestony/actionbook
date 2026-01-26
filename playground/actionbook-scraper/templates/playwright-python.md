# Playwright Python Template

Template for generating Python scraper scripts using Playwright.

## Best For

- Python-based projects
- Data science workflows
- Integration with pandas/numpy
- Same capabilities as playwright-js

## Dependencies

```bash
pip install playwright
playwright install chromium
```

## Base Template

```python
import json
import asyncio
from playwright.async_api import async_playwright

# Configuration
CONFIG = {
    'url': '{{URL}}',
    'output_file': '{{OUTPUT_FILE}}',
    'headless': True,
    'timeout': 30000,
    'scroll_delay': 1000,
    'click_delay': 300,
}

# Selectors from Actionbook
SELECTORS = {
    'container': '{{CONTAINER_SELECTOR}}',
    'item': '{{ITEM_SELECTOR}}',
    # Field selectors
    {{FIELD_SELECTORS}}
    # Action selectors
    {{ACTION_SELECTORS}}
}


async def scroll_to_load_all(page):
    """Scroll to load all lazy-loaded content."""
    print('Scrolling to load all content...')
    previous_height = 0
    current_height = await page.evaluate('document.body.scrollHeight')
    scroll_count = 0

    while previous_height != current_height:
        previous_height = current_height
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        await page.wait_for_timeout(CONFIG['scroll_delay'])
        current_height = await page.evaluate('document.body.scrollHeight')
        scroll_count += 1
        print(f'  Scroll {scroll_count}: height {current_height}px')

    print(f'Finished scrolling after {scroll_count} scrolls')


async def expand_all_items(page):
    """Click to expand all items."""
    if 'expand_button' not in SELECTORS:
        return

    print('Expanding all items...')
    buttons = await page.query_selector_all(SELECTORS['expand_button'])
    print(f'  Found {len(buttons)} items to expand')

    for i, button in enumerate(buttons):
        try:
            await button.scroll_into_view_if_needed()
            await button.click()
            await page.wait_for_timeout(CONFIG['click_delay'])

            if (i + 1) % 10 == 0:
                print(f'  Expanded {i + 1}/{len(buttons)}')
        except Exception as e:
            print(f'  Failed to expand item {i + 1}: {e}')


async def extract_data(page):
    """Extract data from all items."""
    print('Extracting data...')

    data = await page.evaluate('''(selectors) => {
        const items = document.querySelectorAll(selectors.item);
        return Array.from(items).map(item => {
            const result = {};

            {{EXTRACTION_LOGIC}}

            return result;
        });
    }''', SELECTORS)

    print(f'  Extracted {len(data)} items')
    return data


async def main():
    print(f"Starting scrape of {CONFIG['url']}")
    print('=' * 50)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=CONFIG['headless'])
        context = await browser.new_context()
        page = await context.new_page()

        try:
            # Navigate to page
            print('Navigating to page...')
            await page.goto(CONFIG['url'], wait_until='networkidle', timeout=CONFIG['timeout'])

            # Wait for content to load
            print('Waiting for content...')
            await page.wait_for_selector(SELECTORS['item'], timeout=CONFIG['timeout'])

            # Scroll to load all content (for lazy loading)
            {{SCROLL_SECTION}}

            # Expand all items (for click-to-expand patterns)
            {{EXPAND_SECTION}}

            # Extract data
            data = await extract_data(page)

            # Save results
            with open(CONFIG['output_file'], 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            print('=' * 50)
            print(f"Success! Saved {len(data)} items to {CONFIG['output_file']}")

        except Exception as error:
            print(f'Error: {error}')
            raise
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
```

## Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{URL}}` | Target URL | `https://example.com/page` |
| `{{OUTPUT_FILE}}` | Output filename | `data.json` |
| `{{CONTAINER_SELECTOR}}` | Container element | `.card-list` |
| `{{ITEM_SELECTOR}}` | Repeating item | `.card-item` |
| `{{FIELD_SELECTORS}}` | Field selectors dict | `'name': '.card__name'` |
| `{{ACTION_SELECTORS}}` | Action button selectors | `'expand_button': 'button.expand'` |
| `{{EXTRACTION_LOGIC}}` | Data extraction JS code | See examples below |
| `{{SCROLL_SECTION}}` | Scroll handling code | `await scroll_to_load_all(page)` |
| `{{EXPAND_SECTION}}` | Expand handling code | `await expand_all_items(page)` |

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

## Conditional Sections

### With scroll handling
```python
await scroll_to_load_all(page)
```

### Without scroll handling
```python
# No scroll handling needed for static content
pass
```

### With expand handling
```python
await expand_all_items(page)
```

### Without expand handling
```python
# No expand handling needed
pass
```

## Output Formats

### JSON (default)
```python
with open(CONFIG['output_file'], 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
```

### CSV (with pandas)
```python
import pandas as pd
df = pd.DataFrame(data)
df.to_csv(CONFIG['output_file'], index=False)
```

## Sync Version

For simpler scripts without async:

```python
from playwright.sync_api import sync_playwright

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto(CONFIG['url'], wait_until='networkidle')
        page.wait_for_selector(SELECTORS['item'])

        # ... rest of logic

        browser.close()

if __name__ == '__main__':
    main()
```
