import { describe, expect, it, vi } from "vitest";
import { createSearchActionsTool } from "./search-actions.js";

describe("search_actions tool (new text API)", () => {
  const mockTextResponse = `## Overview

Found 2 actions matching your query.
- Total: 2
- Page: 1 of 1

----------

## Results

### airbnb.com:/:default

- ID: airbnb.com:/:default
- Type: page
- Description: Airbnb homepage search functionality
- URL: https://airbnb.com/
- Health Score: 95%
- Updated: 2026-01-28

----------

### airbnb.com:/s/homes:default

- ID: airbnb.com:/s/homes:default
- Type: page
- Description: Airbnb search results page
- URL: https://airbnb.com/s/homes
- Health Score: 88%
- Updated: 2026-01-27
`;

  it("returns text response directly from API", async () => {
    const apiClient = {
      searchActions: vi.fn().mockResolvedValue(mockTextResponse),
    };

    const tool = createSearchActionsTool(apiClient as any);
    const output = await tool.handler({ query: "airbnb search" });

    expect(output).toBe(mockTextResponse);
    expect(apiClient.searchActions).toHaveBeenCalledWith({
      query: "airbnb search",
      domain: undefined,
      url: undefined,
      page: undefined,
      page_size: undefined,
    });
  });

  it("passes domain parameter to API", async () => {
    const apiClient = {
      searchActions: vi.fn().mockResolvedValue(mockTextResponse),
    };

    const tool = createSearchActionsTool(apiClient as any);
    await tool.handler({ query: "search", domain: "airbnb.com" });

    expect(apiClient.searchActions).toHaveBeenCalledWith({
      query: "search",
      domain: "airbnb.com",
      url: undefined,
      page: undefined,
      page_size: undefined,
    });
  });

  it("passes url parameter to API", async () => {
    const apiClient = {
      searchActions: vi.fn().mockResolvedValue(mockTextResponse),
    };

    const tool = createSearchActionsTool(apiClient as any);
    await tool.handler({ query: "search", url: "https://airbnb.com/" });

    expect(apiClient.searchActions).toHaveBeenCalledWith({
      query: "search",
      domain: undefined,
      url: "https://airbnb.com/",
      page: undefined,
      page_size: undefined,
    });
  });

  it("passes pagination parameters to API", async () => {
    const apiClient = {
      searchActions: vi.fn().mockResolvedValue(mockTextResponse),
    };

    const tool = createSearchActionsTool(apiClient as any);
    await tool.handler({ query: "search", page: 2, page_size: 20 });

    expect(apiClient.searchActions).toHaveBeenCalledWith({
      query: "search",
      domain: undefined,
      url: undefined,
      page: 2,
      page_size: 20,
    });
  });

  it("handles empty results", async () => {
    const emptyResponse = `## Overview

No actions found matching your query. This website hasn't been built.
- Total: 0
- Page: 1 of 1

----------

## Results
`;
    const apiClient = {
      searchActions: vi.fn().mockResolvedValue(emptyResponse),
    };

    const tool = createSearchActionsTool(apiClient as any);
    const output = await tool.handler({ query: "nonexistent" });

    expect(output).toBe(emptyResponse);
    expect(output).toContain("No actions found");
  });

  it("has correct tool name", () => {
    const apiClient = {
      searchActions: vi.fn(),
    };

    const tool = createSearchActionsTool(apiClient as any);
    expect(tool.name).toBe("search_actions");
  });

  it("has description", () => {
    const apiClient = {
      searchActions: vi.fn(),
    };

    const tool = createSearchActionsTool(apiClient as any);
    expect(tool.description).toBeDefined();
    expect(tool.description.length).toBeGreaterThan(0);
  });
});
