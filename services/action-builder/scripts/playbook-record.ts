#!/usr/bin/env npx tsx
/**
 * Playbook Mode Record Script
 *
 * Single-page element recording with module classification.
 * Supports:
 * - Target URL pattern filtering
 * - Auto-scroll for lazy-loaded content
 * - Page module classification (header, footer, main, etc.)
 * - go_back for navigation control
 *
 * Usage:
 *   npx tsx scripts/playbook-record.ts <url> [options]
 *
 * Options:
 *   --scenario <text>     Page description/scenario (required)
 *   --pattern <regex>     Target URL pattern (optional, e.g., "^/search")
 *   --no-scroll           Disable auto-scroll to bottom
 *   --headless            Run in headless mode
 *   --output <dir>        Output directory (default: ./output)
 *
 * Examples:
 *   npx tsx scripts/playbook-record.ts "https://www.airbnb.com/" --scenario "Airbnb homepage with search form"
 *   npx tsx scripts/playbook-record.ts "https://example.com/search" --scenario "Search results page" --pattern "^/search"
 */

import { ActionBuilder } from "../src/ActionBuilder.js";
import type { StepEvent } from "../src/types/index.js";

// Simple argument parsing
function parseArgs(): {
  url: string;
  scenario: string;
  pattern?: string;
  autoScroll: boolean;
  headless: boolean;
  outputDir: string;
} {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
Playbook Mode Record Script

Usage:
  npx tsx scripts/playbook-record.ts <url> [options]

Options:
  --scenario <text>     Page description/scenario (required)
  --pattern <regex>     Target URL pattern (optional)
  --no-scroll           Disable auto-scroll to bottom
  --headless            Run in headless mode
  --output <dir>        Output directory (default: ./output)

Examples:
  npx tsx scripts/playbook-record.ts "https://www.airbnb.com/" --scenario "Airbnb homepage"
  npx tsx scripts/playbook-record.ts "https://example.com/search" --scenario "Search page" --pattern "^/search"
`);
    process.exit(0);
  }

  const url = args[0];
  let scenario = "";
  let pattern: string | undefined;
  let autoScroll = true;
  let headless = false;
  let outputDir = "./output";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--scenario":
        scenario = args[++i] || "";
        break;
      case "--pattern":
        pattern = args[++i];
        break;
      case "--no-scroll":
        autoScroll = false;
        break;
      case "--headless":
        headless = true;
        break;
      case "--output":
        outputDir = args[++i] || "./output";
        break;
    }
  }

  if (!scenario) {
    console.error("Error: --scenario is required");
    process.exit(1);
  }

  return { url, scenario, pattern, autoScroll, headless, outputDir };
}

// Playbook mode system prompt
const PLAYBOOK_SYSTEM_PROMPT = `You are a web automation capability recorder in PLAYBOOK MODE.

## Your Goal
Discover and record ALL interactive UI elements on a SINGLE PAGE, organized by page modules.

## Available Tools

- **navigate**: Go to a URL
- **scroll_to_bottom**: Scroll to page bottom to load lazy-loaded content (CALL THIS FIRST on pages with lazy loading)
- **observe_page**: Scan the page to discover elements
  - Use \`module\` parameter: header, footer, sidebar, navibar, main, modal, breadcrumb, tab, or "all"
- **register_element**: Register an element's capability (see required parameters below)
- **set_page_context**: Set the current page type
- **go_back**: Return to previous page if you navigated away accidentally
- **wait**: Wait for content
- **scroll**: Scroll incrementally

## register_element Parameters (CRITICAL)

When calling register_element, you MUST provide these parameters:

**Required:**
- \`element_id\`: Unique identifier in snake_case (e.g., "header_search_button")
- \`description\`: Clear description of what the element does
- \`element_type\`: One of: button, link, input, select, checkbox, radio, text, heading, image, container, list, list_item, other
- \`allow_methods\`: Array of allowed methods: ["click"], ["type", "clear"], ["extract"], etc.
- \`module\`: **MUST SPECIFY** - One of: header, footer, sidebar, navibar, main, modal, breadcrumb, tab, unknown

**Optional but recommended:**
- \`css_selector\`: CSS selector if known
- \`xpath_selector\`: XPath selector from observe_page result
- \`aria_label\`: ARIA label for accessibility
- \`leads_to\`: Page type this element navigates to (for links/buttons)

**Example register_element call:**
\`\`\`json
{
  "element_id": "header_search_button",
  "description": "Search submit button in the header",
  "element_type": "button",
  "allow_methods": ["click"],
  "module": "header",
  "aria_label": "Search"
}
\`\`\`

## Recording Strategy (CRITICAL - FOLLOW EXACTLY)

1. **Navigate** to the target URL
2. **Set page context** with page_type and description
3. **scroll_to_bottom** to load lazy content (if page has lazy loading)
4. **For EACH module, IMMEDIATELY register elements after observing:**

   a) observe_page(focus: "header elements", module: "header")
   b) **IMMEDIATELY call register_element for EACH discovered element** (batch in same response)
      - Set module: "header" for all header elements

   c) observe_page(focus: "navibar elements", module: "navibar")
   d) **IMMEDIATELY register those elements** with module: "navibar"

   e) observe_page(focus: "main content elements", module: "main")
   f) **IMMEDIATELY register those elements** with module: "main"

   ...and so on for footer, sidebar, etc.

**CRITICAL**: You MUST call register_element after EACH observe_page. Do NOT do all observations first - you will run out of turns!

## Module Classification Guide

- **header**: Logo, top nav, user menu, search in header area (typically at the very top)
- **navibar**: Primary navigation menu, main nav links (may be part of header or standalone)
- **sidebar**: Side filters, category lists, secondary nav (left or right side panels)
- **main**: Primary content - articles, product lists, search results, forms (center content area)
- **footer**: Footer links, copyright, social icons (bottom of page)
- **modal**: Popups, dialogs, overlays (if any appear)
- **breadcrumb**: Breadcrumb navigation path
- **tab**: Tab panels, tab navigation
- **unknown**: Elements that don't fit other categories (use sparingly)

## Key Rules

1. **ALWAYS set module** - Every register_element call MUST include the module parameter
2. **ALWAYS register elements** - Never just observe! After each observe_page, IMMEDIATELY call register_element
3. **Batch register_element calls** - Register 5-15 elements per response
4. **Focus on ONE page** - don't navigate to other pages unless needed
5. **Use go_back** if you accidentally navigate away
6. **Priority elements**: Focus on actionable elements (buttons, links, inputs, forms) over static content
7. **Skip duplicates**: If an element was already registered, skip it

## Element ID Naming Convention

Use snake_case with module prefix:
- header_logo, header_search_input, header_user_menu
- nav_home_link, nav_products_link
- main_search_button, main_product_list
- footer_contact_link, footer_social_twitter
`;

async function runPlaybookRecord(): Promise<void> {
  const config = parseArgs();

  console.log("=".repeat(60));
  console.log("Playbook Mode Recording");
  console.log("=".repeat(60));
  console.log(`URL: ${config.url}`);
  console.log(`Scenario: ${config.scenario}`);
  if (config.pattern) {
    console.log(`Target Pattern: ${config.pattern}`);
  }
  console.log(`Auto Scroll: ${config.autoScroll}`);
  console.log(`Headless: ${config.headless}`);
  console.log(`Output: ${config.outputDir}`);
  console.log("=".repeat(60));

  // Track progress
  let stepCount = 0;
  const moduleStats: Record<string, number> = {};

  const builder = new ActionBuilder({
    outputDir: config.outputDir,
    headless: config.headless,
    maxTurns: 40, // Increased for complex pages with many elements
    databaseUrl: process.env.DATABASE_URL,
    onStepFinish: (event: StepEvent) => {
      stepCount++;
      const status = event.success ? "\u2705" : "\u274c";
      console.log(`\n${status} Step ${stepCount}: ${event.toolName} (${event.durationMs}ms)`);

      // Track module stats from register_element calls
      if (event.toolName === "register_element" && event.success) {
        const args = event.toolArgs as { module?: string; element_id?: string };
        const module = args.module || "unknown";
        moduleStats[module] = (moduleStats[module] || 0) + 1;
        console.log(`   Element: ${args.element_id} [${module}]`);
      } else if (event.toolName === "scroll_to_bottom") {
        console.log(`   Scrolled to bottom for lazy loading`);
      } else if (event.toolName === "go_back") {
        console.log(`   Navigated back`);
      } else if (event.toolName === "observe_page") {
        const args = event.toolArgs as { focus?: string; module?: string };
        console.log(`   Focus: ${args.focus || "all"}`);
        if (args.module) {
          console.log(`   Module: ${args.module}`);
        }
      }

      if (event.error) {
        console.log(`   Error: ${event.error}`);
      }
    },
  });

  // Generate domain name from URL
  const urlObj = new URL(config.url);
  const domainName = urlObj.hostname.replace(/^www\./, "").replace(/\./g, "_");
  const scenarioId = `${domainName}_playbook_${Date.now()}`;

  // User prompt for playbook mode
  const userPrompt = `## Playbook Mode: Record all UI elements on this page

**Target Page:** ${config.url}

**Page Description:** ${config.scenario}

**Instructions:**

1. Navigate to ${config.url}
2. Set page context with page_type: "${domainName}_main"
3. ${config.autoScroll ? "Call scroll_to_bottom to load any lazy content" : "Skip scrolling (disabled)"}
4. For EACH module, observe THEN IMMEDIATELY register with correct module:

   **HEADER (module: "header"):**
   - observe_page(focus: "header elements", module: "header")
   - IMMEDIATELY call register_element for each header element with module: "header"

   **NAVIBAR (module: "navibar"):**
   - observe_page(focus: "navigation elements", module: "navibar")
   - IMMEDIATELY register navigation elements with module: "navibar"

   **MAIN (module: "main"):**
   - observe_page(focus: "main content elements", module: "main")
   - IMMEDIATELY register main elements with module: "main"

   **SIDEBAR (module: "sidebar") - if present:**
   - observe_page(focus: "sidebar elements", module: "sidebar")
   - IMMEDIATELY register sidebar elements with module: "sidebar"

   **FOOTER (module: "footer"):**
   - observe_page(focus: "footer elements", module: "footer")
   - IMMEDIATELY register footer elements with module: "footer"

5. For EVERY register_element call, you MUST include:
   - element_id: Descriptive snake_case ID (e.g., "header_search_button")
   - description: Clear description of what the element does
   - element_type: button, link, input, select, text, heading, etc.
   - allow_methods: ["click"], ["type", "clear"], ["extract"], etc.
   - **module**: REQUIRED - must match the section you're recording (header, navibar, main, sidebar, footer)

**Example register_element call:**
\`\`\`
register_element({
  element_id: "header_logo",
  description: "Main logo that links to homepage",
  element_type: "link",
  allow_methods: ["click"],
  module: "header"
})
\`\`\`

**CRITICAL:**
- You MUST set module parameter on EVERY register_element call
- You MUST call register_element after EVERY observe_page
- Do NOT do all observations first!

Today's date: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

  try {
    await builder.initialize();

    const result = await builder.build(config.url, scenarioId, {
      siteName: urlObj.hostname,
      siteDescription: config.scenario,
      customSystemPrompt: PLAYBOOK_SYSTEM_PROMPT,
      customUserPrompt: userPrompt,
      // Playbook mode options
      targetUrlPattern: config.pattern,
      autoScrollToBottom: config.autoScroll,
    });

    console.log("\n" + "=".repeat(60));
    console.log("Recording Results");
    console.log("=".repeat(60));

    if (result.success) {
      console.log("\u2705 Playbook recording completed!");
    } else {
      console.log("\u26a0\ufe0f Recording finished with issues");
    }

    console.log(`\ud83d\udcc1 Saved to: ${result.savedPath}`);
    console.log(`\ud83d\udd04 Turns used: ${result.turns}`);
    console.log(`\ud83d\udcb0 Tokens: input=${result.tokens.input}, output=${result.tokens.output}, total=${result.tokens.total}`);
    console.log(`\u23f1\ufe0f Duration: ${result.totalDuration}ms`);
    console.log(`\ud83d\udcca Steps: ${stepCount}`);

    // Module statistics
    if (Object.keys(moduleStats).length > 0) {
      console.log(`\n\ud83c\udfe0 Elements by Module:`);
      for (const [module, count] of Object.entries(moduleStats).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${module}: ${count}`);
      }
    }

    // Capability summary
    if (result.siteCapability) {
      const cap = result.siteCapability;
      console.log(`\n\ud83d\udcca Capability Summary:`);
      console.log(`   Domain: ${cap.domain}`);
      console.log(`   Pages: ${Object.keys(cap.pages).length}`);

      let totalElements = Object.keys(cap.global_elements).length;
      for (const page of Object.values(cap.pages)) {
        totalElements += Object.keys(page.elements).length;
      }
      console.log(`   Total Elements: ${totalElements}`);

      // Show elements with module info
      for (const [pageType, page] of Object.entries(cap.pages)) {
        console.log(`\n   \ud83d\udcc4 Page: ${pageType}`);
        for (const [elementId, element] of Object.entries(page.elements)) {
          const module = element.module || "unknown";
          console.log(`      [${module}] ${elementId}: ${element.element_type}`);
        }
      }


      // Validate recorded selectors
      console.log("\n" + "=".repeat(60));
      console.log("Validating Selectors");
      console.log("=".repeat(60));

      const validateResult = await builder.validate(cap.domain, { verbose: true });

      console.log("\n" + "=".repeat(60));
      console.log("Validation Results");
      console.log("=".repeat(60));
      console.log(`📊 Total Elements: ${validateResult.totalElements}`);
      console.log(`✅ Valid: ${validateResult.validElements}`);
      console.log(`❌ Invalid: ${validateResult.invalidElements}`);
      console.log(`📈 Rate: ${(validateResult.validationRate * 100).toFixed(1)}%`);
    }

    await builder.close();
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error("Fatal error:", error);
    await builder.close();
    process.exit(1);
  }
}

// Run
runPlaybookRecord().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
