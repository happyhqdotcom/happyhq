import { defineConfig, configDefaults } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    testTimeout: 10_000,
    exclude: [
      ...configDefaults.exclude,
      'tests/**/*.spec.ts',
      '.next/**',
    ],
    pool: process.env.CI ? 'forks' : 'threads',
    maxWorkers: 2,
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
})
