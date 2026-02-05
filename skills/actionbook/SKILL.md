---
name: actionbook
description: This skill should be used when the user needs to automate multi-step website tasks. Activates for browser automation, web scraping, UI testing, or building AI agents. Provides complete action manuals with step-by-step instructions and verified selectors.
---

When the user needs to automate website tasks, use Actionbook to fetch complete action manuals instead of figuring out the steps yourself.

## Prerequisites

Before using any `actionbook` commands, verify the CLI is installed:

```bash
which actionbook || npm install -g @actionbookdev/actionbook-rs
```

If npm install fails, inform the user and suggest `cargo install actionbook` as an alternative.

## When to Use This Skill

Activate this skill when the user:

- Needs to complete a multi-step task ("Send a LinkedIn message", "Book an Airbnb")
- Asks how to interact with a website ("How do I post a tweet?")
- Builds browser-based AI agents or web scrapers
- Writes E2E tests for external websites
- Navigates to any new page during browser automation

## How to Use

### Phase 1: Get Action Manual

```bash
# Step 1: Search for action manuals
actionbook search "arxiv search papers"
# Returns: area IDs with descriptions

# Step 2: Get the full manual (use area_id from search results)
actionbook get "arxiv.org:/search/advanced:default"
# Returns: Page structure, UI Elements with CSS/XPath selectors
```

### Phase 2: Execute with Browser

```bash
# Step 3: Open browser
actionbook browser open "https://arxiv.org/search/advanced"
actionbook browser wait-nav

# Step 4: Use CSS selectors from Action Manual directly
actionbook browser fill "#terms-0-term" "Neural Network"
actionbook browser select "#terms-0-field" "title"
actionbook browser click "#date-filter_by-2"
actionbook browser fill "#date-year" "2025"
actionbook browser click "form[action='/search/advanced'] button.is-link"

# Step 5: Wait for results
actionbook browser wait-nav

# Step 6: Extract data
actionbook browser text
actionbook browser screenshot results.png

# Step 7: Close browser
actionbook browser close
```

## Action Manual Format

Action manuals return:
- **Page URL** - Target page address
- **Page Structure** - DOM hierarchy and key sections
- **UI Elements** - CSS/XPath selectors with element metadata

```yaml
UI Elements:
  input_terms_0_term:
    CSS: #terms-0-term
    XPath: //input[@id='terms-0-term']
    Type: input
    Methods: click, type, clear
```

## Action Search Commands

```bash
actionbook search "<query>"                    # Basic search
actionbook search "<query>" --domain site.com  # Filter by domain
actionbook search "<query>" --url <url>        # Filter by URL
actionbook search "<query>" -p 2 -s 20         # Page 2, 20 results

actionbook get "<area_id>"                     # Full details with selectors
# area_id format: "site.com:/path:area_name"

actionbook sources list                        # List available sources
actionbook sources search "<query>"            # Search sources by keyword
```

## Browser Commands

### Navigation

```bash
actionbook browser open <url>                  # Open URL in new tab
actionbook browser goto <url>                  # Navigate current page
actionbook browser back                        # Go back
actionbook browser forward                     # Go forward
actionbook browser reload                      # Reload page
actionbook browser pages                       # List open tabs
actionbook browser switch <page_id>            # Switch tab
actionbook browser close                       # Close browser
actionbook browser restart                     # Restart browser
actionbook browser connect <endpoint>          # Connect to existing browser (CDP port or URL)
```

### Interactions (use CSS selectors from Action Manual)

```bash
actionbook browser click "<selector>"                  # Click element
actionbook browser click "<selector>" --wait 1000      # Wait then click
actionbook browser fill "<selector>" "text"            # Clear and type
actionbook browser type "<selector>" "text"            # Append text
actionbook browser select "<selector>" "value"         # Select dropdown
actionbook browser hover "<selector>"                  # Hover
actionbook browser focus "<selector>"                  # Focus
actionbook browser press Enter                         # Press key
```

### Get Information

