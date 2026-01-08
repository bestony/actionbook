/**
 * Test Helper Functions
 *
 * 测试辅助函数，用于创建测试数据和清理
 */

import type { Database } from '@actionbookdev/db';
import { buildTasks, recordingTasks, sources, chunks, documents } from '@actionbookdev/db';
import { eq, inArray, and } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * 创建测试用 build_task
 */
export async function createTestBuildTask(
  db: Database,
  sourceId: number
): Promise<number> {
  const result = await db
    .insert(buildTasks)
    .values({
      sourceId,
      sourceUrl: `https://test-${Date.now()}.example.com`,
      sourceName: `test_build_task_${Date.now()}`,
      sourceCategory: 'help',
      stage: 'knowledge_build',
      stageStatus: 'completed',
      config: {},
    })
    .returning({ id: buildTasks.id });

  return result[0].id;
}

/**
 * 批量创建测试用 recording_tasks
 */
export async function createTestRecordingTasks(
  db: Database,
  buildTaskId: number,
  count: number,
  options: {
    sourceId: number;
    chunkIds: number[];
    status?: 'pending' | 'running' | 'completed' | 'failed';
    attemptCount?: number;
  }
): Promise<number[]> {
  const tasks = [];
  for (let i = 0; i < count; i++) {
    tasks.push({
      sourceId: options.sourceId,
      buildTaskId,
      chunkId: options.chunkIds[i % options.chunkIds.length],
      startUrl: `https://test.example.com/page${i}`,
      status: options.status ?? 'pending',
      progress: 0,
      attemptCount: options.attemptCount ?? 0,
      config: {},
    });
  }

  const results = await db
    .insert(recordingTasks)
    .values(tasks)
    .returning({ id: recordingTasks.id });

  return results.map((r) => r.id);
}

/**
 * 清理测试数据
 * 按 build_task_id 清理所有相关数据
 */
export async function cleanupTestData(
  db: Database,
  buildTaskIds: number[]
): Promise<void> {
  if (buildTaskIds.length === 0) {
    return;
  }

  // 1. 删除 recording_tasks
  await db
    .delete(recordingTasks)
    .where(inArray(recordingTasks.buildTaskId, buildTaskIds));

  // 2. 删除 build_tasks
  await db.delete(buildTasks).where(inArray(buildTasks.id, buildTaskIds));
}

/**
 * 等待条件满足或超时
 */
export async function waitForCondition(
  fn: () => Promise<boolean> | boolean,
  options: {
    timeout?: number;
    interval?: number;
  } = {}
): Promise<boolean> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 100;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await fn();
    if (result) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return false;
}

/**
 * Mock TaskExecutor
 * 用于测试，返回固定延迟和成功/失败结果
 */
export function createMockTaskExecutor(
  delay: number,
  shouldFail: boolean = false
) {
  return {
    async execute() {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (shouldFail) {
        throw new Error('Mock task execution failed');
      }
      return {
        success: true,
        actions_created: 5,
        duration_ms: delay,
      };
    },
  };
}

/**
 * 创建测试用 source
 * Always adds timestamp suffix to ensure uniqueness across test runs
 */
export async function createTestSource(db: Database, name?: string): Promise<number> {
  const timestamp = Date.now();
  const sourceName = name ? `${name}_${timestamp}` : `test_source_${timestamp}`;

  const result = await db
    .insert(sources)
    .values({
      name: sourceName,
      domain: `test-${timestamp}.example.com`,
      baseUrl: `https://test-${timestamp}.example.com`,
      description: 'Test source',
      healthScore: 100,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: sources.id });

  return result[0].id;
}

/**
 * 创建测试用 document
 */
export async function createTestDocument(
  db: Database,
  sourceId: number
): Promise<number> {
  const url = `https://test-${Date.now()}.example.com/doc`;
  const urlHash = crypto.createHash('sha256').update(url).digest('hex');

  const result = await db
    .insert(documents)
    .values({
      sourceId,
      url,
      urlHash,
      title: `Test Document ${Date.now()}`,
      description: 'Test document for testing',
      contentText: 'Test content',
      depth: 0,
      breadcrumb: [],
    })
    .returning({ id: documents.id });

  return result[0].id;
}

/**
 * 创建测试用 chunks
 */
export async function createTestChunks(
  db: Database,
  documentId: number,
  count: number
): Promise<number[]> {
  const chunkData = [];
  for (let i = 0; i < count; i++) {
    const content = `Test chunk content ${i}`;
    chunkData.push({
      documentId,
      content,
      contentHash: `hash_${Date.now()}_${i}`,
      chunkIndex: i,
      startChar: i * 100,
      endChar: (i + 1) * 100,
      tokenCount: 50,
      embedding: new Array(1536).fill(0),
      createdAt: new Date(),
    });
  }

  const results = await db
    .insert(chunks)
    .values(chunkData)
    .returning({ id: chunks.id });

  return results.map((r) => r.id);
}

/**
 * 清理测试 source 和相关数据
 */
export async function cleanupTestSource(
  db: Database,
  sourceId: number
): Promise<void> {
  // Cascade delete will handle chunks and recording_tasks
  await db.delete(sources).where(eq(sources.id, sourceId));
}
