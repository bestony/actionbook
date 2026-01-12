/**
 * LRU Cache for embedding vectors
 * Stores embedding results in memory to avoid redundant API calls
 *
 * ⚠️ IMPORTANT: This is a "best effort" in-memory cache
 * - In Serverless environments (Vercel/AWS Lambda), cache is reset on cold starts
 * - Only effective during warm instance lifetime
 * - setInterval cleanup will be lost after function execution
 *
 * TODO: Migrate to Redis/Vercel KV for persistent caching in production
 * Currently DISABLED by default (see EMBEDDING_CACHE_ENABLED env var)
 */

interface CacheEntry {
  embedding: number[];
  timestamp: number;
  hits: number;
}

export class EmbeddingCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds
  private totalRequests: number = 0;
  private totalHits: number = 0;
  private logInterval: number;
  private lastLogTime: number = Date.now();

  constructor(maxSize = 1000, ttlMinutes = 60, logInterval = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000;
    this.logInterval = logInterval;
  }

  /**
   * Generate cache key from text using SHA-256 hash
   * (avoids Base64 key bloat ~33% compared to original text)
   */
  private getCacheKey(text: string): string {
    const crypto = require('crypto');
    return crypto
      .createHash('sha256')
      .update(text.toLowerCase().trim())
      .digest('hex')
      .slice(0, 32); // Use first 32 chars for shorter keys
  }

  /**
   * Get embedding from cache
   */
  get(text: string): number[] | null {
    this.totalRequests++;
    const key = this.getCacheKey(text);
    const entry = this.cache.get(key);

    if (!entry) {
      this.maybeLogStats();
      return null;
    }

    // Check if entry has expired
    const age = Date.now() - entry.timestamp;
    if (age > this.ttl) {
      this.cache.delete(key);
      this.maybeLogStats();
      return null;
    }

    // Update hit count
    entry.hits++;
    this.totalHits++;
    this.maybeLogStats();
    return entry.embedding;
  }

  /**
   * Store embedding in cache
   */
  set(text: string, embedding: number[]): void {
    const key = this.getCacheKey(text);

    // Implement LRU: if cache is full, remove oldest entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Log cache statistics every N requests
   */
  private maybeLogStats(): void {
    if (this.totalRequests % this.logInterval === 0) {
      const hitRate = this.totalRequests > 0
        ? ((this.totalHits / this.totalRequests) * 100).toFixed(1)
        : '0.0';

      const entries = Array.from(this.cache.values());
      const avgAge = entries.length > 0
        ? Math.round(entries.reduce((sum, entry) => sum + (Date.now() - entry.timestamp), 0) / entries.length / 1000)
        : 0;

      const timeSinceLastLog = Math.round((Date.now() - this.lastLogTime) / 1000);

      console.log(
        `[EmbeddingCache] Stats after ${this.totalRequests} requests: ` +
        `hit_rate=${hitRate}%, size=${this.cache.size}/${this.maxSize}, ` +
        `avg_age=${avgAge}s, time_since_last_log=${timeSinceLastLog}s`
      );

      this.lastLogTime = Date.now();
    }
  }

  /**
   * Get cache statistics (for internal use)
   */
  getStats() {
    const entries = Array.from(this.cache.values());
    const avgAge = entries.length > 0
      ? entries.reduce((sum, entry) => sum + (Date.now() - entry.timestamp), 0) / entries.length
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalRequests: this.totalRequests,
      totalHits: this.totalHits,
      hitRate: this.totalRequests > 0 ? (this.totalHits / this.totalRequests) * 100 : 0,
      avgAge: Math.round(avgAge / 1000), // in seconds
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton instance (reset on Serverless cold starts)
let cacheInstance: EmbeddingCache | null = null;

/**
 * Get or create embedding cache instance
 *
 * Cache is DISABLED by default. Set EMBEDDING_CACHE_ENABLED=true to enable.
 * Note: In-memory cache is not persistent in Serverless environments.
 */
export function getEmbeddingCache(): EmbeddingCache | null {
  // Check if cache is enabled (disabled by default)
  const cacheEnabled = process.env.EMBEDDING_CACHE_ENABLED === 'true';

  if (!cacheEnabled) {
    return null;
  }

  if (!cacheInstance) {
    const maxSize = parseInt(process.env.EMBEDDING_CACHE_SIZE || '1000', 10);
    const ttlMinutes = parseInt(process.env.EMBEDDING_CACHE_TTL_MINUTES || '60', 10);
    const logInterval = parseInt(process.env.EMBEDDING_CACHE_LOG_INTERVAL || '100', 10);
    cacheInstance = new EmbeddingCache(maxSize, ttlMinutes, logInterval);

    console.log(`[EmbeddingCache] Initialized: size=${maxSize}, ttl=${ttlMinutes}min, log_interval=${logInterval}`);

    // Auto-cleanup expired entries every 10 minutes
    // ⚠️ Note: This will be lost in Serverless cold starts
    setInterval(() => {
      cacheInstance?.clearExpired();
      const stats = cacheInstance?.getStats();
      if (stats) {
        console.log(
          `[EmbeddingCache] Cleanup completed: ` +
          `size=${stats.size}/${stats.maxSize}, ` +
          `total_requests=${stats.totalRequests}, ` +
          `hit_rate=${stats.hitRate.toFixed(1)}%`
        );
      }
    }, 10 * 60 * 1000);
  }
  return cacheInstance;
}
