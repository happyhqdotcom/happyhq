import { beforeAll, vi } from 'vitest'

// Prevent tests from writing to the real log file (~/.HappyHQ/.logs/)
vi.mock('@/lib/log.server', () => ({
  log: vi.fn(),
}))

// Diagnostic: emit file start so CI logs show which file is running
// before completion (vitest reporters only emit on file *finish*).
if (process.env.CI) {
  beforeAll((suite) => {
    process.stdout.write(`>>> START FILE: ${suite.file?.name ?? '?'}\n`)
  })
}

const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  }),
  length: 0,
  key: vi.fn(),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})
