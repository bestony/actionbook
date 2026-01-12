/**
 * Simple performance profiler for tracking execution time
 */
export class Profiler {
  private startTime: number;
  private checkpoints: Map<string, { start: number; end?: number; duration?: number }>;
  private currentCheckpoint: string | null = null;

  constructor() {
    this.startTime = performance.now();
    this.checkpoints = new Map();
  }

  /**
   * Start timing a checkpoint
   */
  start(name: string): void {
    // End previous checkpoint if exists
    if (this.currentCheckpoint) {
      this.end(this.currentCheckpoint);
    }

    this.checkpoints.set(name, {
      start: performance.now(),
    });
    this.currentCheckpoint = name;
  }

  /**
   * End timing a checkpoint
   */
  end(name: string): void {
    const checkpoint = this.checkpoints.get(name);
    if (!checkpoint) {
      console.warn(`[Profiler] Checkpoint "${name}" not found`);
      return;
    }

    const end = performance.now();
    checkpoint.end = end;
    checkpoint.duration = end - checkpoint.start;

    if (this.currentCheckpoint === name) {
      this.currentCheckpoint = null;
    }
  }

  /**
   * Get duration of a specific checkpoint
   */
  getDuration(name: string): number | undefined {
    return this.checkpoints.get(name)?.duration;
  }

  /**
   * Get total duration from start
   */
  getTotalDuration(): number {
    return performance.now() - this.startTime;
  }

  /**
   * Get all timing results
   */
  getResults(): {
    total: number;
    checkpoints: Record<string, number>;
  } {
    const results: Record<string, number> = {};

    for (const [name, checkpoint] of this.checkpoints.entries()) {
      if (checkpoint.duration !== undefined) {
        results[name] = Math.round(checkpoint.duration * 100) / 100; // Round to 2 decimal places
      }
    }

    return {
      total: Math.round(this.getTotalDuration() * 100) / 100,
      checkpoints: results,
    };
  }

  /**
   * Log results to console
   */
  log(prefix = 'Profiler'): void {
    const results = this.getResults();
    console.log(`[${prefix}] Total: ${results.total}ms`);

    const sorted = Object.entries(results.checkpoints).sort((a, b) => b[1] - a[1]);
    for (const [name, duration] of sorted) {
      const percentage = ((duration / results.total) * 100).toFixed(1);
      console.log(`  - ${name}: ${duration}ms (${percentage}%)`);
    }
  }
}
