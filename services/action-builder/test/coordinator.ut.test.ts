/**
 * Coordinator Unit Tests
 *
 * 测试 Coordinator 的核心功能:
 * - BuildTask 并发控制
 * - BuildTask 领取和启动
 * - 清理完成的任务
 * - 优雅关闭
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { getDb } from '@actionbookdev/db';
import type { Database } from '@actionbookdev/db';
import { buildTasks, recordingTasks } from '@actionbookdev/db';
import { eq, sql } from 'drizzle-orm';
import { Coordinator } from '../src/task-worker/coordinator';
import {
  createTestSource,
  createTestDocument,
  createTestChunks,
  cleanupTestData,
  cleanupTestSource,
  waitForCondition,
} from './helpers/test-helpers';

describe('Coordinator', () => {
  let db: Database;
  let testSourceId: number;
  let testDocumentId: number;
  let testChunkIds: number[];
  let createdBuildTaskIds: number[] = [];

  beforeAll(async () => {
    db = getDb();

    // 创建测试数据
    testSourceId = await createTestSource(db);
    testDocumentId = await createTestDocument(db, testSourceId);
    testChunkIds = await createTestChunks(db, testDocumentId, 5);
  });

  afterAll(async () => {
    // 清理测试数据
    await cleanupTestData(db, createdBuildTaskIds);
    await cleanupTestSource(db, testSourceId);
  });

  beforeEach(async () => {
    // 清理所有测试 build_tasks
    if (createdBuildTaskIds.length > 0) {
      await cleanupTestData(db, createdBuildTaskIds);
      createdBuildTaskIds = [];
    }
  });

  test('BuildTask 领取: 领取 knowledge_build completed 任务', async () => {
    // 清理所有 build_tasks 确保干净的测试环境
    await db.delete(buildTasks);

    // 创建 3 个 build_tasks: 2 completed, 1 running
    const buildTask1 = await db
      .insert(buildTasks)
      .values({
        sourceId: testSourceId,
        sourceUrl: 'https://test1.com',
        sourceName: 'test1',
        sourceCategory: 'help',
        stage: 'knowledge_build',
        stageStatus: 'completed',
        config: {},
      })
      .returning({ id: buildTasks.id });
    createdBuildTaskIds.push(buildTask1[0].id);

    const buildTask2 = await db
      .insert(buildTasks)
      .values({
        sourceId: testSourceId,
        sourceUrl: 'https://test2.com',
        sourceName: 'test2',
        sourceCategory: 'help',
        stage: 'knowledge_build',
        stageStatus: 'completed',
        config: {},
      })
      .returning({ id: buildTasks.id });
    createdBuildTaskIds.push(buildTask2[0].id);

    const buildTask3 = await db
      .insert(buildTasks)
      .values({
        sourceId: testSourceId,
        sourceUrl: 'https://test3.com',
        sourceName: 'test3',
        sourceCategory: 'help',
        stage: 'knowledge_build',
        stageStatus: 'running',
        config: {},
      })
      .returning({ id: buildTasks.id });
    createdBuildTaskIds.push(buildTask3[0].id);

    // 创建 Coordinator
    const coordinator = new Coordinator(db, {
      maxConcurrentBuildTasks: 5,
      buildTaskPollIntervalSeconds: 1,
      queueWorker: {
        concurrency: 2,
        databaseUrl: process.env.DATABASE_URL!,
        headless: true,
        outputDir: './test-output',
      },
    });

    // 手动调用 claimBuildTask
    const claimed = await (coordinator as any).claimBuildTask();

    expect(claimed).toBeDefined();
    expect([buildTask1[0].id, buildTask2[0].id]).toContain(claimed.id);

    // 检查数据库中的状态
    const tasks = await db.select().from(buildTasks);
    const claimedTask = tasks.find((t) => t.id === claimed.id);

    expect(claimedTask?.stage).toBe('action_build');
    expect(claimedTask?.stageStatus).toBe('running');
  });

  test('BuildTask 并发控制: 最多 N 个 build_task 同时运行', async () => {
    // 创建 5 个 completed build_tasks
    for (let i = 0; i < 5; i++) {
      const result = await db
        .insert(buildTasks)
        .values({
          sourceId: testSourceId,
          sourceUrl: `https://test${i}.com`,
          sourceName: `test${i}`,
          sourceCategory: 'help',
          stage: 'knowledge_build',
          stageStatus: 'completed',
          config: {},
        })
        .returning({ id: buildTasks.id });
      createdBuildTaskIds.push(result[0].id);
    }

    // Mock BuildTaskRunner 延迟执行
    vi.mock('../src/task-worker/build-task-runner', () => ({
      BuildTaskRunner: class MockBuildTaskRunner {
        constructor(public db: any, public buildTaskId: number, public config?: any) {}
        async run() {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      },
    }));

    // 创建 Coordinator，maxConcurrentBuildTasks=3
    const coordinator = new Coordinator(db, {
      maxConcurrentBuildTasks: 3,
      buildTaskPollIntervalSeconds: 1,
      queueWorker: {
        concurrency: 2,
        databaseUrl: process.env.DATABASE_URL!,
        headless: true,
        outputDir: './test-output',
      },
    });

    // 启动 Coordinator
    const coordinatorPromise = coordinator.start();

    // 等待一段时间
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 检查这些特定 build_task 的 running 数量
    const tasks = await db.select().from(buildTasks).where(
      (t: any) => sql`${t.id} IN (${sql.join(createdBuildTaskIds.map((id) => sql`${id}`), sql`, `)})`
    );
    const runningCount = tasks.filter(
      (t) => t.stage === 'action_build' && t.stageStatus === 'running'
    ).length;

    // 应该最多有 3 个 running
    expect(runningCount).toBeLessThanOrEqual(3);
    expect(runningCount).toBeGreaterThan(0);

    // 停止 Coordinator
    await coordinator.stop(2000);
    await coordinatorPromise;
  }, 10000);

  test('清理完成的任务: 自动清理 completed/failed build_tasks', async () => {
    // 创建 2 个 build_tasks
    const buildTask1 = await db
      .insert(buildTasks)
      .values({
        sourceId: testSourceId,
        sourceUrl: 'https://test1.com',
        sourceName: 'test1',
        sourceCategory: 'help',
        stage: 'knowledge_build',
        stageStatus: 'completed',
        config: {},
      })
      .returning({ id: buildTasks.id });
    createdBuildTaskIds.push(buildTask1[0].id);

    const buildTask2 = await db
      .insert(buildTasks)
      .values({
        sourceId: testSourceId,
        sourceUrl: 'https://test2.com',
        sourceName: 'test2',
        sourceCategory: 'help',
        stage: 'knowledge_build',
        stageStatus: 'completed',
        config: {},
      })
      .returning({ id: buildTasks.id });
    createdBuildTaskIds.push(buildTask2[0].id);

    // Mock BuildTaskRunner 快速完成
    vi.mock('../src/task-worker/build-task-runner', () => ({
      BuildTaskRunner: class MockBuildTaskRunner {
        constructor(public db: any, public buildTaskId: number, public config?: any) {}
        async run() {
          // 小延迟后完成
          await new Promise((resolve) => setTimeout(resolve, 100));
          await this.db
            .update(buildTasks)
            .set({ stageStatus: 'completed' })
            .where(eq(buildTasks.id, this.buildTaskId));
        }
      },
    }));

    // 创建 Coordinator
    const coordinator = new Coordinator(db, {
      maxConcurrentBuildTasks: 2,
      buildTaskPollIntervalSeconds: 1,
      queueWorker: {
        concurrency: 2,
        databaseUrl: process.env.DATABASE_URL!,
        headless: true,
        outputDir: './test-output',
      },
    });

    // 启动 Coordinator
    const coordinatorPromise = coordinator.start();

    // 等待任务被领取
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 获取正在运行的任务的 promises
    let runningBuildTasks = (coordinator as any).runningBuildTasks;
    const promises = Array.from(runningBuildTasks.values()).map((t: any) => t.promise);

    // 等待所有 promises 完成
    await Promise.all(promises);

    // 再等待一小段时间确保 finally 块执行
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 检查 runningBuildTasks 是否为空（已清理）
    runningBuildTasks = (coordinator as any).runningBuildTasks;
    expect(runningBuildTasks.size).toBe(0);

    // 停止 Coordinator
    await coordinator.stop(1000);
    await coordinatorPromise;
  }, 10000);

  test('优雅关闭: 等待所有任务完成或超时', async () => {
    // 创建 2 个 completed build_tasks
    for (let i = 0; i < 2; i++) {
      const result = await db
        .insert(buildTasks)
        .values({
          sourceId: testSourceId,
          sourceUrl: `https://test${i}.com`,
          sourceName: `test${i}`,
          sourceCategory: 'help',
          stage: 'knowledge_build',
          stageStatus: 'completed',
          config: {},
        })
        .returning({ id: buildTasks.id });
      createdBuildTaskIds.push(result[0].id);
    }

    // Mock BuildTaskRunner 延迟执行
    vi.mock('../src/task-worker/build-task-runner', () => ({
      BuildTaskRunner: class MockBuildTaskRunner {
        constructor(public db: any, public buildTaskId: number, public config?: any) {}
        async run() {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      },
    }));

    // 创建 Coordinator
    const coordinator = new Coordinator(db, {
      maxConcurrentBuildTasks: 2,
      buildTaskPollIntervalSeconds: 1,
      queueWorker: {
        concurrency: 2,
        databaseUrl: process.env.DATABASE_URL!,
        headless: true,
        outputDir: './test-output',
      },
    });

    // 启动 Coordinator
    const coordinatorPromise = coordinator.start();

    // 等待任务被领取
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 检查有任务在运行
    const runningBuildTasks = (coordinator as any).runningBuildTasks;
    const initialSize = runningBuildTasks.size;
    expect(initialSize).toBeGreaterThan(0);

    // 记录停止开始时间
    const stopStartTime = Date.now();

    // 停止 Coordinator (超时 1 秒)
    await coordinator.stop(1000);
    await coordinatorPromise;

    const stopDuration = Date.now() - stopStartTime;

    // 应该在超时时间内停止（允许 200ms 误差）
    expect(stopDuration).toBeLessThanOrEqual(1200);

    // Coordinator 应该已停止
    expect((coordinator as any).running).toBe(false);
  }, 10000);

  test('空队列处理: 无 build_task 时等待', async () => {
    // 确保没有任何可领取的 build_task
    await db.delete(buildTasks);

    // 创建 Coordinator
    const coordinator = new Coordinator(db, {
      maxConcurrentBuildTasks: 2,
      buildTaskPollIntervalSeconds: 1,
      queueWorker: {
        concurrency: 2,
        databaseUrl: process.env.DATABASE_URL!,
        headless: true,
        outputDir: './test-output',
      },
    });

    // 启动 Coordinator
    const coordinatorPromise = coordinator.start();

    // 等待一段时间
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 检查没有运行的 build_task
    const runningBuildTasks = (coordinator as any).runningBuildTasks;
    expect(runningBuildTasks.size).toBe(0);

    // Coordinator 应该仍在运行（等待状态）
    expect((coordinator as any).running).toBe(true);

    // 停止 Coordinator
    await coordinator.stop(1000);
    await coordinatorPromise;
  });
});
