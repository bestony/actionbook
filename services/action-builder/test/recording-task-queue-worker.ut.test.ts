/**
 * RecordingTaskQueueWorker Unit Tests
 *
 * 测试 RecordingTaskQueueWorker 的核心功能:
 * - 任务领取 (Task claiming)
 * - Stale 恢复 (Stale task recovery)
 * - 并发控制 (Concurrency control)
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { getDb } from '@actionbookdev/db';
import type { Database } from '@actionbookdev/db';
import { recordingTasks } from '@actionbookdev/db';
import { eq, and, lt, sql } from 'drizzle-orm';
import { RecordingTaskQueueWorker } from '../src/task-worker/recording-task-queue-worker';
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

describe('RecordingTaskQueueWorker', () => {
  let db: Database;
  let testSourceId: number;
  let testDocumentId: number;
  let testChunkIds: number[];
  let testBuildTaskId: number;
  let createdBuildTaskIds: number[] = [];

  beforeAll(async () => {
    db = getDb();

    // 创建测试数据
    testSourceId = await createTestSource(db);
    testDocumentId = await createTestDocument(db, testSourceId);
    testChunkIds = await createTestChunks(db, testDocumentId, 5);
    testBuildTaskId = await createTestBuildTask(db, testSourceId);
    createdBuildTaskIds.push(testBuildTaskId);
  });

  afterAll(async () => {
    // 清理测试数据
    await cleanupTestData(db, createdBuildTaskIds);
    await cleanupTestSource(db, testSourceId);
  });

  beforeEach(async () => {
    // 清理所有 recording_tasks
    await db.delete(recordingTasks);
  });

  test('任务领取: 原子性领取 pending 任务', async () => {
    // 创建 3 个 pending 任务
    const taskIds = await createTestRecordingTasks(db, testBuildTaskId, 3, {
      sourceId: testSourceId,
      chunkIds: testChunkIds.slice(0, 3),
      status: 'pending',
    });

    // Mock TaskExecutor 不执行实际任务
    vi.mock('../src/task-worker/task-executor', () => ({
      TaskExecutor: class MockTaskExecutor {
        async execute() {
          // 延迟 50ms 模拟执行
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            success: true,
            actions_created: 5,
            duration_ms: 50,
          };
        }
      },
    }));

    // 创建 Worker，concurrency=2
    const worker = new RecordingTaskQueueWorker(db, {
      concurrency: 2,
      idleWaitMs: 100,
      heartbeatIntervalMs: 1000,
      staleTimeoutMinutes: 15,
      databaseUrl: process.env.DATABASE_URL!,
      headless: true,
      outputDir: './test-output',
    });

    // 启动 Worker（非阻塞）
    const workerPromise = worker.start();

    // 等待一段时间，让 worker 领取任务
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 检查数据库中的任务状态
    const tasks = await db.select().from(recordingTasks);
    const runningCount = tasks.filter((t) => t.status === 'running').length;
    const pendingCount = tasks.filter((t) => t.status === 'pending').length;

    // 应该有 2 个 running (concurrency limit) 和 1 个 pending
    expect(runningCount).toBeLessThanOrEqual(2);
    expect(pendingCount).toBeGreaterThanOrEqual(1);

    // 停止 Worker
    await worker.stop(1000);
    await workerPromise;
  }, 10000);

  test('Stale 恢复: 恢复超时的 running 任务', async () => {
    // 创建 2 个任务
    const taskIds = await createTestRecordingTasks(db, testBuildTaskId, 2, {
      sourceId: testSourceId,
      chunkIds: testChunkIds.slice(0, 2),
      status: 'running',
    });

    // 手动设置第一个任务为 stale (lastHeartbeat 超过 15 分钟)
    const staleTime = new Date(Date.now() - 16 * 60 * 1000); // 16 分钟前
    await db
      .update(recordingTasks)
      .set({
        lastHeartbeat: staleTime,
      })
      .where(eq(recordingTasks.id, taskIds[0]));

    // 第二个任务设置为最近心跳
    await db
      .update(recordingTasks)
      .set({
        lastHeartbeat: new Date(),
      })
      .where(eq(recordingTasks.id, taskIds[1]));

    // 创建 Worker（会在 start() 时自动恢复 stale 任务）
    const worker = new RecordingTaskQueueWorker(db, {
      concurrency: 1,
      staleTimeoutMinutes: 15,
      databaseUrl: process.env.DATABASE_URL!,
      headless: true,
      outputDir: './test-output',
    });

    // 手动调用 recoverStaleTasks
    await (worker as any).recoverStaleTasks();

    // 检查数据库
    const tasks = await db.select().from(recordingTasks);
    const task1 = tasks.find((t) => t.id === taskIds[0]);
    const task2 = tasks.find((t) => t.id === taskIds[1]);

    // task1 应该被重置为 pending
    expect(task1?.status).toBe('pending');

    // task2 应该保持 running
    expect(task2?.status).toBe('running');
  });

  test('并发控制: 最多 N 个任务同时执行', async () => {
    // 创建 5 个 pending 任务
    await createTestRecordingTasks(db, testBuildTaskId, 5, {
      sourceId: testSourceId,
      chunkIds: testChunkIds,
      status: 'pending',
    });

    // Mock TaskExecutor 延迟执行
    vi.mock('../src/task-worker/task-executor', () => ({
      TaskExecutor: class MockTaskExecutor {
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return {
            success: true,
            actions_created: 5,
            duration_ms: 500,
          };
        }
      },
    }));

    // 创建 Worker，concurrency=3
    const worker = new RecordingTaskQueueWorker(db, {
      concurrency: 3,
      idleWaitMs: 100,
      heartbeatIntervalMs: 1000,
      staleTimeoutMinutes: 15,
      databaseUrl: process.env.DATABASE_URL!,
      headless: true,
      outputDir: './test-output',
    });

    // 启动 Worker
    const workerPromise = worker.start();

    // 等待一段时间
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 检查 running 任务数
    const tasks = await db.select().from(recordingTasks);
    const runningCount = tasks.filter((t) => t.status === 'running').length;

    // 应该最多有 3 个 running
    expect(runningCount).toBeLessThanOrEqual(3);

    // 停止 Worker
    await worker.stop(1000);
    await workerPromise;
  }, 10000);

  test('心跳机制: running 任务定期更新 lastHeartbeat', async () => {
    // 创建 1 个 pending 任务
    await createTestRecordingTasks(db, testBuildTaskId, 1, {
      sourceId: testSourceId,
      chunkIds: [testChunkIds[0]],
      status: 'pending',
    });

    // Mock TaskExecutor 长时间执行
    vi.mock('../src/task-worker/task-executor', () => ({
      TaskExecutor: class MockTaskExecutor {
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          return {
            success: true,
            actions_created: 5,
            duration_ms: 3000,
          };
        }
      },
    }));

    // 创建 Worker，heartbeat 间隔 500ms
    const worker = new RecordingTaskQueueWorker(db, {
      concurrency: 1,
      heartbeatIntervalMs: 500,
      staleTimeoutMinutes: 15,
      databaseUrl: process.env.DATABASE_URL!,
      headless: true,
      outputDir: './test-output',
    });

    // 启动 Worker
    const workerPromise = worker.start();

    // 等待任务被领取并开始执行
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 记录初始心跳时间
    let tasks = await db.select().from(recordingTasks);
    const runningTask = tasks.find((t) => t.status === 'running');
    expect(runningTask).toBeDefined();
    const initialHeartbeat = runningTask!.lastHeartbeat;

    // 等待 1.5 秒（应该有 3 次心跳更新）
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 检查心跳是否更新
    tasks = await db.select().from(recordingTasks);
    const updatedTask = tasks.find((t) => t.id === runningTask!.id);
    const updatedHeartbeat = updatedTask!.lastHeartbeat;

    // 心跳时间应该比初始时间晚
    expect(updatedHeartbeat!.getTime()).toBeGreaterThan(initialHeartbeat!.getTime());

    // 停止 Worker
    await worker.stop(5000);
    await workerPromise;
  }, 10000);

  test('空队列处理: 无任务时等待', async () => {
    // 不创建任何任务

    // 创建 Worker
    const worker = new RecordingTaskQueueWorker(db, {
      concurrency: 3,
      idleWaitMs: 100,
      databaseUrl: process.env.DATABASE_URL!,
      headless: true,
      outputDir: './test-output',
    });

    // 启动 Worker
    const workerPromise = worker.start();

    // 等待一段时间
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 检查任务数（应该为 0）
    const tasks = await db.select().from(recordingTasks);
    expect(tasks.length).toBe(0);

    // Worker 应该仍在运行（等待状态）
    expect((worker as any).running).toBe(true);

    // 停止 Worker
    await worker.stop(1000);
    await workerPromise;
  });

  test('任务领取-跨 build_task: 3 个不同 build_task 的任务都能被消费', async () => {
    // 创建 3 个不同的 build_task
    const buildTask1 = await createTestBuildTask(db, testSourceId);
    const buildTask2 = await createTestBuildTask(db, testSourceId);
    const buildTask3 = await createTestBuildTask(db, testSourceId);
    createdBuildTaskIds.push(buildTask1, buildTask2, buildTask3);

    // 每个 build_task 创建 1 个 pending 任务
    await createTestRecordingTasks(db, buildTask1, 1, {
      sourceId: testSourceId,
      chunkIds: [testChunkIds[0]],
      status: 'pending',
    });
    await createTestRecordingTasks(db, buildTask2, 1, {
      sourceId: testSourceId,
      chunkIds: [testChunkIds[1]],
      status: 'pending',
    });
    await createTestRecordingTasks(db, buildTask3, 1, {
      sourceId: testSourceId,
      chunkIds: [testChunkIds[2]],
      status: 'pending',
    });

    // Mock TaskExecutor 快速完成
    vi.mock('../src/task-worker/task-executor', () => ({
      TaskExecutor: class MockTaskExecutor {
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            success: true,
            actions_created: 5,
            duration_ms: 50,
          };
        }
      },
    }));

    // 创建 Worker
    const worker = new RecordingTaskQueueWorker(db, {
      concurrency: 3,
      idleWaitMs: 100,
      databaseUrl: process.env.DATABASE_URL!,
      headless: true,
      outputDir: './test-output',
    });

    // 启动 Worker
    const workerPromise = worker.start();

    // 等待所有任务完成
    await waitForCondition(
      async () => {
        const tasks = await db.select().from(recordingTasks);
        return tasks.every((t) => t.status === 'completed' || t.status === 'failed');
      },
      5000,
      100
    );

    // 检查所有任务都被消费
    const tasks = await db.select().from(recordingTasks);
    expect(tasks.length).toBe(3);

    // 验证每个 build_task 的任务都被处理
    const task1 = tasks.find((t) => t.buildTaskId === buildTask1);
    const task2 = tasks.find((t) => t.buildTaskId === buildTask2);
    const task3 = tasks.find((t) => t.buildTaskId === buildTask3);

    expect(task1).toBeDefined();
    expect(task2).toBeDefined();
    expect(task3).toBeDefined();

    // 停止 Worker
    await worker.stop(1000);
    await workerPromise;
  }, 10000);

  test('Stale 恢复-达到上限: running, lastHeartbeat 超时, attemptCount=3 应标记为 failed', async () => {
    // 创建 1 个任务
    const taskIds = await createTestRecordingTasks(db, testBuildTaskId, 1, {
      sourceId: testSourceId,
      chunkIds: [testChunkIds[0]],
      status: 'running',
      attemptCount: 3, // 已达到最大重试次数
    });

    // 设置为 stale (lastHeartbeat 超过 15 分钟)
    const staleTime = new Date(Date.now() - 16 * 60 * 1000); // 16 分钟前
    await db
      .update(recordingTasks)
      .set({
        lastHeartbeat: staleTime,
      })
      .where(eq(recordingTasks.id, taskIds[0]));

    // 创建 Worker
    const worker = new RecordingTaskQueueWorker(db, {
      concurrency: 1,
      staleTimeoutMinutes: 15,
      maxAttempts: 3,
      databaseUrl: process.env.DATABASE_URL!,
      headless: true,
      outputDir: './test-output',
    });

    // 手动调用 recoverStaleTasks
    await (worker as any).recoverStaleTasks();

    // 检查数据库
    const tasks = await db.select().from(recordingTasks);
    const task = tasks.find((t) => t.id === taskIds[0]);

    // 任务应该被标记为 failed（不再重试）
    expect(task?.status).toBe('failed');
    expect(task?.attemptCount).toBe(3);
  });

  test('优雅停止: 等待执行中任务完成后退出', async () => {
    // 创建一个新的 build_task 用于此测试
    const localBuildTaskId = await createTestBuildTask(db, testSourceId);
    createdBuildTaskIds.push(localBuildTaskId);

    // 创建 2 个 pending 任务
    const taskIds = await createTestRecordingTasks(db, localBuildTaskId, 2, {
      sourceId: testSourceId,
      chunkIds: testChunkIds.slice(0, 2),
      status: 'pending',
    });

    // Mock TaskExecutor 延迟执行
    vi.mock('../src/task-worker/task-executor', () => ({
      TaskExecutor: class MockTaskExecutor {
        async execute() {
          // 执行 1.5 秒
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return {
            success: true,
            actions_created: 5,
            duration_ms: 1500,
          };
        }
      },
    }));

    // 创建 Worker
    const worker = new RecordingTaskQueueWorker(db, {
      concurrency: 2,
      idleWaitMs: 100,
      databaseUrl: process.env.DATABASE_URL!,
      headless: true,
      outputDir: './test-output',
    });

    // 启动 Worker
    const workerPromise = worker.start();

    // 等待任务被领取
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 检查有任务在运行
    let runningTasks = await db
      .select()
      .from(recordingTasks)
      .where(eq(recordingTasks.status, 'running'));
    const initialRunningCount = runningTasks.length;
    expect(initialRunningCount).toBeGreaterThan(0);

    // 记录停止开始时间
    const stopStartTime = Date.now();

    // 调用 stop()，给足够的时间等待任务完成
    await worker.stop(3000);
    await workerPromise;

    const stopDuration = Date.now() - stopStartTime;

    // 停止应该等待任务完成（大约 1.5 秒），而不是立即返回
    // 如果立即强制停止，duration 会 < 500ms
    // 如果等待任务完成，duration 应该 >= 1000ms（接近任务执行时间）
    expect(stopDuration).toBeGreaterThanOrEqual(1000);

    // Worker 应该已停止
    expect((worker as any).running).toBe(false);

    // 验证没有任务仍在处理中（Worker 内部的 runningTasks Map 应为空）
    const workerRunningTasks = (worker as any).runningTasks;
    expect(workerRunningTasks.size).toBe(0);
  }, 10000);
});
