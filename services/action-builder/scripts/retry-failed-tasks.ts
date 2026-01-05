#!/usr/bin/env npx tsx
/**
 * Retry failed tasks from last N hours
 * Resets failed tasks back to pending status so they can be re-executed
 */

import 'dotenv/config'
import {
  getDb,
  recordingTasks,
  sources,
  eq,
  and,
  gte,
  desc,
} from '@actionbookdev/db'

const db = getDb()

async function retryFailedTasks(hoursAgo: number = 5) {
  console.log(`🔄 Retrying failed tasks from last ${hoursAgo} hours...\n`)

  // Calculate time threshold
  const timeThreshold = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)

  // Query failed tasks
  const failedTasks = await db
    .select({
      id: recordingTasks.id,
      sourceId: recordingTasks.sourceId,
      sourceDomain: sources.domain,
      status: recordingTasks.status,
      errorMessage: recordingTasks.errorMessage,
      attemptCount: recordingTasks.attemptCount,
      createdAt: recordingTasks.createdAt,
    })
    .from(recordingTasks)
    .leftJoin(sources, eq(recordingTasks.sourceId, sources.id))
    .where(
      and(
        eq(recordingTasks.status, 'failed'),
        gte(recordingTasks.createdAt, timeThreshold)
      )
    )
    .orderBy(desc(recordingTasks.createdAt))

  console.log(`Found ${failedTasks.length} failed tasks\n`)

  if (failedTasks.length === 0) {
    console.log('No failed tasks to retry.')
    return
  }

  // Show summary
  console.log('📋 Tasks to retry:')
  console.log('─'.repeat(80))

  // Group by domain
  const byDomain: Record<string, number> = {}
  for (const task of failedTasks) {
    const domain = task.sourceDomain || 'unknown'
    byDomain[domain] = (byDomain[domain] || 0) + 1
  }

  for (const [domain, count] of Object.entries(byDomain).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${domain}: ${count} tasks`)
  }
  console.log('─'.repeat(80))
  console.log(`Total: ${failedTasks.length} tasks\n`)

  // Check for --yes flag to skip confirmation
  const skipConfirm = process.argv.includes('--yes') || process.argv.includes('-y')

  if (!skipConfirm) {
    console.log('ℹ️  To reset these tasks, run with --yes flag:')
    console.log(`   npx tsx scripts/retry-failed-tasks.ts --hours=${hoursAgo} --yes\n`)
    return
  }

  console.log('🔄 Resetting tasks to pending...')

  // Reset tasks to pending
  const taskIds = failedTasks.map(t => t.id)

  const result = await db
    .update(recordingTasks)
    .set({
      status: 'pending',
      progress: 0,
      errorMessage: null,
      lastHeartbeat: null,
      startedAt: null,
      completedAt: null,
      // Reset attemptCount to 0 so they get fresh retries
      attemptCount: 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(recordingTasks.status, 'failed'),
        gte(recordingTasks.createdAt, timeThreshold)
      )
    )

  console.log(`✅ Successfully reset ${failedTasks.length} tasks to pending status`)
  console.log('\nThese tasks will be picked up by the worker on the next poll cycle.')
  console.log('You can monitor progress with: pnpm worker:build-task\n')

  // Show some example task IDs
  console.log('📝 Sample task IDs reset:')
  console.log(taskIds.slice(0, 10).join(', '))
  if (taskIds.length > 10) {
    console.log(`... and ${taskIds.length - 10} more`)
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const hoursArg = args.find(arg => arg.startsWith('--hours='))
const hours = hoursArg ? parseInt(hoursArg.split('=')[1]) : 5

retryFailedTasks(hours)
  .then(() => {
    console.log('\n✅ Done')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
