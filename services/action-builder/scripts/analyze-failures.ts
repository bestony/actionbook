#!/usr/bin/env npx tsx
/**
 * Analyze failure reasons in detail
 */

import 'dotenv/config'
import {
  getDb,
  recordingTasks,
  sources,
  desc,
  gte,
  eq,
} from '@actionbookdev/db'

const db = getDb()

async function analyzeFailures() {
  console.log('🔍 Analyzing failure reasons in detail...\n')

  // Calculate 3 hours ago
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000)

  // Query failed tasks from last 3 hours
  const failedTasks = await db
    .select({
      id: recordingTasks.id,
      sourceId: recordingTasks.sourceId,
      sourceDomain: sources.domain,
      errorMessage: recordingTasks.errorMessage,
      attemptCount: recordingTasks.attemptCount,
      createdAt: recordingTasks.createdAt,
    })
    .from(recordingTasks)
    .leftJoin(sources, eq(recordingTasks.sourceId, sources.id))
    .where(gte(recordingTasks.createdAt, threeHoursAgo))
    .orderBy(desc(recordingTasks.createdAt))

  const failed = failedTasks.filter(t => t.errorMessage)

  console.log(`Total failed tasks with error messages: ${failed.length}\n`)

  // Categorize errors
  const errorCategories: Record<string, { count: number; examples: string[] }> = {}

  for (const task of failed) {
    const error = task.errorMessage || 'Unknown'

    // Categorize by error pattern
    let category = 'Other'

    if (error.includes('Cannot read properties of undefined')) {
      category = 'Null Pointer (read properties)'
    } else if (error.includes('Cannot read property')) {
      category = 'Null Pointer (read property)'
    } else if (error.includes('ECONNREFUSED')) {
      category = 'Browser Connection (ECONNREFUSED)'
    } else if (error.includes('Target closed')) {
      category = 'Browser Connection (Target closed)'
    } else if (error.includes('Browser closed')) {
      category = 'Browser Connection (Browser closed)'
    } else if (error.includes('Connection closed')) {
      category = 'Browser Connection (Connection closed)'
    } else if (error.includes('Protocol error')) {
      category = 'Browser Connection (Protocol error)'
    } else if (error.includes('Session closed')) {
      category = 'Browser Connection (Session closed)'
    } else if (error.includes('ECONNRESET')) {
      category = 'Browser Connection (ECONNRESET)'
    } else if (error.includes('socket hang up')) {
      category = 'Browser Connection (socket hang up)'
    } else if (error.includes('timeout')) {
      category = 'Timeout'
    } else if (error.includes('Chunk ID is required')) {
      category = 'Configuration Error (Chunk ID)'
    } else if (error.includes('No LLM API key')) {
      category = 'Configuration Error (API Key)'
    } else if (error.includes('rate limit')) {
      category = 'API Rate Limit'
    } else if (error.includes('401') || error.includes('403')) {
      category = 'API Authentication Error'
    } else if (error.includes('500') || error.includes('502') || error.includes('503')) {
      category = 'API Server Error'
    } else if (error.includes('Recording failed')) {
      category = 'Recording Failed (check sub-message)'
    }

    if (!errorCategories[category]) {
      errorCategories[category] = { count: 0, examples: [] }
    }

    errorCategories[category].count++

    if (errorCategories[category].examples.length < 3) {
      errorCategories[category].examples.push(
        `Task #${task.id} (${task.sourceDomain}): ${error.substring(0, 100)}...`
      )
    }
  }

  // Sort by count
  const sorted = Object.entries(errorCategories).sort((a, b) => b[1].count - a[1].count)

  console.log('📊 Error Categories (sorted by frequency):\n')
  console.log('═'.repeat(100))

  for (const [category, data] of sorted) {
    const percentage = ((data.count / failed.length) * 100).toFixed(1)
    console.log(`\n${category}`)
    console.log(`  Count: ${data.count} (${percentage}%)`)
    console.log(`  Examples:`)
    for (const example of data.examples) {
      console.log(`    - ${example}`)
    }
  }

  console.log('\n' + '═'.repeat(100))
  console.log(`\nTotal failed tasks analyzed: ${failed.length}`)

  // Group by attempt count
  console.log('\n\n📈 Failure Distribution by Attempt Count:\n')
  const byAttempts: Record<number, number> = {}
  for (const task of failed) {
    const attempts = task.attemptCount || 1
    byAttempts[attempts] = (byAttempts[attempts] || 0) + 1
  }

  for (const [attempts, count] of Object.entries(byAttempts).sort()) {
    const percentage = ((count / failed.length) * 100).toFixed(1)
    console.log(`  ${attempts} attempt(s): ${count} tasks (${percentage}%)`)
  }
}

analyzeFailures()
  .then(() => {
    console.log('\n✅ Done')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
