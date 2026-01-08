/**
 * CapabilitiesDiscoverer - Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CapabilitiesDiscoverer } from '../../src/discoverer/capabilities-discoverer.js';
import { createMockAIClient, createToolCallResponse } from '../helpers/mock-factory.js';

// Mock the logger to suppress test output
vi.mock('../../src/utils/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/utils/index.js')>();
  return {
    ...original,
    log: vi.fn(),
  };
});

describe('CapabilitiesDiscoverer', () => {
  let mockAIClient: ReturnType<typeof createMockAIClient>;
  let discoverer: CapabilitiesDiscoverer;

  beforeEach(() => {
    mockAIClient = createMockAIClient();
    discoverer = new CapabilitiesDiscoverer(mockAIClient as unknown as ConstructorParameters<typeof CapabilitiesDiscoverer>[0]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('discover', () => {
    it('extracts capabilities from LLM response', async () => {
      mockAIClient.chat.mockResolvedValue(createToolCallResponse([{
        name: 'register_page_capabilities',
        args: {
          description: 'This is a search page for finding accommodations.',
          capabilities: ['Search for places', 'Filter by date', 'Set guest count'],
          functionalAreas: ['Search form', 'Results grid'],
        },
      }]));

      const result = await discoverer.discover(
        Buffer.from('fake-screenshot'),
        '<html><body>Test</body></html>',
        'Search Page'
      );

      expect(result.description).toBe('This is a search page for finding accommodations.');
      expect(result.capabilities).toHaveLength(3);
      expect(result.capabilities).toContain('Search for places');
      expect(result.functionalAreas).toEqual(['Search form', 'Results grid']);
    });

    it('includes scenarios when provided', async () => {
      mockAIClient.chat.mockResolvedValue(createToolCallResponse([{
        name: 'register_page_capabilities',
        args: {
          description: 'Login page for user authentication.',
          capabilities: ['Sign in', 'Reset password'],
          scenarios: [
            {
              name: 'User Login',
              goal: 'Authenticate and access account',
              steps: ['Enter email', 'Enter password', 'Click sign in'],
              outcome: 'User is logged in and redirected',
            },
          ],
        },
      }]));

      const result = await discoverer.discover(
        Buffer.from('fake-screenshot'),
        '<html><body>Login</body></html>',
        'Login Page'
      );

      expect(result.scenarios).toHaveLength(1);
      expect(result.scenarios![0].name).toBe('User Login');
      expect(result.scenarios![0].steps).toHaveLength(3);
    });

    it('includes prerequisites when provided', async () => {
      mockAIClient.chat.mockResolvedValue(createToolCallResponse([{
        name: 'register_page_capabilities',
        args: {
          description: 'Dashboard for managing settings.',
          capabilities: ['View settings', 'Update preferences'],
          prerequisites: ['User must be logged in', 'Account must be verified'],
        },
      }]));

      const result = await discoverer.discover(
        Buffer.from('fake-screenshot'),
        '<html><body>Settings</body></html>',
        'Settings Page'
      );

      expect(result.prerequisites).toHaveLength(2);
      expect(result.prerequisites).toContain('User must be logged in');
    });

    it('returns fallback when no tool calls in response', async () => {
      mockAIClient.chat.mockResolvedValue({
        choices: [{
          message: {
            content: 'I analyzed the page.',
            tool_calls: undefined,
          },
        }],
      });

      const result = await discoverer.discover(
        Buffer.from('fake-screenshot'),
        '<html><body>Test</body></html>',
        'Test Page'
      );

      expect(result.description).toContain('Test Page');
      expect(result.capabilities).toEqual([]);
    });

    it('returns fallback when tool calls array is empty', async () => {
      mockAIClient.chat.mockResolvedValue({
        choices: [{
          message: {
            content: null,
            tool_calls: [],
          },
        }],
      });

      const result = await discoverer.discover(
        Buffer.from('fake-screenshot'),
        '<html><body>Test</body></html>',
        'Empty Page'
      );

      expect(result.description).toContain('Empty Page');
      expect(result.capabilities).toEqual([]);
    });

    it('handles missing optional fields gracefully', async () => {
      mockAIClient.chat.mockResolvedValue(createToolCallResponse([{
        name: 'register_page_capabilities',
        args: {
          description: 'A simple page.',
          capabilities: ['Do something'],
          // No functionalAreas, scenarios, or prerequisites
        },
      }]));

      const result = await discoverer.discover(
        Buffer.from('fake-screenshot'),
        '<html><body>Simple</body></html>',
        'Simple Page'
      );

      expect(result.description).toBe('A simple page.');
      expect(result.capabilities).toEqual(['Do something']);
      expect(result.functionalAreas).toBeUndefined();
      expect(result.scenarios).toBeUndefined();
      expect(result.prerequisites).toBeUndefined();
    });

    it('uses default description when missing', async () => {
      mockAIClient.chat.mockResolvedValue(createToolCallResponse([{
        name: 'register_page_capabilities',
        args: {
          capabilities: ['Feature 1'],
          // No description
        },
      }]));

      const result = await discoverer.discover(
        Buffer.from('fake-screenshot'),
        '<html><body>Test</body></html>',
        'My Page'
      );

      expect(result.description).toContain('My Page');
    });

    it('handles empty capabilities array', async () => {
      mockAIClient.chat.mockResolvedValue(createToolCallResponse([{
        name: 'register_page_capabilities',
        args: {
          description: 'A page with no clear capabilities.',
          capabilities: [],
        },
      }]));

      const result = await discoverer.discover(
        Buffer.from('fake-screenshot'),
        '<html><body>Static</body></html>',
        'Static Page'
      );

      expect(result.capabilities).toEqual([]);
    });

    it('throws error when LLM call fails', async () => {
      mockAIClient.chat.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(
        discoverer.discover(
          Buffer.from('fake-screenshot'),
          '<html><body>Test</body></html>',
          'Test Page'
        )
      ).rejects.toThrow('API rate limit exceeded');
    });
  });

  describe('scenario normalization', () => {
    it('normalizes scenarios with all required fields', async () => {
      mockAIClient.chat.mockResolvedValue(createToolCallResponse([{
        name: 'register_page_capabilities',
        args: {
          description: 'Test page',
          capabilities: ['Test'],
          scenarios: [
            {
              name: 'Complete Scenario',
              goal: 'Test all fields',
              steps: ['Step 1', 'Step 2'],
              outcome: 'Success',
            },
          ],
        },
      }]));

      const result = await discoverer.discover(
        Buffer.from('fake-screenshot'),
        '<html></html>',
        'Test'
      );

      expect(result.scenarios![0]).toEqual({
        name: 'Complete Scenario',
        goal: 'Test all fields',
        steps: ['Step 1', 'Step 2'],
        outcome: 'Success',
      });
    });

    it('handles scenarios with missing optional fields', async () => {
      mockAIClient.chat.mockResolvedValue(createToolCallResponse([{
        name: 'register_page_capabilities',
        args: {
          description: 'Test page',
          capabilities: ['Test'],
          scenarios: [
            {
              name: 'Minimal Scenario',
              // Missing goal, steps, outcome
            },
          ],
        },
      }]));

      const result = await discoverer.discover(
        Buffer.from('fake-screenshot'),
        '<html></html>',
        'Test'
      );

      expect(result.scenarios![0].name).toBe('Minimal Scenario');
      expect(result.scenarios![0].goal).toBe('');
      expect(result.scenarios![0].steps).toEqual([]);
      expect(result.scenarios![0].outcome).toBe('');
    });

    it('filters out invalid scenario entries', async () => {
      mockAIClient.chat.mockResolvedValue(createToolCallResponse([{
        name: 'register_page_capabilities',
        args: {
          description: 'Test page',
          capabilities: ['Test'],
          scenarios: [
            { name: 'Valid', goal: 'Test', steps: [], outcome: 'Done' },
            null,
            'string-not-object',
            123,
          ],
        },
      }]));

      const result = await discoverer.discover(
        Buffer.from('fake-screenshot'),
        '<html></html>',
        'Test'
      );

      expect(result.scenarios).toHaveLength(1);
      expect(result.scenarios![0].name).toBe('Valid');
    });
  });

  describe('page context extraction', () => {
    it('calls AI client with screenshot and HTML content', async () => {
      const screenshot = Buffer.from('test-image-data');
      const html = '<html><body><button>Click Me</button></body></html>';

      mockAIClient.chat.mockResolvedValue(createToolCallResponse([{
        name: 'register_page_capabilities',
        args: {
          description: 'A page with a button.',
          capabilities: ['Click button'],
        },
      }]));

      await discoverer.discover(screenshot, html, 'Button Page');

      // Verify AI client was called
      expect(mockAIClient.chat).toHaveBeenCalledTimes(1);

      // Verify messages include image
      const callArgs = mockAIClient.chat.mock.calls[0];
      const messages = callArgs[0];
      expect(messages).toHaveLength(2); // system + user
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });
  });
});
