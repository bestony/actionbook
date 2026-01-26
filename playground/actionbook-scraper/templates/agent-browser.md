# agent-browser Template

Template for generating and verifying agent-browser scraper scripts.

## Generate → Verify → Fix Loop

**Scripts generated with this template are automatically verified:**

1. Generate agent-browser commands
2. Execute commands to verify they work
3. If failed: analyze error, fix, retry (max 3x)
4. Output verified script + data preview

## Best For

- Quick script generation with auto-verification
- Users who prefer CLI commands
- Integration with other agent-browser workflows

## Requirements

User needs agent-browser CLI installed and configured.

## Base Workflow

```bash
# 1. Open page
agent-browser open "{{URL}}"

# 2. Wait for content
agent-browser wait --load networkidle

# 3. Get page snapshot
agent-browser snapshot -i

# 4. Scroll to load all content (if lazy loading)
{{SCROLL_COMMANDS}}

# 5. Click to expand items (if needed)
{{EXPAND_COMMANDS}}

# 6. Extract data
agent-browser get text "{{CONTAINER_SELECTOR}}"

# 7. Close browser
agent-browser close
```

## Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{URL}}` | Target URL | `https://example.com/page` |
| `{{CONTAINER_SELECTOR}}` | Main data container | `.card-list` |
| `{{ITEM_SELECTOR}}` | Repeating item | `.card-item` |
| `{{SCROLL_COMMANDS}}` | Scroll handling | See below |
| `{{EXPAND_COMMANDS}}` | Click-to-expand | See below |

## Scroll Handling

### For Lazy-Loaded Content

```bash
# Scroll down repeatedly until no new content loads
agent-browser scroll down 1000
agent-browser wait 1000
agent-browser snapshot -i  # Check for new items

# Repeat until item count stabilizes
agent-browser scroll down 1000
agent-browser wait 1000
```

### For Infinite Scroll

```bash
# Get initial count
agent-browser get text ".item-count"  # Or count items manually

# Scroll loop
agent-browser scroll down 2000
agent-browser wait 1500
agent-browser scroll down 2000
agent-browser wait 1500
# Continue until count stops increasing
```

## Expand/Collapse Handling

### Click to Expand Each Item

```bash
# Get snapshot to find expand buttons
agent-browser snapshot -i
# Output: button "Expand" [ref=e1], button "Expand" [ref=e2], ...

# Click each expand button
agent-browser click @e1
agent-browser wait 300
agent-browser click @e2
agent-browser wait 300
# ... continue for all items
```

### Using Selector Instead of Refs

```bash
# Click all matching elements
agent-browser find role button click --name "Expand"
```

## Data Extraction Patterns

### Card-Based Layout

```bash
# Get all cards
agent-browser get text ".card-container"

# Or get specific fields
agent-browser get text ".card__name"
agent-browser get text ".card__description"
```

### Table Layout

```bash
# Get entire table
agent-browser get text "table"

# Or specific columns
agent-browser get text "td:nth-child(1)"  # First column
agent-browser get text "td:nth-child(2)"  # Second column
```

### List Layout

```bash
# Get all list items
agent-browser get text "ul.items li"
```

## Example: First Round Companies

```bash
# Open page
agent-browser open "https://firstround.com/companies"
agent-browser wait --load networkidle

# Wait for cards
agent-browser wait ".company-list-card-small"

# Scroll to load all (lazy loading)
agent-browser scroll down 2000
agent-browser wait 1500
agent-browser scroll down 2000
agent-browser wait 1500
# ... continue until all loaded

# Get snapshot to find expand buttons
agent-browser snapshot -i

# Click to expand each card (using refs from snapshot)
agent-browser click @e1
agent-browser wait 300
# ... repeat for all cards

# Extract data
agent-browser get text ".company-list-card-small"

# Close
agent-browser close
```

## Error Handling

### Element Not Found

```bash
# Try waiting longer
agent-browser wait ".selector" --timeout 10000

# Or re-snapshot to check page state
agent-browser snapshot -i
```

### Page Load Timeout

```bash
# Reload and try again
agent-browser reload
agent-browser wait --load networkidle
```

### Dynamic Content Not Loading

```bash
# Trigger scroll event
agent-browser scroll down 100
agent-browser scroll up 100
agent-browser wait 1000
```

## Output Processing

The agent collects text output and structures it into JSON/CSV format:

```markdown
## Raw Output
```
Company A
Building the future...
https://companya.com
2020

Company B
Platform for...
https://companyb.com
2019
```

## Structured Output
```json
[
  {
    "name": "Company A",
    "description": "Building the future...",
    "website": "https://companya.com",
    "year": "2020"
  },
  ...
]
```
```

## Comparison with Playwright

| Aspect | agent-browser | Playwright |
|--------|---------------|------------|
| Execution | Real-time in Claude | Standalone script |
| Error handling | Claude adapts | User must debug |
| Output | Immediate | After script runs |
| Reusability | Session-based | Save script |
| Dependencies | None (MCP) | npm install |
