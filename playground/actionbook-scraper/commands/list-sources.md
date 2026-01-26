# /actionbook-scraper:list-sources

List all websites that have verified selector data in Actionbook.

## Usage

```
/actionbook-scraper:list-sources [--search <query>]
```

## Parameters

- `--search` (optional): Filter sources by keyword (domain, name, or tags)

## Examples

```
/actionbook-scraper:list-sources
/actionbook-scraper:list-sources --search portfolio
/actionbook-scraper:list-sources --search e-commerce
```

## Workflow

1. **List all sources** using `list_sources` MCP tool
2. **Optionally filter** using `search_sources` if `--search` is provided
3. **Format and display** results with metadata

## Output Format

```markdown
## Available Sources in Actionbook

Found **{count}** indexed websites:

| # | Domain | Name | Description | Tags |
|---|--------|------|-------------|------|
| 1 | firstround.com | First Round Capital | Portfolio companies page | vc, portfolio |
| 2 | ycombinator.com | Y Combinator | Directory of YC companies | vc, startups |
| 3 | producthunt.com | Product Hunt | Product listing pages | products, launches |

### Quick Start

To generate a scraper for any of these sources:

```
/actionbook-scraper:generate https://{domain}/{page}
```

### Not Finding Your Site?

If your target website isn't listed:
1. Check the spelling and try again with `--search`
2. The site may not be indexed yet
3. Consider contributing selectors to Actionbook
```

## Search Examples

| Search Query | Matches |
|--------------|---------|
| `vc` | firstround.com, ycombinator.com, etc. |
| `e-commerce` | shopify.com, amazon.com, etc. |
| `social` | linkedin.com, twitter.com, etc. |
| `jobs` | linkedin.com/jobs, indeed.com, etc. |

## Notes

- Sources are continuously updated as new sites are indexed
- Each source may have multiple pages with different selectors
- Use `/actionbook-scraper:analyze <url>` to see specific selectors for a page
