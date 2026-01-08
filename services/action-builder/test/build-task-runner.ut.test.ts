/**
 * BuildTaskRunner Unit Tests
 *
 * 测试 BuildTaskRunner 的核心功能
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDb } from '@actionbookdev/db';
import type { Database } from '@actionbookdev/db';
import { buildTasks, recordingTasks } from '@actionbookdev/db';
import { eq } from 'drizzle-orm';
import { BuildTaskRunner } from '../src/task-worker/build-task-runner';
import {
  createTestSource,
  createTestDocument,
  createTestChunks,
  createTestBuildTask,
  createTestRecordingTasks,
  cleanupTestData,
  cleanupTestSource,
  waitForCondition,
} from './helpers/test-helpers';

describe('BuildTaskRunner', () => {
  let db: Database;
  let testSourceId: number;
  let testDocumentId: number;
  let testChunkIds: number[];
  let createdBuildTaskIds: number[] = [];

  beforeAll(async () => {
    db = getDb();

    // 创建测试 source, document 和 chunks
    testSourceId = await createTestSource(db);
    testDocumentId = await createTestDocument(db, testSourceId);
    testChunkIds = await createTestChunks(db, testDocumentId, 5);
  });

  afterAll(async () => {
    // 清理所有测试数据
    await cleanupTestData(db, createdBuildTaskIds);
    await cleanupTestSource(db, testSourceId);
  });

  beforeEach(() => {
    // 每个测试前重置 build task ID 列表
    createdBuildTaskIds = [];
  });

  test('状态轮询-部分完成: 3 个 tasks (2 completed, 1 pending)', async () => {
    // 创建 build_task
    const buildTaskId = await createTestBuildTask(db, testSourceId);
    createdBuildTaskIds.push(buildTaskId);

    // 创建 3 个 recording_tasks: 2 completed, 1 pending
    const taskIds = await createTestRecordingTasks(db, buildTaskId, 3, {
      sourceId: testSourceId,
      chunkIds: testChunkIds.slice(0, 3),
    });

    // 手动更新前 2 个为 completed
    await db
      .update(recordingTasks)
      .set({ status: 'completed' })
      .where(eq(recordingTasks.id, taskIds[0]));
    await db
      .update(recordingTasks)
      .set({ status: 'completed' })
      .where(eq(recordingTasks.id, taskIds[1]));

    // 创建 runner 并测试状态获取（不运行完整流程）
    const runner = new BuildTaskRunner(db, buildTaskId, {
      checkIntervalSeconds: 1,
    });

    const status = await (runner as any).getRecordingTasksStatus();

    expect(status.pending).toBe(1);
    expect(status.running).toBe(0);
    expect(status.completed).toBe(2);
    expect(status.failed).toBe(0);

    // allFinished 应该为 false (还有 pending)
    const allFinished = status.pending === 0 && status.running === 0;
    expect(allFinished).toBe(false);
  });

  test('状态轮询-全部完成: 3 个 tasks (2 completed, 1 failed)', async () => {
    const buildTaskId = await createTestBuildTask(db, testSourceId);
    createdBuildTaskIds.push(buildTaskId);

    const taskIds = await createTestRecordingTasks(db, buildTaskId, 3, {
      sourceId: testSourceId,
      chunkIds: testChunkIds.slice(0, 3),
    });

    // 2 completed, 1 failed
    await db
      .update(recordingTasks)
      .set({ status: 'completed' })
      .where(eq(recordingTasks.id, taskIds[0]));
    await db
      .update(recordingTasks)
      .set({ status: 'completed' })
      .where(eq(recordingTasks.id, taskIds[1]));
    await db
      .update(recordingTasks)
      .set({ status: 'failed', attemptCount: 3 }) // 达到上限
      .where(eq(recordingTasks.id, taskIds[2]));

    const runner = new BuildTaskRunner(db, buildTaskId);
    const status = await (runner as any).getRecordingTasksStatus();

    expect(status.pending).toBe(0);
    expect(status.running).toBe(0);
    expect(status.completed).toBe(2);
    expect(status.failed).toBe(1);

    // allFinished 应该为 true (pending=0, running=0)
    const allFinished = status.pending === 0 && status.running === 0;
    expect(allFinished).toBe(true);
  });

  test('重试-可重试任务: failed task, attemptCount=1', async () => {
    const buildTaskId = await createTestBuildTask(db, testSourceId);
    createdBuildTaskIds.push(buildTaskId);

    const taskIds = await createTestRecordingTasks(db, buildTaskId, 1, {
      sourceId: testSourceId,
      chunkIds: [testChunkIds[0]],
      status: 'failed',
      attemptCount: 1,
    });

    const runner = new BuildTaskRunner(db, buildTaskId, { maxAttempts: 3 });

    // 执行重试逻辑
    await (runner as any).retryFailedTasks();

    // 验证任务被重置为 pending
    const task = await db
      .select()
      .from(recordingTasks)
      .where(eq(recordingTasks.id, taskIds[0]))
      .limit(1);

    expect(task[0].status).toBe('pending');
    expect(task[0].errorMessage).toBeNull();
  });

  test('重试-达到上限: failed task, attemptCount=3', async () => {
    const buildTaskId = await createTestBuildTask(db, testSourceId);
    createdBuildTaskIds.push(buildTaskId);

    const taskIds = await createTestRecordingTasks(db, buildTaskId, 1, {
      sourceId: testSourceId,
      chunkIds: [testChunkIds[0]],
      status: 'failed',
      attemptCount: 3,
    });

    const runner = new BuildTaskRunner(db, buildTaskId, { maxAttempts: 3 });

    // 执行重试逻辑
    await (runner as any).retryFailedTasks();

    // 验证任务保持 failed (不重试)
    const task = await db
      .select()
      .from(recordingTasks)
      .where(eq(recordingTasks.id, taskIds[0]))
      .limit(1);

    expect(task[0].status).toBe('failed');
    expect(task[0].attemptCount).toBe(3);
  });

  test('心跳-定期更新: 运行中的 build_task', async () => {
    const buildTaskId = await createTestBuildTask(db, testSourceId);
    createdBuildTaskIds.push(buildTaskId);

    const runner = new BuildTaskRunner(db, buildTaskId, {
      heartbeatIntervalMs: 500,
    });

    // 获取初始 updatedAt
    const initialTask = await db
      .select()
      .from(buildTasks)
      .where(eq(buildTasks.id, buildTaskId))
      .limit(1);
    const initialUpdatedAt = initialTask[0].updatedAt;

    // 启动心跳
    (runner as any).startHeartbeat();

    // 等待 1 秒（应该触发至少 2 次心跳）
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // 停止心跳
    (runner as any).stopHeartbeat();

    // 验证 updatedAt 被更新
    const updatedTask = await db
      .select()
      .from(buildTasks)
      .where(eq(buildTasks.id, buildTaskId))
      .limit(1);

    expect(updatedTask[0].updatedAt.getTime()).toBeGreaterThan(
      initialUpdatedAt.getTime()
    );
  });

  test('空任务处理: 生成 0 个 recording_tasks 时直接 completed', async () => {
    // 创建一个没有 chunks 的 source
    const emptySourceId = await createTestSource(db);
    const buildTaskId = await createTestBuildTask(db, emptySourceId);
    createdBuildTaskIds.push(buildTaskId);

    const runner = new BuildTaskRunner(db, buildTaskId, {
      checkIntervalSeconds: 1,
    });

    // 运行 runner
    await runner.run();

    // 验证 build_task 被标记为 completed
    const task = await db
      .select()
      .from(buildTasks)
      .where(eq(buildTasks.id, buildTaskId))
      .limit(1);

    expect(task[0].stageStatus).toBe('completed');

    // 清理空 source
    await cleanupTestSource(db, emptySourceId);
  }, 10000);
});
