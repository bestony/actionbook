/**
 * RecordingTaskQueueWorker - Recording Task Queue Worker
 *
 * Responsibilities:
 * - Continuously consume pending tasks from DB (global queue)
 * - Execute recording_task
 * - Update task status to DB
 * - Maintain task heartbeat
 * - Recover stale tasks
 *
 * Features:
 * - Global queue: Does not distinguish build_task, uniformly consumes all pending tasks
 * - Concurrency control: Configure concurrency parameter to control max concurrent count
 * - Heartbeat mechanism: Periodically update lastHeartbeat, prevent being mistakenly identified as stale
 * - Stale recovery: Check and recover stale tasks at startup and periodically during runtime
 */

import type { Database } from '@actionbookdev/db';
import { recordingTasks } from '@actionbookdev/db';
import { eq, sql } from 'drizzle-orm';
import { TaskExecutor } from './task-executor.js';
import type { TaskExecutorConfig, RecordingTask } from './types/index.js';

export interface RecordingTaskQueueWorkerConfig extends TaskExecutorConfig {
  /** Max concurrent execution count */
  concurrency?: number;
  /** Idle wait interval when no tasks (milliseconds) */
  idleWaitMs?: number;
  /** Task heartbeat interval (milliseconds) */
  heartbeatIntervalMs?: number;
  /** Max retry attempts (for stale recovery) */
  maxAttempts?: number;
  /** Stale task detection threshold (minutes) */
  staleTimeoutMinutes?: number;
}

interface RunningTask {
  id: number;
  executor: TaskExecutor;
  heartbeatTimer: NodeJS.Timeout;
  promise: Promise<void>;
}

export class RecordingTaskQueueWorker {
  private db: Database;
  private config: {
    databaseUrl: string;
    concurrency: number;
    idleWaitMs: number;
    heartbeatIntervalMs: number;
    taskTimeoutMinutes: number;
    maxAttempts: number;
    staleTimeoutMinutes: number;
    headless: boolean;
    maxTurns: number;
    outputDir: string;
    profileEnabled: boolean;
    profileDir: string;
    llmApiKey?: string;
    llmBaseURL?: string;
    llmModel?: string;
  };
  private running = false;
  private runningTasks = new Map<number, RunningTask>();
  private gracefulShutdownTimeout?: number;

  constructor(db: Database, config: RecordingTaskQueueWorkerConfig = {} as RecordingTaskQueueWorkerConfig) {
    this.db = db;
    this.config = {
      databaseUrl: config.databaseUrl ?? process.env.DATABASE_URL!,
      concurrency: config.concurrency ?? 3,
      idleWaitMs: config.idleWaitMs ?? 1000,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 5000,
      taskTimeoutMinutes: config.taskTimeoutMinutes ?? 10,
      maxAttempts: config.maxAttempts ?? 3,
      staleTimeoutMinutes: config.staleTimeoutMinutes ?? 15,
      headless: config.headless ?? true,
      maxTurns: config.maxTurns ?? 30,
      outputDir: config.outputDir ?? './output',
      profileEnabled: config.profileEnabled ?? false,
      profileDir: config.profileDir ?? '.browser-profile',
      llmApiKey: config.llmApiKey,
      llmBaseURL: config.llmBaseURL,
      llmModel: config.llmModel,
    };
  }

  /**
   * Start queue consumption
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('[QueueWorker] Already running');
      return;
    }

    this.running = true;
    console.log(
      `[QueueWorker] Starting with concurrency=${this.config.concurrency}`
    );

    // Recover stale tasks at startup
    await this.recoverStaleTasks();

    // Enter main loop
    await this.mainLoop();
  }

  /**
   * Stop queue consumption (graceful shutdown)
   */
  async stop(timeoutMs?: number): Promise<void> {
    if (!this.running) {
      return;
    }

    this.gracefulShutdownTimeout = timeoutMs;
    console.log(
      `[QueueWorker] Stopping gracefully (timeout=${timeoutMs ?? 'none'}ms)...`
    );
    this.running = false;

    // Wait for all executing tasks to complete
    const startTime = Date.now();
    while (this.runningTasks.size > 0) {
      if (
        this.gracefulShutdownTimeout &&
        Date.now() - startTime > this.gracefulShutdownTimeout
      ) {
        console.log(
          `[QueueWorker] Graceful shutdown timeout, forcing stop. ` +
            `${this.runningTasks.size} tasks still running`
        );

        // Log incomplete tasks
        const incompleteTasks = Array.from(this.runningTasks.keys());
        console.log(
          `[QueueWorker] Incomplete tasks: ${incompleteTasks.join(', ')}`
        );

        // Stop all heartbeats
        for (const task of this.runningTasks.values()) {
          clearInterval(task.heartbeatTimer);
        }
        break;
      }

      await this.sleep(100);
    }

    console.log('[QueueWorker] Stopped');
  }