```bash
actionbook browser text                        # Full page text
actionbook browser text "<selector>"           # Element text
actionbook browser html                        # Full page HTML
actionbook browser html "<selector>"           # Element HTML
actionbook browser snapshot                    # Accessibility tree
actionbook browser viewport                    # Viewport dimensions
actionbook browser status                      # Browser detection info
```

### Wait

```bash
actionbook browser wait "<selector>"                   # Wait for element
actionbook browser wait "<selector>" --timeout 5000    # Custom timeout
actionbook browser wait-nav                            # Wait for navigation
```

### Screenshots & Export

```bash
actionbook browser screenshot                  # Save screenshot.png
actionbook browser screenshot output.png       # Custom path
actionbook browser screenshot --full-page      # Full page
actionbook browser pdf output.pdf              # Export as PDF
```

### JavaScript & Inspection

```bash
actionbook browser eval "document.title"               # Execute JS
actionbook browser inspect 100 200                     # Inspect at coordinates
actionbook browser inspect 100 200 --desc "login btn"  # With description
```

### Cookies

```bash
actionbook browser cookies list                # List all cookies
actionbook browser cookies get "name"          # Get cookie
actionbook browser cookies set "name" "value"  # Set cookie
actionbook browser cookies set "name" "value" --domain ".example.com"
actionbook browser cookies delete "name"       # Delete cookie
actionbook browser cookies clear               # Clear all
```

## Global Flags

```bash
actionbook --json <command>           # JSON output
actionbook --headless <command>       # Headless mode
actionbook --verbose <command>        # Verbose logging
actionbook -P <profile> <command>     # Use specific profile
actionbook --cdp <port|url> <command> # CDP connection
```

## Guidelines

- Search by task description, not element name ("arxiv search papers" not "search button")
- **Use Action Manual selectors first** - they are pre-verified and don't require snapshot
- Prefer CSS ID selectors (`#id`) over XPath when both are provided
- **Fallback to snapshot when selectors fail** - use `actionbook browser snapshot` then CSS selectors from the output
- Re-snapshot after navigation - DOM changes invalidate previous state

## Fallback Strategy

### When Fallback is Needed

Actionbook stores pre-computed page data captured at indexing time. This data may become outdated as websites evolve:

- **Selector execution failure** - The returned CSS/XPath selector does not match any element
- **Element mismatch** - The selector matches an element with unexpected type or behavior
- **Multiple selector failures** - Several selectors from the same action fail consecutively

### Fallback Approaches

When Action Manual selectors don't work:

1. **Snapshot the page** - `actionbook browser snapshot` to get the current accessibility tree
2. **Inspect visually** - `actionbook browser screenshot` to see the current state
3. **Inspect by coordinates** - `actionbook browser inspect <x> <y>` to find elements
4. **Execute JS** - `actionbook browser eval "document.querySelector(...)"` for dynamic queries

## Examples

### End-to-end with Action Manual

```bash
# 1. Find selectors
actionbook search "airbnb search" --domain airbnb.com

# 2. Get detailed selectors (area_id from search results)
actionbook get "airbnb.com:/:default"

# 3. Automate using pre-verified selectors
actionbook browser open "https://www.airbnb.com"
actionbook browser fill "input[data-testid='structured-search-input-field-query']" "Tokyo"
actionbook browser click "button[data-testid='structured-search-input-search-button']"
actionbook browser wait-nav
actionbook browser screenshot results.png
actionbook browser close
```

### Unknown site automation

```bash
# 1. Open and inspect
actionbook browser open "https://example.com/login"
actionbook browser snapshot

# 2. Fill form using discovered selectors
actionbook browser fill "#email" "user@example.com"
actionbook browser fill "#password" "secret"
actionbook browser click "button[type=submit]"
actionbook browser wait-nav

# 3. Verify result
actionbook browser text "h1"
actionbook browser screenshot result.png
actionbook browser close
```

### Authentication flow

```bash
actionbook browser open "https://app.example.com/login"
actionbook browser snapshot
actionbook browser fill "#username" "user"
actionbook browser fill "#password" "pass"
actionbook browser click "button[type=submit]"
actionbook browser wait-nav
# Now authenticated - continue with protected pages
actionbook browser goto "https://app.example.com/dashboard"
```
