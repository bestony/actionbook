#!/usr/bin/env npx tsx
/**
 * Playbook Builder E2E Test
 *
 * End-to-end test that runs the complete playbook building pipeline:
 * 1. Create a build task (init/pending)
 * 2. Controller claims and processes the task
 * 3. Verify task state transitions (init -> knowledge_build/running -> knowledge_build/completed)
 * 4. Verify documents and chunks are created in database
 *
 * Usage:
 *   npx tsx test/integration/scripts/simple-site-build.ts
 *
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string
 *   OPENROUTER_API_KEY or OPENAI_API_KEY or ANTHROPIC_API_KEY - LLM API key
 *
 * Options (via env vars):
 *   TEST_URL - URL to test (default: https://apple.com)
 *   TEST_HEADLESS - Run browser headlessly (default: true)
 *   TEST_MAX_PAGES - Max pages to process (default: 3)
 *   TEST_MAX_DEPTH - Max discovery depth (default: 1)
 */

import 'dotenv/config';
import assert from 'node:assert';
import { getDb, buildTasks, documents, chunks, eq, desc } from '@actionbookdev/db';
import { createPlaybookTaskController } from '../../../src/controller/index.js';

// Configuration from environment
const config = {
  url: process.env.TEST_URL || 'https://apple.com',
  headless: process.env.TEST_HEADLESS !== 'false',
  maxPages: parseInt(process.env.TEST_MAX_PAGES || '3', 10),
  maxDepth: parseInt(process.env.TEST_MAX_DEPTH || '1', 10),
};

/**
 * Create a build task for testing
 */
async function createTestBuildTask(): Promise<number> {
  const db = getDb();
  const domain = new URL(config.url).hostname;

  const [task] = await db
    .insert(buildTasks)
    .values({
      sourceUrl: config.url,
      sourceName: `E2E Test - ${domain}`,
      stage: 'init',
      stageStatus: 'pending',
      config: {
        playbookMaxPages: config.maxPages,
        playbookMaxDepth: config.maxDepth,
        playbookHeadless: config.headless,
      },
    })
    .returning({ id: buildTasks.id });

  return task.id;
}

/**
 * Get build task by ID
 */
async function getBuildTask(taskId: number) {
  const db = getDb();
  const [task] = await db
    .select()
    .from(buildTasks)
    .where(eq(buildTasks.id, taskId));
  return task;
}

/**
 * Verify task state transitions and results
 */
async function verifyResults(taskId: number): Promise<void> {
  const db = getDb();

  console.log('\n' + '='.repeat(60));
  console.log('Verification Results');
  console.log('='.repeat(60));

  // ========== Task State Assertions ==========
  console.log('\n' + '-'.repeat(60));
  console.log('Task State Machine Assertions');
  console.log('-'.repeat(60));

  const task = await getBuildTask(taskId);

  // Verify final state
  assert(task.stage === 'knowledge_build', `Expected stage 'knowledge_build', got '${task.stage}'`);
  console.log(`✅ Task stage: ${task.stage}`);

  assert(task.stageStatus === 'completed', `Expected stageStatus 'completed', got '${task.stageStatus}'`);
  console.log(`✅ Task stageStatus: ${task.stageStatus}`);

  // Verify timestamps
  assert(task.knowledgeStartedAt, 'Expected knowledgeStartedAt to be set');
  console.log(`✅ knowledgeStartedAt: ${task.knowledgeStartedAt}`);

  assert(task.knowledgeCompletedAt, 'Expected knowledgeCompletedAt to be set');
  console.log(`✅ knowledgeCompletedAt: ${task.knowledgeCompletedAt}`);

  // Verify sourceId was assigned
  assert(task.sourceId, 'Expected sourceId to be assigned');
  console.log(`✅ sourceId assigned: ${task.sourceId}`);

  // Verify no error
  assert(!task.errorMessage, `Unexpected error: ${task.errorMessage}`);
  console.log(`✅ No error message`);

  // ========== Document/Chunk Assertions ==========
  console.log('\n' + '-'.repeat(60));
  console.log('Document & Chunk Assertions');
  console.log('-'.repeat(60));

  // Verify documents
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.sourceId, task.sourceId!))
    .orderBy(desc(documents.id))
    .limit(20);

  assert(docs.length > 0, 'Expected at least 1 document');
  console.log(`✅ Documents created: ${docs.length}`);

  // Verify chunks
  let totalChunks = 0;
  let chunksWithEmbedding = 0;

  console.log(`\nDocuments:`);
  for (const doc of docs) {
    assert(doc.url, `Document ${doc.id} should have a URL`);
    assert(doc.title, `Document ${doc.id} should have a title`);

    console.log(`  [${doc.id}] ${doc.title}`);
    console.log(`      URL: ${doc.url}`);

    const docChunks = await db
      .select()
      .from(chunks)
      .where(eq(chunks.documentId, doc.id));

    assert(docChunks.length > 0, `Document ${doc.id} should have at least 1 chunk`);

    for (const chunk of docChunks) {
      totalChunks++;
      assert(chunk.content, `Chunk ${chunk.id} should have content`);
      assert(chunk.content.length > 0, `Chunk ${chunk.id} content should not be empty`);

      if (chunk.embedding) chunksWithEmbedding++;

      const preview = chunk.content.substring(0, 80).replace(/\n/g, ' ');
      console.log(`      Chunk [${chunk.id}]: ${preview}...`);
    }
  }

  console.log(`\n✅ Total chunks: ${totalChunks}`);
  console.log(`✅ All chunks have content`);

  if (process.env.OPENAI_API_KEY) {
    assert(chunksWithEmbedding > 0, 'Expected embeddings when OPENAI_API_KEY is set');
    console.log(`✅ Chunks with embeddings: ${chunksWithEmbedding}/${totalChunks}`);
  } else {
    console.log(`ℹ️  Embeddings skipped (no OPENAI_API_KEY)`);
  }

  console.log('\n' + '-'.repeat(60));
  console.log('All assertions passed!');
  console.log('-'.repeat(60));
}