  /**
   * Main loop
   */
  private async mainLoop(): Promise<void> {
    while (this.running) {
      try {
        // 1. Recover stale tasks
        await this.recoverStaleTasks();

        // 2. Fill execution slots
        while (
          this.running &&
          this.runningTasks.size < this.config.concurrency
        ) {
          // 2.1 Atomically claim a pending task
          const task = await this.claimTask();

          if (!task) {
            // No task available to claim, break out of filling loop
            break;
          }

          // 2.2 Start execution (non-blocking)
          await this.startExecution(task);
        }

        // 3. If no executing tasks, wait before continuing
        if (this.runningTasks.size === 0) {
          await this.sleep(this.config.idleWaitMs);
          continue;
        }

        // 4. Wait for any task to complete
        await Promise.race(
          Array.from(this.runningTasks.values()).map((t) => t.promise)
        );
      } catch (error) {
        console.error('[QueueWorker] Main loop error:', error);
        await this.sleep(1000);
      }
    }
  }

  /**
   * Atomically claim a pending task
   * Use FOR UPDATE SKIP LOCKED to ensure concurrency safety
   */
  private async claimTask(): Promise<RecordingTask | null> {
    try {
      const result = await this.db.execute(sql`
        UPDATE ${recordingTasks}
        SET
          status = 'running',
          started_at = NOW(),
          last_heartbeat = NOW(),
          updated_at = NOW()
        WHERE id = (
          SELECT id
          FROM ${recordingTasks}
          WHERE status = 'pending'
          ORDER BY updated_at DESC, id  -- Retry tasks priority (recently updated)
          LIMIT 1
          FOR UPDATE SKIP LOCKED  -- Skip locked rows
        )
        RETURNING *
      `);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0] as any;
      return {
        id: row.id,
        sourceId: row.source_id,
        chunkId: row.chunk_id,
        startUrl: row.start_url,
        status: row.status,
        progress: row.progress,
        config: row.config,
        attemptCount: row.attempt_count,
        errorMessage: row.error_message,
        completedAt: row.completed_at,
        lastHeartbeat: row.last_heartbeat,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      console.error('[QueueWorker] Failed to claim task:', error);
      return null;
    }
  }

  /**
   * Start task execution
   */
  private async startExecution(task: RecordingTask): Promise<void> {
    console.log(`[QueueWorker] Starting task #${task.id}`);

    // Create TaskExecutor
    const executor = new TaskExecutor(this.db, this.config);

    // Start heartbeat
    const heartbeatTimer = setInterval(() => {
      this.updateTaskHeartbeat(task.id).catch((error: unknown) => {
        console.error(`[QueueWorker] Task #${task.id} heartbeat error:`, error);
      });
    }, this.config.heartbeatIntervalMs);

    // Execute task (non-blocking)
    const promise = executor
      .execute(task)
      .then(() => {
        console.log(`[QueueWorker] Task #${task.id} completed`);
      })
      .catch((error: unknown) => {
        console.error(`[QueueWorker] Task #${task.id} failed:`, error);
      })
      .finally(() => {
        // Cleanup
        clearInterval(heartbeatTimer);
        this.runningTasks.delete(task.id);
      });

    // Save to running tasks list
    this.runningTasks.set(task.id, {
      id: task.id,
      executor,
      heartbeatTimer,
      promise,
    });
  }

  /**
   * Update task heartbeat
   */
  private async updateTaskHeartbeat(taskId: number): Promise<void> {
    await this.db
      .update(recordingTasks)
      .set({
        lastHeartbeat: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(recordingTasks.id, taskId));
  }

  /**
   * Recover stale tasks
   * Find tasks that are running but lastHeartbeat has timed out
   */
  private async recoverStaleTasks(): Promise<void> {
    try {
      const staleThresholdMs = this.config.staleTimeoutMinutes * 60 * 1000;
      const staleThreshold = new Date(Date.now() - staleThresholdMs);

      const maxAttempts = this.config.maxAttempts;
      const result = await this.db.execute(sql`
        WITH stale_tasks AS (
          SELECT
            id,
            attempt_count,
            CASE
              WHEN attempt_count < ${maxAttempts} THEN 'pending'
              ELSE 'failed'
            END AS new_status
          FROM ${recordingTasks}
          WHERE
            status = 'running'
            AND last_heartbeat < ${staleThreshold}
        )
        UPDATE ${recordingTasks}
        SET
          status = stale_tasks.new_status,
          attempt_count = CASE
            WHEN stale_tasks.new_status = 'pending' THEN "recording_tasks".attempt_count + 1
            ELSE "recording_tasks".attempt_count
          END,
          error_message = CASE
            WHEN stale_tasks.new_status = 'failed' THEN 'Task stale: max attempts reached'
            ELSE NULL
          END,
          updated_at = NOW()
        FROM stale_tasks
        WHERE ${recordingTasks.id} = stale_tasks.id
        RETURNING ${recordingTasks.id}, ${recordingTasks.status}
      `);

      if (result.rows.length > 0) {
        console.log(
          `[QueueWorker] Recovered ${result.rows.length} stale tasks`
        );
        for (const row of result.rows as any[]) {
          console.log(`  - Task #${row.id}: ${row.status}`);
        }
      }
    } catch (error) {
      console.error('[QueueWorker] Failed to recover stale tasks:', error);
    }
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current running status
   */
  getStatus(): {
    running: boolean;
    runningTaskCount: number;
    runningTaskIds: number[];
  } {
    return {
      running: this.running,
      runningTaskCount: this.runningTasks.size,
      runningTaskIds: Array.from(this.runningTasks.keys()),
    };
  }
}
