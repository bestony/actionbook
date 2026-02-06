/// SKILL.md template for Claude Code integration
pub const CLAUDE_SKILL_TEMPLATE: &str = r#"---
name: actionbook
version: 1.0
description: Query Actionbook for website action manuals (selectors, methods, flows)
---

# Actionbook Skill

## When to Use

- User asks to automate a website (e.g. "book an Airbnb", "search on Google")
- You need reliable CSS/XPath selectors for a website
- You need step-by-step operation flows for a web page
- Before writing browser automation code (Playwright, Puppeteer, etc.)

## How to Use

### Search for actions
```bash
actionbook search "<goal>" --json
```
Example: `actionbook search "airbnb search listings" --json`

### Get action details by area ID
```bash
actionbook get "<area_id>" --json
```
Example: `actionbook get "airbnb.com:/:default" --json`

## Typical Workflow

1. `actionbook search "<what the user wants to do>" --json` to find relevant actions
2. Review returned area IDs and pick the best match
3. `actionbook get "<area_id>" --json` to get full selectors and methods
4. Use the returned selectors in your automation code

## Response Format

Always use `--json` flag for structured output that you can parse programmatically.

## Safety

- Actionbook is **read-only** - it returns selectors and instructions, never executes actions
- All selectors are community-verified
- Never hardcode selectors; always query Actionbook for up-to-date values
"#;

/// SKILL.md template for Codex (OpenAI) integration
pub const CODEX_SKILL_TEMPLATE: &str = r#"---
name: actionbook
version: 1.0
description: Query Actionbook for website action manuals
---

# Actionbook Skill

## Purpose

Provides accurate, real-time website operation information (element selectors, operation methods, page structure) for browser automation tasks.

## Trigger Conditions

- User requests website automation
- You need CSS/XPath selectors for interactive elements
- You need to understand a website's page structure before automating

## Commands

### Search for actions
```bash
actionbook search "<goal>" --json
```

### Get action details
```bash
actionbook get "<area_id>" --json
```

## Response Format

Always pass `--json` for machine-readable output. Parse the JSON to extract:
- `selectors`: CSS, XPath, aria-label, data-testid
- `methods`: click, type, select, hover, etc.
- `steps`: ordered operation sequence for scenarios

## Constraints

- Read-only: Actionbook provides information, never executes browser actions
- Always use `--json` flag
- Prefer `actionbook search` first, then `actionbook get` for details
"#;

/// Rules template for Cursor integration
pub const CURSOR_RULES_TEMPLATE: &str = r#"# Actionbook Rules

## When to Invoke

- User asks to automate or interact with a website
- You need element selectors (CSS, XPath, aria-label)
- You need step-by-step browser operation flows
- Before writing Playwright, Puppeteer, or Selenium code

## How to Invoke

Search for actions:
```bash
actionbook search "<goal>" --json
```

Get action details by area ID:
```bash
actionbook get "<area_id>" --json
```

## How to Present Results

1. Show the user which actions were found
2. Use returned selectors directly in automation code
3. Follow the step ordering from scenario flows

## Constraints

- Always use `--json` flag for structured output
- Actionbook is read-only - it provides selectors, never executes actions
- Query Actionbook every time; do not cache or hardcode selectors
- Search first (`actionbook search`), then get details (`actionbook get`)
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_claude_template_not_empty() {
        assert!(!CLAUDE_SKILL_TEMPLATE.is_empty());
        assert!(CLAUDE_SKILL_TEMPLATE.contains("actionbook search"));
        assert!(CLAUDE_SKILL_TEMPLATE.contains("actionbook get"));
        assert!(CLAUDE_SKILL_TEMPLATE.contains("--json"));
    }

    #[test]
    fn test_codex_template_not_empty() {
        assert!(!CODEX_SKILL_TEMPLATE.is_empty());
        assert!(CODEX_SKILL_TEMPLATE.contains("actionbook search"));
        assert!(CODEX_SKILL_TEMPLATE.contains("actionbook get"));
        assert!(CODEX_SKILL_TEMPLATE.contains("--json"));
    }

    #[test]
    fn test_cursor_template_not_empty() {
        assert!(!CURSOR_RULES_TEMPLATE.is_empty());
        assert!(CURSOR_RULES_TEMPLATE.contains("actionbook search"));
        assert!(CURSOR_RULES_TEMPLATE.contains("actionbook get"));
        assert!(CURSOR_RULES_TEMPLATE.contains("--json"));
    }
}