/**
 * Cleanup test task
 */
async function cleanupTestTask(taskId: number): Promise<void> {
  const db = getDb();
  const task = await getBuildTask(taskId);

  if (task) {
    // Delete chunks and documents if sourceId exists
    if (task.sourceId) {
      const docs = await db
        .select()
        .from(documents)
        .where(eq(documents.sourceId, task.sourceId));

      for (const doc of docs) {
        await db.delete(chunks).where(eq(chunks.documentId, doc.id));
      }
      await db.delete(documents).where(eq(documents.sourceId, task.sourceId));
    }

    // Delete the task
    await db.delete(buildTasks).where(eq(buildTasks.id, taskId));
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Playbook Builder E2E Test');
  console.log('='.repeat(60));
  console.log('');
  console.log('Configuration:');
  console.log(`  URL: ${config.url}`);
  console.log(`  Headless: ${config.headless}`);
  console.log(`  Max pages: ${config.maxPages}`);
  console.log(`  Max depth: ${config.maxDepth}`);
  console.log('');

  // Check environment
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const hasLLMKey = !!(
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  );

  if (!hasLLMKey) {
    console.error('ERROR: LLM API key required (OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY)');
    process.exit(1);
  }

  const startTime = Date.now();
  let taskId: number | null = null;

  try {
    // Step 1: Create build task
    console.log('Step 1: Creating build task...');
    taskId = await createTestBuildTask();
    console.log(`  Created task #${taskId} with stage=init, stageStatus=pending`);

    // Verify initial state
    let task = await getBuildTask(taskId);
    assert(task.stage === 'init', 'Initial stage should be init');
    assert(task.stageStatus === 'pending', 'Initial stageStatus should be pending');
    console.log(`  ✅ Initial state verified: ${task.stage}/${task.stageStatus}`);

    // Step 2: Run controller to process the task
    console.log('\nStep 2: Running controller.checkOnce()...');
    const controller = createPlaybookTaskController();
    const processed = await controller.checkOnce();

    assert(processed, 'Controller should have processed the task');
    console.log(`  ✅ Task processed by controller`);

    // Step 3: Verify state after processing
    console.log('\nStep 3: Verifying task state after processing...');
    task = await getBuildTask(taskId);
    console.log(`  Current state: ${task.stage}/${task.stageStatus}`);

    if (task.stage === 'error') {
      console.error(`  ❌ Task failed with error: ${task.errorMessage}`);
      throw new Error(`Task failed: ${task.errorMessage}`);
    }

    // Step 4: Full verification
    console.log('\nStep 4: Running full verification...');
    await verifyResults(taskId);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ E2E Test PASSED in ${duration}s`);
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('\n❌ E2E Test FAILED:', error);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nFailed after ${duration}s`);
    process.exit(1);
  } finally {
    // Cleanup (optional - comment out to inspect data after test)
    // if (taskId) {
    //   console.log('\nCleaning up test data...');
    //   await cleanupTestTask(taskId);
    // }
  }
}

// Run
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});