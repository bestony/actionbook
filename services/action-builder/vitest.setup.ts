import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync, readdirSync, rmSync, unlinkSync } from 'fs';
import { afterAll, beforeAll } from 'vitest';

// Load .env file from services/db (which has DATABASE_URL)
config({ path: resolve(__dirname, '../db/.env') });

// Also load local .env if exists
config({ path: resolve(__dirname, '.env'), override: true });

// Prefer the e2e DB URL if that's what is configured locally.
if (process.env.ACTION_BUILDER_E2E_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.ACTION_BUILDER_E2E_DATABASE_URL;
}

function shouldKeepTestArtifacts(): boolean {
  const v = (process.env.KEEP_TEST_ARTIFACTS || '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'yes';
}

function cleanupTestArtifacts(): void {
  // NOTE: these paths are relative to services/action-builder/
  const testOutputDir = resolve(__dirname, 'test-output');
  const logsDir = resolve(__dirname, 'logs');

  // Remove YAML outputs produced by tests (e.g. sites/test.com)
  if (existsSync(testOutputDir)) {
    rmSync(testOutputDir, { recursive: true, force: true });
  }

  // Remove auto-generated ActionBuilder logs produced during tests
  if (existsSync(logsDir)) {
    for (const file of readdirSync(logsDir)) {
      // FileLogger format: `${prefix}_${YYYYMMDDHHmmss}.log`
      if (/^action-builder_\d{14}\.log$/.test(file)) {
        try {
          unlinkSync(resolve(logsDir, file));
        } catch {
          // best-effort cleanup
        }
      }
    }
  }
}

beforeAll(() => {
  if (!shouldKeepTestArtifacts()) {
    cleanupTestArtifacts();
  }
});

afterAll(() => {
  if (!shouldKeepTestArtifacts()) {
    cleanupTestArtifacts();
  }
});
