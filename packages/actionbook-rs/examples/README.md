# Actionbook CLI Examples

This directory contains example scripts demonstrating how to use the Actionbook CLI.

## Examples

### 1. Etsy Valentine's Day Exploration

Demonstrates a complete workflow for exploring Etsy's Valentine's Day content using both the Actionbook API and browser automation.

```bash
# Make executable and run
chmod +x etsy_valentine_exploration.sh
./etsy_valentine_exploration.sh
```

**What it does:**
1. Searches Actionbook database for Etsy-related actions
2. Searches for Valentine's Day content
3. Retrieves detailed action with CSS/XPath selectors
4. Opens Etsy in browser
5. Navigates to Valentine's Day pages
6. Takes screenshots
7. Executes JavaScript to get page title

## Common Workflows

### Search + Get Pattern

The most common pattern for using Actionbook is:

```bash
# 1. Search for actions related to your target site
actionbook search "airbnb login" --limit 5

# 2. Get detailed action with selectors
actionbook get "https://www.airbnb.com/login"

# 3. Use the selectors in your automation
```

### Browser Automation Pattern

```bash
# 1. Open browser with URL
actionbook browser open "https://example.com"

# 2. Interact with elements
actionbook browser click "button.submit"
actionbook browser type "input[name=email]" "user@example.com"
actionbook browser fill "input[name=password]" "secret"

# 3. Wait for navigation
actionbook browser wait ".success-message"

# 4. Take screenshot for verification
actionbook browser screenshot result.png
```

### Actionbook + Browser Combined

```bash
#!/bin/bash
# Use Actionbook selectors to automate login

# Get the action with selectors
ACTION=$(actionbook get "https://www.airbnb.com/login" --json)

# Extract selectors (example with jq)
EMAIL_SELECTOR=$(echo "$ACTION" | jq -r '.elements[] | select(.id=="input_email") | .css')
PASSWORD_SELECTOR=$(echo "$ACTION" | jq -r '.elements[] | select(.id=="input_password") | .css')
SUBMIT_SELECTOR=$(echo "$ACTION" | jq -r '.elements[] | select(.id=="button_submit") | .css')

# Automate the login
actionbook browser open "https://www.airbnb.com/login"
sleep 2
actionbook browser fill "$EMAIL_SELECTOR" "user@example.com"
actionbook browser fill "$PASSWORD_SELECTOR" "password123"
actionbook browser click "$SUBMIT_SELECTOR"
```

## Output Formats

### Default (Human-readable)

```bash
$ actionbook search "etsy" --limit 2

✓ Found 2 results for: etsy

1. ID: https://www.etsy.com/your/shops/me/listing-editor/create
   Score: 1.00
   # Etsy Listing Creation Page

2. ID: https://www.ebay.com/b/{category-name}/bn_{bn-id}
   Score: 0.49
   # Playbook: eBay Brand Outlet Page
```

### JSON Format

```bash
$ actionbook search "etsy" --limit 2 --json

[
  {
    "action_id": "https://www.etsy.com/your/shops/me/listing-editor/create",
    "score": 1.0,
    "content": "# Etsy Listing Creation Page..."
  }
]
```

## Multi-Profile Usage

```bash
# Create profiles for different use cases
actionbook profile create personal
actionbook profile create work

# Use specific profile
actionbook --profile work browser open "https://work-app.com"
actionbook --profile personal browser open "https://social-media.com"

# Each profile has isolated:
# - Cookies
# - Local storage
# - Browser history
# - Session data
```

## Environment Variables

```bash
# Set API endpoint
export ACTIONBOOK_API_URL="https://api.actionbook.dev"

# Run in headless mode
export ACTIONBOOK_HEADLESS=true

# Connect to existing browser
export ACTIONBOOK_CDP_PORT=9222

# Now commands use these settings
actionbook browser open "https://example.com"
```

## Tips

1. **Use `--json` for scripting** - Easier to parse in scripts
2. **Use profiles for isolation** - Keep work/personal sessions separate
3. **Check browser status first** - `actionbook browser status` shows connection info
4. **Combine search + get** - Search finds actions, get retrieves selectors
5. **Use headless for CI/CD** - Add `--headless` flag for automated pipelines
