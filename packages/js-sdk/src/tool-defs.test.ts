import { describe, expect, it } from "vitest";
import {
  searchActionsSchema,
  searchActionsDescription,
  searchActionsParams,
  getActionByIdSchema,
  getActionByIdDescription,
  getActionByIdParams,
  getActionByAreaIdSchema,
  getActionByAreaIdDescription,
  getActionByAreaIdParams,
} from "./tool-defs.js";

describe("searchActions tool definition (new text API)", () => {
  describe("schema", () => {
    it("validates valid input", () => {
      const result = searchActionsSchema.safeParse({ query: "airbnb search" });
      expect(result.success).toBe(true);
    });

    it("validates input with all options", () => {
      const result = searchActionsSchema.safeParse({
        query: "airbnb search",
        domain: "airbnb.com",
        url: "https://airbnb.com/",
        page: 1,
        page_size: 10,
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

    it("accepts optional domain parameter", () => {
      const result = searchActionsSchema.safeParse({
        query: "search",
        domain: "airbnb.com",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional url parameter", () => {
      const result = searchActionsSchema.safeParse({
        query: "search",
        url: "https://airbnb.com/homes",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional page parameter", () => {
      const result = searchActionsSchema.safeParse({
        query: "search",
        page: 2,
      });
      expect(result.success).toBe(true);
    });

    it("rejects page below 1", () => {
      const result = searchActionsSchema.safeParse({ query: "test", page: 0 });
      expect(result.success).toBe(false);
    });

    it("accepts optional page_size parameter", () => {
      const result = searchActionsSchema.safeParse({
        query: "search",
        page_size: 20,
      });
      expect(result.success).toBe(true);
    });

    it("rejects page_size below 1", () => {
      const result = searchActionsSchema.safeParse({ query: "test", page_size: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects page_size above 100", () => {
      const result = searchActionsSchema.safeParse({ query: "test", page_size: 101 });
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

    it("mentions area_id format", () => {
      expect(searchActionsDescription).toContain("area_id");
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

    it("json schema has domain property", () => {
      const json = searchActionsParams.json as any;
      expect(json.properties).toHaveProperty("domain");
    });
  });
});

describe("getActionByAreaId tool definition (new text API)", () => {
  describe("schema", () => {
    it("validates valid area_id input", () => {
      const result = getActionByAreaIdSchema.safeParse({
        area_id: "airbnb.com:/:default",
      });
      expect(result.success).toBe(true);
    });

    it("validates area_id with custom area", () => {
      const result = getActionByAreaIdSchema.safeParse({
        area_id: "airbnb.com:/:search_form",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty area_id", () => {
      const result = getActionByAreaIdSchema.safeParse({ area_id: "" });
      expect(result.success).toBe(false);
    });

    it("rejects missing area_id", () => {
      const result = getActionByAreaIdSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("description", () => {
    it("is defined and non-empty", () => {
      expect(getActionByAreaIdDescription).toBeDefined();
      expect(getActionByAreaIdDescription.length).toBeGreaterThan(0);
    });

    it("contains relevant keywords", () => {
      expect(getActionByAreaIdDescription).toContain("action");
      expect(getActionByAreaIdDescription).toContain("area_id");
    });

    it("explains area_id format", () => {
      expect(getActionByAreaIdDescription).toContain("site:path:area");
    });
  });

  describe("params", () => {
    it("has json format", () => {
      expect(getActionByAreaIdParams.json).toBeDefined();
      const json = getActionByAreaIdParams.json as any;
      expect(json.type).toBe("object");
      expect(json.properties).toHaveProperty("area_id");
    });

    it("has zod format", () => {
      expect(getActionByAreaIdParams.zod).toBeDefined();
      expect(getActionByAreaIdParams.zod).toBe(getActionByAreaIdSchema);
    });

    it("json schema has required fields", () => {
      const json = getActionByAreaIdParams.json as any;
      expect(json.required).toContain("area_id");
    });

    it("json schema area_id property is string type", () => {
      const json = getActionByAreaIdParams.json as any;
      expect(json.properties.area_id.type).toBe("string");
    });
  });
});

describe("getActionById tool definition (legacy)", () => {
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
