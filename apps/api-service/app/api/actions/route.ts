/**
 * Get Action by ID Endpoint
 * GET /api/actions?id=<url>
 *
 * Supports URL-based action_id via query parameter
 * Example: GET /api/actions?id=https://example.com/page
 * Example: GET /api/actions?id=https://example.com/page#chunk-1
 */

import { NextRequest, NextResponse } from 'next/server'
import type { ApiError } from '@/lib/types'
import { getDb, chunks, documents, sources, eq, and, sql } from '@actionbookdev/db'
import {
  parseActionId,
  generateActionId,
  isValidActionId,
  normalizeActionId,
  urlSimilarity,
} from '@/lib/action-id'
import { or, inArray } from '@actionbookdev/db'

interface ActionContent {
  action_id: string
  content: string
  elements: string | null
  createdAt: string
  documentId: number
  documentTitle: string | null
  documentUrl: string
  chunkIndex: number
  heading: string | null
  tokenCount: number
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<ActionContent | ApiError>> {
  const { searchParams } = new URL(request.url)
  const actionId = searchParams.get('id')

  // Validate id parameter is provided
  if (!actionId) {
    return NextResponse.json(
      {
        error: 'MISSING_PARAM',
        code: '400',
        message: "Missing required parameter 'id'",
        suggestion:
          'Provide action ID via query parameter: GET /api/actions?id=https://example.com/page',
      },
      { status: 400 }
    )
  }

  // Validate URL-based action ID
  if (!isValidActionId(actionId)) {
    return NextResponse.json(
      {
        error: 'INVALID_ID',
        code: '400',
        message: `Invalid action ID '${actionId}'. Expected a URL-based ID.`,
        suggestion:
          "Use search to find valid action IDs. Format: 'https://example.com/page' or 'https://example.com/page#chunk-1'",
      },
      { status: 400 }
    )
  }

  // Parse chunk index from input (may be partial URL)
  const { chunkIndex } = parseActionId(actionId)

  // Generate candidate URLs for fuzzy matching
  const candidates = normalizeActionId(actionId.replace(/#chunk-\d+$/, ''))

  try {
    const db = getDb()

    // Query chunks using fuzzy matching:
    // 1. Exact match on candidate URLs (highest priority)
    // 2. ILIKE pattern match for partial URLs
    const results = await db
      .select({
        chunkId: chunks.id,
        content: chunks.content,
        elements: chunks.elements,
        createdAt: chunks.createdAt,
        documentId: documents.id,
        documentTitle: documents.title,
        documentUrl: documents.url,
        chunkIndex: chunks.chunkIndex,
        heading: chunks.heading,
        tokenCount: chunks.tokenCount,
      })
      .from(chunks)
      .innerJoin(documents, eq(chunks.documentId, documents.id))
      .innerJoin(sources, eq(documents.sourceId, sources.id))
      .where(
        and(
          or(
            // Exact match on candidate URLs
            inArray(documents.url, candidates),
            // ILIKE fuzzy match
            sql`${documents.url} ILIKE ${'%' + actionId.replace(/#chunk-\d+$/, '') + '%'}`
          ),
          eq(documents.status, 'active'),
          eq(chunks.chunkIndex, chunkIndex),
          sql`${chunks.sourceVersionId} = ${sources.currentVersionId}`
        )
      )
      .limit(10) // Get multiple candidates for ranking

    if (results.length === 0) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          code: '404',
          message: `Action '${actionId}' not found`,
          suggestion:
            'The document may have been updated. Use search to find current action IDs.',
        },
        { status: 404 }
      )
    }

    // Rank results by similarity and pick the best match
    const inputForScoring = actionId.replace(/#chunk-\d+$/, '')
    const ranked = results
      .map((r) => ({
        ...r,
        score: urlSimilarity(inputForScoring, r.documentUrl),
      }))
      .sort((a, b) => b.score - a.score)

    const chunk = ranked[0]

    return NextResponse.json({
      action_id: generateActionId(chunk.documentUrl, chunk.chunkIndex),
      content: chunk.content,
      elements: chunk.elements,
      createdAt: chunk.createdAt.toISOString(),
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      documentUrl: chunk.documentUrl,
      chunkIndex: chunk.chunkIndex,
      heading: chunk.heading,
      tokenCount: chunk.tokenCount,
    })
  } catch (error) {
    console.error('Get action by ID error:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        code: '500',
        message:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
