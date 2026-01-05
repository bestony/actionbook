#!/usr/bin/env npx tsx
/**
 * Check recent recording tasks (last 3 hours)
 */

import 'dotenv/config'
import {
  getDb,
  recordingTasks,
  sources,
  chunks,
  sql,
  desc,
  gte,
  eq,
} from '@actionbookdev/db'

const db = getDb()

async function checkRecentTasks() {
  console.log('🔍 Checking recording tasks from last 3 hours...\n')

  // Calculate 3 hours ago
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)

  // Query tasks from last 3 hours
  const tasks = await db
    .select({
      id: recordingTasks.id,
      sourceId: recordingTasks.sourceId,
      sourceDomain: sources.domain,
      scenario: recordingTasks.scenario,
      status: recordingTasks.status,
      startUrl: recordingTasks.startUrl,
      progress: recordingTasks.progress,
      elementsDiscovered: recordingTasks.elementsDiscovered,
      pagesDiscovered: recordingTasks.pagesDiscovered,
      attemptCount: recordingTasks.attemptCount,
      durationMs: recordingTasks.durationMs,
      errorMessage: recordingTasks.errorMessage,
      startedAt: recordingTasks.startedAt,
      completedAt: recordingTasks.completedAt,
      createdAt: recordingTasks.createdAt,
    })
    .from(recordingTasks)
    .leftJoin(sources, eq(recordingTasks.sourceId, sources.id))
    .where(gte(recordingTasks.createdAt, threeHoursAgo))
    .orderBy(desc(recordingTasks.createdAt))

  console.log(`Total tasks: ${tasks.length}\n`)

  // Group by status
  const byStatus = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log('📊 Status Summary:')
  console.log(JSON.stringify(byStatus, null, 2))
  console.log('')

  // Show failed tasks
  const failedTasks = tasks.filter(t => t.status === 'failed')
  if (failedTasks.length > 0) {
    console.log(`\n❌ Failed tasks (${failedTasks.length}):`)
    console.log('─'.repeat(100))
    failedTasks.forEach(task => {
      console.log(`\nTask #${task.id}`)
      console.log(`  Domain: ${task.sourceDomain}`)
      console.log(`  Scenario: ${task.scenario || 'N/A'}`)
      console.log(`  Start URL: ${task.startUrl}`)
      console.log(`  Attempts: ${task.attemptCount}`)
      console.log(`  Duration: ${task.durationMs ? `${task.durationMs}ms` : 'N/A'}`)
      console.log(`  Created: ${task.createdAt?.toISOString()}`)
      console.log(`  Error: ${task.errorMessage || 'N/A'}`)
    })
    console.log('')
  }

  // Show running tasks
  const runningTasks = tasks.filter(t => t.status === 'running')
  if (runningTasks.length > 0) {
    console.log(`\n⏳ Running tasks (${runningTasks.length}):`)
    console.log('─'.repeat(100))
    runningTasks.forEach(task => {
      console.log(`\nTask #${task.id}`)
      console.log(`  Domain: ${task.sourceDomain}`)
      console.log(`  Scenario: ${task.scenario || 'N/A'}`)
      console.log(`  Progress: ${task.progress}%`)
      console.log(`  Elements: ${task.elementsDiscovered}`)
      console.log(`  Pages: ${task.pagesDiscovered}`)
      console.log(`  Started: ${task.startedAt?.toISOString()}`)
    })
    console.log('')
  }

  // Show completed tasks
  const completedTasks = tasks.filter(t => t.status === 'completed')
  if (completedTasks.length > 0) {
    console.log(`\n✅ Completed tasks (${completedTasks.length}):`)
    console.log('─'.repeat(100))
    completedTasks.forEach(task => {
      console.log(`\nTask #${task.id}`)
      console.log(`  Domain: ${task.sourceDomain}`)
      console.log(`  Scenario: ${task.scenario || 'N/A'}`)
      console.log(`  Elements: ${task.elementsDiscovered}`)
      console.log(`  Pages: ${task.pagesDiscovered}`)
      console.log(`  Duration: ${task.durationMs ? `${task.durationMs}ms` : 'N/A'}`)
    })
    console.log('')
  }

  // Show detailed stats
  console.log('\n📈 Detailed Statistics:')
  const avgDuration = tasks
    .filter(t => t.durationMs)
    .reduce((sum, t) => sum + (t.durationMs || 0), 0) / tasks.filter(t => t.durationMs).length || 0
  const totalElements = tasks.reduce((sum, t) => sum + t.elementsDiscovered, 0)
  const totalPages = tasks.reduce((sum, t) => sum + t.pagesDiscovered, 0)

  console.log(`  Average duration: ${avgDuration.toFixed(0)}ms`)
  console.log(`  Total elements discovered: ${totalElements}`)
  console.log(`  Total pages discovered: ${totalPages}`)
  console.log(`  Avg elements per task: ${(totalElements / tasks.length).toFixed(1)}`)
  console.log(`  Avg pages per task: ${(totalPages / tasks.length).toFixed(1)}`)
  console.log('')
}

checkRecentTasks()
  .then(() => {
    console.log('✅ Done')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
