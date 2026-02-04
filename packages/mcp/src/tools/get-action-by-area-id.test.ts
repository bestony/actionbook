import { describe, expect, it, vi } from "vitest";
import { createGetActionByAreaIdTool } from "./get-action-by-area-id.js";

describe("get_action_by_area_id tool", () => {
  const mockTextResponse = `## Overview

Action found: airbnb.com:/:default
- Type: page
- URL: https://airbnb.com/
- Health Score: 92%
- Updated: 2026-01-28

This response includes:
- Content: Full page description with functions and structure
- Elements: Interactive UI elements with selectors

----------

## Content

### Description

Airbnb homepage is the main entry point for the platform.

### Functions

- Search for listings
- Browse categories
- User login/registration

----------

## Elements

### search_button

- Name: search_button
- Description: Main search button to trigger search
- Element Type: button
- Allow Methods: click
- CSS Selector: [data-testid='search-button']
- XPath Selector: //button[@data-testid='search-button']
`;

  it("returns text response directly from API", async () => {
    const apiClient = {
      getActionByAreaId: vi.fn().mockResolvedValue(mockTextResponse),
    };

    const tool = createGetActionByAreaIdTool(apiClient as any);
    const output = await tool.handler({
      area_id: "airbnb.com:/:default",
    });

    expect(output).toBe(mockTextResponse);
    expect(apiClient.getActionByAreaId).toHaveBeenCalledWith(
      "airbnb.com:/:default"
    );
  });

  it("passes area_id to API", async () => {
    const apiClient = {
      getActionByAreaId: vi.fn().mockResolvedValue(mockTextResponse),
    };

    const tool = createGetActionByAreaIdTool(apiClient as any);
    await tool.handler({
      area_id: "example.com:https://example.com/docs:search_form",
    });

    expect(apiClient.getActionByAreaId).toHaveBeenCalledWith(
      "example.com:https://example.com/docs:search_form"
    );
  });

  it("handles error response", async () => {
    const errorResponse = `## Error

Action not found.

Error: The action ID "invalid:id" does not exist in our database.
`;
    const apiClient = {
      getActionByAreaId: vi.fn().mockResolvedValue(errorResponse),
    };

    const tool = createGetActionByAreaIdTool(apiClient as any);
    const output = await tool.handler({ area_id: "invalid:id" });

    expect(output).toBe(errorResponse);
    expect(output).toContain("Action not found");
  });

  it("has correct tool name", () => {
    const apiClient = {
      getActionByAreaId: vi.fn(),
    };

    const tool = createGetActionByAreaIdTool(apiClient as any);
    expect(tool.name).toBe("get_action_by_area_id");
  });

  it("has description", () => {
    const apiClient = {
      getActionByAreaId: vi.fn(),
    };

    const tool = createGetActionByAreaIdTool(apiClient as any);
    expect(tool.description).toBeDefined();
    expect(tool.description.length).toBeGreaterThan(0);
  });

  it("has input schema", () => {
    const apiClient = {
      getActionByAreaId: vi.fn(),
    };

    const tool = createGetActionByAreaIdTool(apiClient as any);
    expect(tool.inputSchema).toBeDefined();
  });
});
