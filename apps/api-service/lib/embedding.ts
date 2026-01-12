import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Profiler } from './profiler';
import { getEmbeddingCache } from './embedding-cache';

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,
      timeout: 30000,        // Reduced from 60s to 30s for faster failure
      maxRetries: 2,         // Reduced from 3 to 2 to reduce wait time
      httpAgent: proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined,
    });
  }
  return openai;
}

/**
 * Get embedding vector for text using OpenAI API (or OpenRouter)
 * Uses LRU cache to avoid redundant API calls for repeated queries
 */
export async function getEmbedding(text: string, profiler?: Profiler): Promise<number[]> {
  const cache = getEmbeddingCache();

  // Try to get from cache first (if enabled)
  if (cache) {
    profiler?.start('embedding_cache_lookup');
    const cached = cache.get(text);
    profiler?.end('embedding_cache_lookup');

    if (cached) {
      return cached;
    }
  }

  // Cache miss or disabled - call API
  const startTime = Date.now();
  profiler?.start('embedding_api_call');
  const client = getOpenAI();

  try {
    const response = await client.embeddings.create({
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      input: text,
    });

    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error('Invalid embedding response format');
    }

    const embedding = response.data[0].embedding;

    // Store in cache if enabled
    if (cache) {
      cache.set(text, embedding);
    }

    return embedding;
  } catch (error) {
    console.error('[Embedding] API error:', error instanceof Error ? error.message : 'Unknown error');
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    profiler?.end('embedding_api_call');

    const duration = Date.now() - startTime;
    // Log slow API calls for monitoring
    if (duration > 1000) {
      console.warn(`[Embedding] Slow API call: ${duration}ms`);
    }
  }
}
