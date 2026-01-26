# /actionbook-scraper:analyze

Analyze a webpage's structure using Actionbook's verified selectors and show available elements for scraping.

## Usage

```
/actionbook-scraper:analyze <url>
```

## Parameters

- `url` (required): The full URL of the page to analyze

## Examples

```
/actionbook-scraper:analyze https://firstround.com/companies
/actionbook-scraper:analyze https://example.com/products
```

## Workflow

1. **Extract domain** from the provided URL
2. **Search Actionbook** using `search_actions` with domain and page keywords
3. **Fetch full details** using `get_action_by_id` for the best matching action
4. **Launch structure-analyzer agent** to process and format the results
5. **Present findings** with selector table and recommendations

## Agent

This command uses the **structure-analyzer** agent (haiku model) for processing.

## Output Format

```markdown
## Page Analysis: {url}

### Matched Action
- **Action ID**: {action_id}
- **Confidence**: HIGH | MEDIUM | LOW

### Available Selectors

| Element | Selector | Type | Methods |
|---------|----------|------|---------|
| Company Card | .card-container | css | click, extract |
| Card Title | .card__title | css | extract |
| Expand Button | button.expand | css | click |

### Page Structure
- **Type**: Dynamic (requires scroll)
- **Data Pattern**: Card-based with expand/collapse
- **Lazy Loading**: Yes
- **Expand/Collapse**: Yes

### Recommendations
- **Suggested Template**: playwright-js
- **Special Handling**: Scroll to load all cards, click to expand each
- **Estimated Items**: ~200 cards
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "No matching actions found" | Site not indexed | Try `/actionbook-scraper:list-sources` to see available sites |
| "Multiple matches found" | Ambiguous search | Results will show top matches, pick most relevant |
| "Partial data available" | Incomplete indexing | Some selectors may be missing |

## Notes

- Run this command before `/actionbook-scraper:generate` to understand the page structure
- Check the confidence level to gauge selector reliability
- Review the page type to understand what template will be suggested
