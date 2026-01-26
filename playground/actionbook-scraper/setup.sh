#!/bin/bash
# actionbook-scraper setup script
# Run this in your project directory to configure required permissions

set -e

echo "=================================="
echo "Actionbook Scraper Plugin Setup"
echo "=================================="
echo ""

# Create .claude directory if not exists
mkdir -p .claude

# Check if settings.local.json exists
if [ -f ".claude/settings.local.json" ]; then
    # Check if permissions already configured
    if grep -q "agent-browser" .claude/settings.local.json 2>/dev/null; then
        echo "✓ Permissions already configured"
        echo ""
        echo "Plugin is ready to use!"
        echo ""
        echo "Available commands:"
        echo "  /actionbook-scraper:list-sources      - List indexed websites"
        echo "  /actionbook-scraper:analyze <url>     - Analyze page structure"
        echo "  /actionbook-scraper:generate <url>    - Generate scraper code"
        echo "  /actionbook-scraper:request-website <url> - Request new website"
        exit 0
    fi

    echo "⚠️  .claude/settings.local.json exists."
    echo ""
    echo "Please manually add the following to your existing config:"
    echo ""
    echo '  "permissions": {'
    echo '    "allow": ['
    echo '      "Bash(agent-browser *)"'
    echo '    ]'
    echo '  }'
    echo ""
    exit 1
fi

# Create new settings file
cat > .claude/settings.local.json << 'EOF'
{
  "permissions": {
    "allow": [
      "Bash(agent-browser *)"
    ]
  }
}
EOF

echo "✓ Permissions configured in .claude/settings.local.json"
echo ""
echo "Plugin is ready to use!"
echo ""
echo "Available commands:"
echo "  /actionbook-scraper:list-sources      - List indexed websites"
echo "  /actionbook-scraper:analyze <url>     - Analyze page structure"
echo "  /actionbook-scraper:generate <url>    - Generate scraper code"
echo "  /actionbook-scraper:request-website <url> - Request new website"
echo ""
echo "Quick start:"
echo "  /actionbook-scraper:generate https://firstround.com/companies"
echo ""
echo "Restart Claude to apply permission changes."
