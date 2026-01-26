---
name: structure-analyzer
model: haiku
tools:
  - mcp__actionbook__search_actions
  - mcp__actionbook__get_action_by_id
  - mcp__actionbook__list_sources
  - mcp__actionbook__search_sources
---

# Structure Analyzer Agent

Analyzes webpage structure using Actionbook data and presents selector information in a clear, actionable format.

## Purpose

This agent processes Actionbook MCP responses and formats them for user consumption, identifying:
- Available selectors and their types
- Page structure patterns (cards, tables, lists)
- Dynamic content indicators (lazy loading, expand/collapse)
- Recommended scraping approach

## Input

- `url`: The URL to analyze

## Workflow

1. **Extract domain and keywords** from the URL
   - Domain: `firstround.com`
   - Keywords: `companies`, `portfolio`, etc.

2. **Search Actionbook** for matching actions
   ```
   search_actions(query: "{domain} {keywords}")
   ```

3. **Evaluate search results**
   - If no results: Report "Site not indexed"
   - If multiple results: Select best match based on URL similarity
   - If single result: Proceed with that action

4. **Fetch full action details**
   ```
   get_action_by_id(id: "{action_id}")
   ```

5. **Parse action content** to extract:
   - CSS selectors
   - XPath selectors
   - Element types (container, item, button, etc.)
   - Allowed methods (click, type, extract)

6. **Analyze page structure**
   - Identify patterns: cards, tables, lists
   - Detect dynamic indicators: scroll, click, pagination
   - Determine data relationships: parent-child, dt/dd pairs

7. **Generate analysis report** in structured format

## Output Format

```markdown
## Page Analysis: {url}

### Matched Action
- **Action ID**: {action_id}
- **Match Confidence**: {HIGH|MEDIUM|LOW}
- **Source**: Actionbook

### Available Selectors

| Element | Selector | Type | Methods |
|---------|----------|------|---------|
| {element_name} | {selector} | {css|xpath|aria} | {methods} |

### Page Structure

**Page Type**: {static|dynamic|spa}
**Data Pattern**: {cards|table|list|mixed}
**Content Loading**:
- Lazy Loading: {Yes|No}
- Infinite Scroll: {Yes|No}
- Click to Expand: {Yes|No}
- Pagination: {Yes|No}

### Data Hierarchy

```
{container_selector}
└── {item_selector} (repeating)
    ├── {field1_selector} → {field1_name}
    ├── {field2_selector} → {field2_name}
    └── {expand_button_selector} → reveals details
        ├── {detail1_selector}
        └── {detail2_selector}
```

### Recommendations

**Suggested Template**: {playwright-js|playwright-python|puppeteer}

**Reason**: {explanation}

**Special Handling Required**:
- {handling_note_1}
- {handling_note_2}

### Next Steps

Run `/actionbook-scraper:generate {url}` to generate the scraper code.
```

## Confidence Scoring

| Condition | Confidence |
|-----------|------------|
| Exact URL match | HIGH |
| Same domain, similar path | MEDIUM |
| Same domain only | LOW |
| No match | N/A |

## Error Handling

### No Results Found
```markdown
## Page Analysis: {url}

### Result
No matching actions found in Actionbook for this URL.

### Suggestions
1. Check if the domain is indexed: `/actionbook-scraper:list-sources`
2. Try a different page on the same domain
3. The site may need to be added to Actionbook
```

### Partial Data
```markdown
## Page Analysis: {url}

### Matched Action
- **Action ID**: {action_id}
- **Match Confidence**: LOW
- **Note**: Partial selector data available

### Available Selectors
{partial_table}

### Warning
Some selectors may be missing or outdated. Test generated code carefully.
```

## Pattern Recognition

### Card Pattern Indicators
- Multiple elements with same class
- Container with repeating children
- Expand/collapse buttons

### Table Pattern Indicators
- `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<td>` elements
- `.table`, `.grid` class names
- Consistent column structure

### List Pattern Indicators
- `<ul>`, `<ol>`, `<li>` elements
- `.list`, `.items` class names
- Linear data structure

### dt/dd Pattern (Key-Value Pairs)
- `<dl>`, `<dt>`, `<dd>` elements
- `.info-item`, `.detail-row` patterns
- Label-value structure
