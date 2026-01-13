import { describe, expect, it } from "vitest";
import {
  searchActionsSchema,
  searchActionsDescription,
  searchActionsParams,
  getActionByIdSchema,
  getActionByIdDescription,
  getActionByIdParams,
} from "./tool-defs.js";

describe("searchActions tool definition", () => {
  describe("schema", () => {
    it("validates valid input", () => {
      const result = searchActionsSchema.safeParse({ query: "airbnb search" });
      expect(result.success).toBe(true);
    });

    it("validates input with all options", () => {
      const result = searchActionsSchema.safeParse({
        query: "airbnb search",
        type: "vector",
        limit: 10,
        sourceIds: "1,2,3",
        minScore: 0.7,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty query", () => {
      const result = searchActionsSchema.safeParse({ query: "" });
      expect(result.success).toBe(false);
    });

    it("rejects query over 200 characters", () => {
      const result = searchActionsSchema.safeParse({ query: "a".repeat(201) });
      expect(result.success).toBe(false);
    });

    it("rejects invalid search type", () => {
      const result = searchActionsSchema.safeParse({
        query: "test",
        type: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid search types", () => {
      for (const type of ["vector", "fulltext", "hybrid"]) {
        const result = searchActionsSchema.safeParse({ query: "test", type });
        expect(result.success).toBe(true);
      }
    });

    it("rejects limit below 1", () => {
      const result = searchActionsSchema.safeParse({ query: "test", limit: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects limit above 100", () => {
      const result = searchActionsSchema.safeParse({ query: "test", limit: 101 });
      expect(result.success).toBe(false);
    });

    it("rejects minScore below 0", () => {
      const result = searchActionsSchema.safeParse({ query: "test", minScore: -0.1 });
      expect(result.success).toBe(false);
    });

    it("rejects minScore above 1", () => {
      const result = searchActionsSchema.safeParse({ query: "test", minScore: 1.1 });
      expect(result.success).toBe(false);
    });
  });

  describe("description", () => {
    it("is defined and non-empty", () => {
      expect(searchActionsDescription).toBeDefined();
      expect(searchActionsDescription.length).toBeGreaterThan(0);
    });

    it("contains relevant keywords", () => {
      expect(searchActionsDescription).toContain("Search");
      expect(searchActionsDescription).toContain("action");
    });
  });

  describe("params", () => {
    it("has json format", () => {
      expect(searchActionsParams.json).toBeDefined();
      const json = searchActionsParams.json as any;
      expect(json.type).toBe("object");
      expect(json.properties).toHaveProperty("query");
    });

    it("has zod format", () => {
      expect(searchActionsParams.zod).toBeDefined();
      expect(searchActionsParams.zod).toBe(searchActionsSchema);
    });

    it("json schema has required fields", () => {
      const json = searchActionsParams.json as any;
      expect(json.required).toContain("query");
    });
  });
});

describe("getActionById tool definition", () => {
  describe("schema", () => {
    it("validates valid full URL input", () => {
      const result = getActionByIdSchema.safeParse({ id: "https://example.com/page" });
      expect(result.success).toBe(true);
    });

    it("validates valid domain-only input (fuzzy matching)", () => {
      const result = getActionByIdSchema.safeParse({ id: "releases.rs" });
      expect(result.success).toBe(true);
    });

    it("validates valid domain+path input (fuzzy matching)", () => {
      const result = getActionByIdSchema.safeParse({ id: "example.com/docs/page" });
      expect(result.success).toBe(true);
    });

    it("validates URL with chunk fragment", () => {
      const result = getActionByIdSchema.safeParse({ id: "https://example.com/page#chunk-1" });
      expect(result.success).toBe(true);
    });

    it("rejects empty id", () => {
      const result = getActionByIdSchema.safeParse({ id: "" });
      expect(result.success).toBe(false);
    });

    it("rejects missing id", () => {
      const result = getActionByIdSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("description", () => {
    it("is defined and non-empty", () => {
      expect(getActionByIdDescription).toBeDefined();
      expect(getActionByIdDescription.length).toBeGreaterThan(0);
    });

    it("contains relevant keywords", () => {
      expect(getActionByIdDescription).toContain("action");
      expect(getActionByIdDescription).toContain("selector");
    });
  });

  describe("params", () => {
    it("has json format", () => {
      expect(getActionByIdParams.json).toBeDefined();
      const json = getActionByIdParams.json as any;
      expect(json.type).toBe("object");
      expect(json.properties).toHaveProperty("id");
    });

    it("has zod format", () => {
      expect(getActionByIdParams.zod).toBeDefined();
      expect(getActionByIdParams.zod).toBe(getActionByIdSchema);
    });

    it("json schema has required fields", () => {
      const json = getActionByIdParams.json as any;
      expect(json.required).toContain("id");
    });

    it("json schema id property is string type", () => {
      const json = getActionByIdParams.json as any;
      expect(json.properties.id.type).toBe("string");
    });
  });
});
