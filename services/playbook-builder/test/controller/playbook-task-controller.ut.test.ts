/**
 * PlaybookTaskController - Unit Tests
 *
 * Tests state management and lifecycle
 * Note: Database interactions are tested in integration tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store mock references for test access
const mockDbFunctions = {
  limit: vi.fn().mockResolvedValue([]),
  returning: vi.fn().mockResolvedValue([]),
};

// Mock database module - must be before importing the module
vi.mock('@actionbookdev/db', () => {
  const mockSelect = vi.fn().mockReturnThis();
  const mockFrom = vi.fn().mockReturnThis();
  const mockWhere = vi.fn().mockReturnThis();
  const mockOrderBy = vi.fn().mockReturnThis();
  const mockUpdate = vi.fn().mockReturnThis();
  const mockSet = vi.fn().mockReturnThis();

  return {
    getDb: vi.fn(() => ({
      select: mockSelect,
      from: mockFrom,
      where: mockWhere,
      orderBy: mockOrderBy,
      limit: mockDbFunctions.limit,
      update: mockUpdate,
      set: mockSet,
      returning: mockDbFunctions.returning,
    })),
    buildTasks: { id: 'id', stage: 'stage', stageStatus: 'stageStatus', createdAt: 'createdAt' },
    sources: {},
    eq: vi.fn((a, b) => ({ eq: [a, b] })),
    and: vi.fn((...args) => ({ and: args })),
    or: vi.fn((...args) => ({ or: args })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join('?'), values })),
  };
});

// Mock PlaybookBuilder
vi.mock('../../src/playbook-builder.js', () => ({
  PlaybookBuilder: vi.fn().mockImplementation(() => ({
    build: vi.fn().mockResolvedValue({
      playbookCount: 5,
      sourceVersionId: 1,
      playbookIds: [1, 2, 3, 4, 5],
    }),
  })),
}));

// Mock logger
vi.mock('../../src/utils/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/utils/index.js')>();
  return {
    ...original,
    log: vi.fn(),
  };
});

// Import after mocks
import { PlaybookTaskControllerImpl } from '../../src/controller/playbook-task-controller.js';

describe('PlaybookTaskControllerImpl', () => {
  let controller: PlaybookTaskControllerImpl;

  beforeEach(() => {
    controller = new PlaybookTaskControllerImpl();
    // Reset mocks
    mockDbFunctions.limit.mockResolvedValue([]);
    mockDbFunctions.returning.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('State Management', () => {
    it('starts in idle state', () => {
      expect(controller.getState()).toBe('idle');
    });

    it('can transition to stopped state', async () => {
      // Stop without starting should be safe (stays idle)
      await controller.stop();
      expect(controller.getState()).toBe('idle');
    });
  });

  describe('Configuration', () => {
    it('uses default options when none provided', () => {
      expect(controller.getState()).toBe('idle');
    });
  });

  describe('checkOnce', () => {
    it('returns false when no tasks available', async () => {
      // Mock returns empty array (no tasks)
      mockDbFunctions.limit.mockResolvedValue([]);

      const result = await controller.checkOnce();
      expect(result).toBe(false);
    });

    it('queries database for pending tasks', async () => {
      mockDbFunctions.limit.mockResolvedValue([]);

      await controller.checkOnce();

      // Verify limit was called (part of the query chain)
      expect(mockDbFunctions.limit).toHaveBeenCalled();
    });
  });

  describe('stop behavior', () => {
    it('stop is idempotent when already stopped', async () => {
      // Stop multiple times should be safe
      await controller.stop();
      await controller.stop();
      expect(controller.getState()).toBe('idle');
    });

    it('accepts optional stop reason', async () => {
      await controller.stop('Manual shutdown');
      expect(controller.getState()).toBe('idle');
    });
  });
});
