/**
 * Chunk Builder - Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { buildChunkContent } from '../../src/utils/chunk-builder.js';
import type { PageCapabilities } from '../../src/types/index.js';

describe('buildChunkContent', () => {
  describe('basic structure', () => {
    it('builds content with page name as title', () => {
      const capabilities: PageCapabilities = {
        description: 'A test page',
        capabilities: [],
      };

      const content = buildChunkContent('Home Page', capabilities);
      expect(content).toContain('# Home Page');
    });

    it('includes description', () => {
      const capabilities: PageCapabilities = {
        description: 'This is the main landing page for the application.',
        capabilities: [],
      };

      const content = buildChunkContent('Home', capabilities);
      expect(content).toContain('This is the main landing page for the application.');
    });
  });

  describe('capabilities section', () => {
    it('includes capabilities list', () => {
      const capabilities: PageCapabilities = {
        description: 'Search page',
        capabilities: ['Search for products', 'Filter by category', 'Sort by price'],
      };

      const content = buildChunkContent('Search', capabilities);
      expect(content).toContain('## Capabilities');
      expect(content).toContain('- Search for products');
      expect(content).toContain('- Filter by category');
      expect(content).toContain('- Sort by price');
    });

    it('omits capabilities section when empty', () => {
      const capabilities: PageCapabilities = {
        description: 'Empty page',
        capabilities: [],
      };

      const content = buildChunkContent('Empty', capabilities);
      expect(content).not.toContain('## Capabilities');
    });
  });

  describe('functional areas section', () => {
    it('includes functional areas', () => {
      const capabilities: PageCapabilities = {
        description: 'Dashboard page',
        capabilities: ['View metrics'],
        functionalAreas: ['Header navigation', 'Metrics dashboard', 'Settings panel'],
      };

      const content = buildChunkContent('Dashboard', capabilities);
      expect(content).toContain('## Functional Areas');
      expect(content).toContain('- Header navigation');
      expect(content).toContain('- Metrics dashboard');
      expect(content).toContain('- Settings panel');
    });

    it('omits functional areas when undefined', () => {
      const capabilities: PageCapabilities = {
        description: 'Simple page',
        capabilities: ['Do something'],
      };

      const content = buildChunkContent('Simple', capabilities);
      expect(content).not.toContain('## Functional Areas');
    });

    it('omits functional areas when empty', () => {
      const capabilities: PageCapabilities = {
        description: 'Simple page',
        capabilities: ['Do something'],
        functionalAreas: [],
      };

      const content = buildChunkContent('Simple', capabilities);
      expect(content).not.toContain('## Functional Areas');
    });
  });

  describe('scenarios section', () => {
    it('includes scenarios with all fields', () => {
      const capabilities: PageCapabilities = {
        description: 'Login page',
        capabilities: ['Sign in', 'Reset password'],
        scenarios: [
          {
            name: 'User Login',
            goal: 'Authenticate user and access dashboard',
            steps: ['Enter email', 'Enter password', 'Click submit'],
            outcome: 'User is redirected to dashboard',
          },
        ],
      };

      const content = buildChunkContent('Login', capabilities);
      expect(content).toContain('## Scenarios');
      expect(content).toContain('### User Login');
      expect(content).toContain('**Goal:** Authenticate user and access dashboard');
      expect(content).toContain('**Steps:**');
      expect(content).toContain('1. Enter email');
      expect(content).toContain('2. Enter password');
      expect(content).toContain('3. Click submit');
      expect(content).toContain('**Outcome:** User is redirected to dashboard');
    });

    it('handles multiple scenarios', () => {
      const capabilities: PageCapabilities = {
        description: 'Search page',
        capabilities: ['Search', 'Filter'],
        scenarios: [
          {
            name: 'Basic Search',
            goal: 'Find products by name',
            steps: ['Enter search term', 'Click search'],
            outcome: 'Results displayed',
          },
          {
            name: 'Filtered Search',
            goal: 'Find products with filters',
            steps: ['Enter search term', 'Apply filters', 'Click search'],
            outcome: 'Filtered results displayed',
          },
        ],
      };

      const content = buildChunkContent('Search', capabilities);
      expect(content).toContain('### Basic Search');
      expect(content).toContain('### Filtered Search');
    });

    it('omits scenarios section when undefined', () => {
      const capabilities: PageCapabilities = {
        description: 'Simple page',
        capabilities: ['Do something'],
      };

      const content = buildChunkContent('Simple', capabilities);
      expect(content).not.toContain('## Scenarios');
    });

    it('omits scenarios section when empty', () => {
      const capabilities: PageCapabilities = {
        description: 'Simple page',
        capabilities: ['Do something'],
        scenarios: [],
      };

      const content = buildChunkContent('Simple', capabilities);
      expect(content).not.toContain('## Scenarios');
    });
  });

  describe('prerequisites section', () => {
    it('includes prerequisites', () => {
      const capabilities: PageCapabilities = {
        description: 'Protected page',
        capabilities: ['Edit profile'],
        prerequisites: ['User must be logged in', 'User must have admin role'],
      };

      const content = buildChunkContent('Admin Panel', capabilities);
      expect(content).toContain('## Prerequisites');
      expect(content).toContain('- User must be logged in');
      expect(content).toContain('- User must have admin role');
    });

    it('omits prerequisites when undefined', () => {
      const capabilities: PageCapabilities = {
        description: 'Public page',
        capabilities: ['View content'],
      };

      const content = buildChunkContent('Public', capabilities);
      expect(content).not.toContain('## Prerequisites');
    });

    it('omits prerequisites when empty', () => {
      const capabilities: PageCapabilities = {
        description: 'Public page',
        capabilities: ['View content'],
        prerequisites: [],
      };

      const content = buildChunkContent('Public', capabilities);
      expect(content).not.toContain('## Prerequisites');
    });
  });

  describe('full content structure', () => {
    it('builds complete chunk content with all sections', () => {
      const capabilities: PageCapabilities = {
        description: 'This is a comprehensive page for managing user accounts.',
        capabilities: ['Create account', 'Edit account', 'Delete account'],
        functionalAreas: ['Account form', 'Account list', 'Action buttons'],
        scenarios: [
          {
            name: 'Create New Account',
            goal: 'Add a new user to the system',
            steps: ['Click create button', 'Fill in user details', 'Submit form'],
            outcome: 'New user appears in the account list',
          },
        ],
        prerequisites: ['Admin privileges required'],
      };

      const content = buildChunkContent('User Management', capabilities);

      // Check order and structure
      const lines = content.split('\n');
      expect(lines[0]).toBe('# User Management');
      expect(content.indexOf('## Capabilities')).toBeGreaterThan(0);
      expect(content.indexOf('## Functional Areas')).toBeGreaterThan(content.indexOf('## Capabilities'));
      expect(content.indexOf('## Scenarios')).toBeGreaterThan(content.indexOf('## Functional Areas'));
      expect(content.indexOf('## Prerequisites')).toBeGreaterThan(content.indexOf('## Scenarios'));
    });

    it('produces LLM-friendly markdown format', () => {
      const capabilities: PageCapabilities = {
        description: 'A search page for finding products.',
        capabilities: ['Search products', 'Apply filters'],
        scenarios: [
          {
            name: 'Quick Search',
            goal: 'Find a product quickly',
            steps: ['Type product name', 'Press enter'],
            outcome: 'Products matching search term are shown',
          },
        ],
      };

      const content = buildChunkContent('Product Search', capabilities);

      // Verify it's valid markdown
      expect(content).toMatch(/^# .+/); // Starts with H1
      expect(content).toMatch(/## Capabilities/);
      expect(content).toMatch(/- Search products/);
      expect(content).toMatch(/### Quick Search/);
      expect(content).toMatch(/\*\*Goal:\*\*/);
      expect(content).toMatch(/\*\*Steps:\*\*/);
      expect(content).toMatch(/\*\*Outcome:\*\*/);
      expect(content).toMatch(/^\d+\. /m); // Numbered list
    });
  });
});
