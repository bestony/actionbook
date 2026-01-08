import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'test/**/*.ut.test.ts', // Unit tests
      'test/**/*.it.test.ts', // Integration tests
    ],
    exclude: ['node_modules'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types/**'],
    },
  },
  resolve: {
    alias: {
      '@actionbookdev/db': resolve(__dirname, '../db/dist/index.js'),
    },
  },
})
