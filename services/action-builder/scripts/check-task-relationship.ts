#!/usr/bin/env npx tsx
/**
 * Check the relationship between recording_tasks and their build_tasks
 */

import 'dotenv/config'
import {
  getDb,
  recordingTasks,
  eq,
  and,
  gte,
} from '@actionbookdev/db'

const db = getDb()

async function checkTaskRelationship() {
  console.log('🔍 Checking recording_tasks and their build_task relationship...\n')

  // Get pending recording tasks from last 5 hours
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000)

  const tasks = await db
    .select({
      id: recordingTasks.id,
      buildTaskId: recordingTasks.buildTaskId,
      status: recordingTasks.status,
      chunkId: recordingTasks.chunkId,
      createdAt: recordingTasks.createdAt,
    })
    .from(recordingTasks)
    .where(
      and(
        eq(recordingTasks.status, 'pending'),
        gte(recordingTasks.createdAt, fiveHoursAgo)
      )
    )
    .limit(100)

  console.log(`Found ${tasks.length} pending recording_tasks\n`)

  // Group by buildTaskId
  const byBuildTask: Record<string, number> = {}
  const noBuildTask: number[] = []

  for (const task of tasks) {
    if (task.buildTaskId === null || task.buildTaskId === undefined) {
      noBuildTask.push(task.id)
    } else {
      const key = String(task.buildTaskId)
      byBuildTask[key] = (byBuildTask[key] || 0) + 1
    }
  }

  console.log('📊 Recording tasks grouped by build_task_id:')
  console.log('─'.repeat(80))

  if (Object.keys(byBuildTask).length > 0) {
    for (const [buildTaskId, count] of Object.entries(byBuildTask).sort((a, b) => b[1] - a[1])) {
      console.log(`  build_task_id ${buildTaskId}: ${count} recording tasks`)
    }
  } else {
    console.log('  (no recording tasks with build_task_id)')
  }

  if (noBuildTask.length > 0) {
    console.log(`\n  ⚠️  ${noBuildTask.length} recording tasks WITHOUT build_task_id`)
    console.log(`      Task IDs: ${noBuildTask.slice(0, 10).join(', ')}${noBuildTask.length > 10 ? '...' : ''}`)
  }

  console.log('─'.repeat(80))

  // Check if these build_tasks exist and their status
  if (Object.keys(byBuildTask).length > 0) {
    console.log('\n📋 Checking status of corresponding build_tasks...\n')

    for (const buildTaskId of Object.keys(byBuildTask)) {
      // Note: We'd need to query build_tasks table here
      // For now, just show the IDs
      console.log(`  build_task_id: ${buildTaskId}`)
    }
  }

  // Recommendation
  console.log('\n💡 Recommendation:')
  if (noBuildTask.length > 0) {
    console.log('  ⚠️  These recording tasks have no build_task_id!')
    console.log('  They were likely created manually or their build_task was deleted.')
    console.log('  BuildTaskWorker only processes recording_tasks that belong to a pending build_task.')
    console.log('\n  Options:')
    console.log('  1. Delete these orphaned tasks')
    console.log('  2. Assign them to a new build_task')
    console.log('  3. Run them directly with a different worker (if available)')
  } else {
    console.log('  All recording tasks have build_task_id.')
    console.log('  Check if their corresponding build_tasks are in pending status.')
  }
}

checkTaskRelationship()
  .then(() => {
    console.log('\n✅ Done')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
