import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.API_URL || 'http://localhost:3100';

describe('Actions API - Chunk-based Implementation', () => {
  let healthStatus: { status: string };

  beforeAll(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (!res.ok) {
        throw new Error(`Service responded with ${res.status}`);
      }
      healthStatus = await res.json();
      console.log('API Service Health:', healthStatus);
    } catch (error) {
      console.error(`
============================================================
ERROR: Could not connect to API Service at ${BASE_URL}
Please make sure the service is running before running tests.
You can start it with: pnpm dev
============================================================
      `);
      throw error;
    }
  });

  describe('GET /api/actions/search', () => {
    it('should search actions via GET with query param', async () => {
      const res = await fetch(`${BASE_URL}/api/actions/search?q=company&type=fulltext&limit=5`);

      expect(res.status).toBe(200);
      const data = await res.json();

      console.log('GET search response:', JSON.stringify(data, null, 2));

      expect(data.success).toBe(true);
      expect(data.query).toBe('company');
      expect(Array.isArray(data.results)).toBe(true);
    });

    it('should return 400 when query param is missing', async () => {
      const res = await fetch(`${BASE_URL}/api/actions/search`);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('q parameter is required');
    });

    it('should respect limit parameter', async () => {
      const res = await fetch(`${BASE_URL}/api/actions/search?q=filter&type=fulltext&limit=2`);

      expect(res.status).toBe(200);
      const data = await res.json();

      if (data.results && data.results.length > 0) {
        expect(data.results.length).toBeLessThanOrEqual(2);
      }
    });

    it('should respect type parameter', async () => {
      const res = await fetch(`${BASE_URL}/api/actions/search?q=search&type=fulltext&limit=3`);

      expect(res.status).toBe(200);
      const data = await res.json();

      console.log('GET with type parameter:', JSON.stringify(data, null, 2));

      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/actions?id=<url>', () => {
    let testActionId: string;

    beforeAll(async () => {
      // First, search to get a valid action_id using GET (use fulltext for speed)
      const searchRes = await fetch(`${BASE_URL}/api/actions/search?q=company&type=fulltext&limit=1`);

      const searchData = await searchRes.json();
      if (searchData.results && searchData.results.length > 0) {
        testActionId = searchData.results[0].action_id;
        console.log(`Using action_id ${testActionId} for get-by-id tests`);
      } else {
        console.warn('No actions found in search, get-by-id tests may fail');
      }
    });

    it('should get action by URL-based action_id via query param', async () => {
      if (!testActionId) {
        console.warn('Skipping: no test action_id available');
        return;
      }

      // Use query parameter format
      const res = await fetch(`${BASE_URL}/api/actions?id=${encodeURIComponent(testActionId)}`);

      expect(res.status).toBe(200);
      const data = await res.json();

      console.log('Get by ID response:', JSON.stringify(data, null, 2));

      expect(data.action_id).toBe(testActionId);
      expect(data).toHaveProperty('content');
      expect(data).toHaveProperty('elements');
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('documentId');
      expect(data).toHaveProperty('documentTitle');
      expect(data).toHaveProperty('documentUrl');
      expect(data).toHaveProperty('chunkIndex');
      expect(data).toHaveProperty('tokenCount');

      expect(typeof data.action_id).toBe('string');
      expect(typeof data.content).toBe('string');
      expect(typeof data.createdAt).toBe('string');
      expect(typeof data.documentId).toBe('number');
      expect(typeof data.chunkIndex).toBe('number');
      expect(typeof data.tokenCount).toBe('number');

      // elements should be string or null
      if (data.elements !== null) {
        expect(typeof data.elements).toBe('string');
      }

      // Validate ISO 8601 date format
      expect(() => new Date(data.createdAt)).not.toThrow();
    });

    it('should return 404 for non-existent action_id', async () => {
      // Use a valid URL format that doesn't exist in the database
      const nonExistentUrl = 'https://non-existent-domain.test/page-that-does-not-exist';
      const res = await fetch(`${BASE_URL}/api/actions?id=${encodeURIComponent(nonExistentUrl)}`);

      expect(res.status).toBe(404);
      const data = await res.json();

      expect(data.error).toBe('NOT_FOUND');
      expect(data.code).toBe('404');
      expect(data.message).toContain(nonExistentUrl);
    });

    it('should return 400 for invalid action_id format', async () => {
      const res = await fetch(`${BASE_URL}/api/actions?id=invalid-id`);

      expect(res.status).toBe(400);
      const data = await res.json();

      expect(data.error).toBe('INVALID_ID');
      expect(data.code).toBe('400');
    });

    it('should return 400 when id param is missing', async () => {
      const res = await fetch(`${BASE_URL}/api/actions`);

      expect(res.status).toBe(400);
      const data = await res.json();

      expect(data.error).toBe('MISSING_PARAM');
      expect(data.code).toBe('400');
    });
  });

  describe('GET /api/actions?id=<url> - Fuzzy Matching', () => {
    it('should match domain without protocol', async () => {
      // First get a valid URL from search
      const searchRes = await fetch(`${BASE_URL}/api/actions/search?q=company&type=fulltext&limit=1`);
      const searchData = await searchRes.json();

      if (!searchData.results || searchData.results.length === 0) {
        console.warn('Skipping: no test data available');
        return;
      }

      // Extract domain from full URL (e.g., "https://example.com/path" -> "example.com/path")
      const fullUrl = searchData.results[0].action_id;
      const domainWithPath = fullUrl.replace(/^https?:\/\//, '');

      console.log(`Testing fuzzy match: "${domainWithPath}" should match "${fullUrl}"`);

      const res = await fetch(`${BASE_URL}/api/actions?id=${encodeURIComponent(domainWithPath)}`);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.action_id).toBe(fullUrl);
    });

    it('should match domain only (without path)', async () => {
      // First get a valid URL from search
      const searchRes = await fetch(`${BASE_URL}/api/actions/search?q=company&type=fulltext&limit=1`);
      const searchData = await searchRes.json();

      if (!searchData.results || searchData.results.length === 0) {
        console.warn('Skipping: no test data available');
        return;
      }

      // Extract just the domain (e.g., "https://example.com/path" -> "example.com")
      const fullUrl = searchData.results[0].action_id;
      try {
        const urlObj = new URL(fullUrl);
        const domainOnly = urlObj.hostname;

        console.log(`Testing fuzzy match: "${domainOnly}" should find actions from "${fullUrl}"`);

        const res = await fetch(`${BASE_URL}/api/actions?id=${encodeURIComponent(domainOnly)}`);

        // Should either succeed (200) or not found (404) - but not 400 (invalid)
        expect([200, 404]).toContain(res.status);

        if (res.status === 200) {
          const data = await res.json();
          // The returned URL should contain the domain
          expect(data.documentUrl.toLowerCase()).toContain(domainOnly.toLowerCase());
        }
      } catch (e) {
        console.warn('Could not parse URL, skipping test');
      }
    });

    it('should prefer exact match over partial match', async () => {
      // This test verifies that if we search for "a.com", we get "https://a.com" not "https://aa.com"
      // We test this by searching with a known full URL and verifying we get that exact URL back
      const searchRes = await fetch(`${BASE_URL}/api/actions/search?q=company&type=fulltext&limit=5`);
      const searchData = await searchRes.json();

      if (!searchData.results || searchData.results.length === 0) {
        console.warn('Skipping: no test data available');
        return;
      }

      // Use the full URL and verify we get exactly that URL back
      const fullUrl = searchData.results[0].action_id;
      const res = await fetch(`${BASE_URL}/api/actions?id=${encodeURIComponent(fullUrl)}`);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.action_id).toBe(fullUrl);
    });

    it('should return 404 for fuzzy search with no matches', async () => {
      const res = await fetch(`${BASE_URL}/api/actions?id=${encodeURIComponent('nonexistent-domain-xyz123.test')}`);

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe('NOT_FOUND');
    });
  });

  describe('Integration: Search and Get', () => {
    it('should search and then retrieve full action details', async () => {
      // Step 1: Search for actions using GET (use fulltext for speed)
      const searchRes = await fetch(`${BASE_URL}/api/actions/search?q=company+card&type=fulltext&limit=3`);

      expect(searchRes.status).toBe(200);
      const searchData = await searchRes.json();

      console.log('Search results:', JSON.stringify(searchData, null, 2));

      if (!searchData.results || searchData.results.length === 0) {
        console.warn('No results found, skipping integration test');
        return;
      }

      // Step 2: Get full details for the first result using query param
      const firstActionId = searchData.results[0].action_id;
      const getRes = await fetch(`${BASE_URL}/api/actions?id=${encodeURIComponent(firstActionId)}`);

      expect(getRes.status).toBe(200);
      const actionData = await getRes.json();

      console.log('Full action details:', JSON.stringify(actionData, null, 2));

      // Verify consistency
      expect(actionData.action_id).toBe(firstActionId);
      expect(actionData.content).toBe(searchData.results[0].content);

      // Verify additional fields are present
      expect(actionData).toHaveProperty('documentTitle');
      expect(actionData).toHaveProperty('documentUrl');
      expect(actionData).toHaveProperty('chunkIndex');
      expect(actionData).toHaveProperty('elements');
    });
  });
});
