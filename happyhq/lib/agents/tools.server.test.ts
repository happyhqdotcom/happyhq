import { afterEach, describe, expect, it, vi } from 'vitest'

const mockExtractTextFromPdf = vi.hoisted(() =>
  vi.fn(() => Promise.resolve('extracted pdf text')),
)

const mockSetSessionMode = vi.hoisted(() => vi.fn())
const mockSetChatMode = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('@/lib/pdf/extract-text.server', () => ({
  extractTextFromPdf: mockExtractTextFromPdf,
}))

vi.mock('@/lib/chat/session-mode', () => ({
  setSessionMode: mockSetSessionMode,
}))

vi.mock('@/lib/actions', () => ({
  setChatMode: mockSetChatMode,
}))

vi.mock('@/lib/fs/paths', () => ({
  streamPath: (name: string) => `/mock/happyhq/${name}`,
  chatPath: (sessionId: string) => `/mock/happyhq/.chats/${sessionId}`,
  // Asserters: no-ops in tests since fixtures use safe values; real impl
  // is exercised in lib/fs/paths.test.ts.
  assertSafeSessionId: () => {},
  assertSafeStreamName: () => {},
  assertSafePathSegment: () => {},
}))

import { createQsMcpServer } from './tools.server'

// Helper to get a tool handler from the MCP server's internal registry.
function getToolHandler(
  server: ReturnType<typeof createQsMcpServer>,
  toolName: string,
) {
  const registeredTools = (
    server.instance as unknown as Record<string, unknown>
  )._registeredTools as
    | Record<
        string,
        {
          handler: (
            ...args: unknown[]
          ) => Promise<{ content: { type: string; text: string }[] }>
        }
      >
    | undefined
  if (!registeredTools?.[toolName]) {
    throw new Error(`Tool "${toolName}" not found on MCP server`)
  }
  return registeredTools[toolName].handler
}

describe('createQsMcpServer', () => {
  it('returns an MCP server with correct type and name', () => {
    const server = createQsMcpServer('/tmp/test-stream', 'test-session')
    expect(server.type).toBe('sdk')
    expect(server.name).toBe('q')
  })

  it('creates a fresh server per call (not a singleton)', () => {
    const server1 = createQsMcpServer('/tmp/test-stream', 'test-session')
    const server2 = createQsMcpServer('/tmp/test-stream', 'test-session')
    expect(server1).not.toBe(server2)
  })
})

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  renameSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('fs', () => ({ default: mockFs }))

describe('ProcessSample', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns error when upload directory does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const server = createQsMcpServer('/tmp/test-stream', 'test-session')
    const handler = getToolHandler(server, 'ProcessSample')

    const result = await handler(
      { slug: 'missing-doc', category: 'reports', name: 'test' },
      {},
    )

    expect(result.content[0].text).toContain(
      'not found in .chats/test-session/uploads/',
    )
  })

  it('returns error when no original.* file found in upload directory', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockReturnValue(['raw.txt', 'other-file.txt'])

    const server = createQsMcpServer('/tmp/test-stream', 'test-session')
    const handler = getToolHandler(server, 'ProcessSample')

    const result = await handler(
      { slug: 'bad-upload', category: 'reports', name: 'test' },
      {},
    )

    expect(result.content[0].text).toContain(
      'No original.* file found in upload "bad-upload"',
    )
  })

  it('rejects unsupported file types and does not move them', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockReturnValue(['original.docx'])

    const server = createQsMcpServer('/tmp/test-stream', 'test-session')
    const handler = getToolHandler(server, 'ProcessSample')

    const result = await handler(
      { slug: 'report-doc', category: 'reports', name: 'test-report' },
      {},
    )

    expect(result.content[0].text).toMatch(/^Error:/)
    expect(mockFs.renameSync).not.toHaveBeenCalled()
  })

  it('returns collision error when sample name already exists', async () => {
    // Upload dir exists, original.pdf present, but sample dir already exists
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockReturnValue(['original.pdf'])

    const server = createQsMcpServer('/tmp/test-stream', 'test-session')
    const handler = getToolHandler(server, 'ProcessSample')

    const result = await handler(
      { slug: 'report', category: 'reports', name: 'existing-sample' },
      {},
    )

    expect(result.content[0].text).toContain('already exists')
    expect(result.content[0].text).toContain('existing-sample')
    expect(mockFs.renameSync).not.toHaveBeenCalled()
  })

  it('moves upload directory to samples/ via atomic rename', async () => {
    // Upload directory exists, has original.pdf, has raw.txt; no collision
    mockFs.existsSync.mockImplementation((p: string) => {
      // Sample dir collision check — no collision
      if (p.includes('/samples/') && !p.endsWith('raw.txt')) return false
      return true
    })
    mockFs.readdirSync.mockReturnValue(['original.pdf', 'raw.txt'])

    const server = createQsMcpServer('/tmp/test-stream', 'test-session')
    const handler = getToolHandler(server, 'ProcessSample')

    const result = await handler(
      { slug: 'acme-report', category: 'reports', name: 'acme-q4' },
      {},
    )

    // Verify the atomic rename from uploads to samples
    expect(mockFs.renameSync).toHaveBeenCalledWith(
      '/mock/happyhq/.chats/test-session/uploads/acme-report',
      '/tmp/test-stream/samples/reports/acme-q4',
    )

    // Ensure parent category directory was created
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      '/tmp/test-stream/samples/reports',
      { recursive: true },
    )

    // raw.txt already exists, so extraction is skipped and result is success
    expect(result.content[0].text).toContain('samples/reports/acme-q4/')
    expect(result.content[0].text).toContain('raw.txt (extracted text)')
  })

  it('returns error when directory rename fails', async () => {
    mockFs.existsSync.mockImplementation((p: string) => {
      if (p.includes('/samples/') && !p.endsWith('raw.txt')) return false
      return true
    })
    mockFs.readdirSync.mockReturnValue(['original.pdf'])
    mockFs.renameSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    const server = createQsMcpServer('/tmp/test-stream', 'test-session')
    const handler = getToolHandler(server, 'ProcessSample')

    const result = await handler(
      { slug: 'report', category: 'reports', name: 'test' },
      {},
    )

    expect(result.content[0].text).toContain('Failed to move upload')
    expect(result.content[0].text).toContain('EACCES: permission denied')
  })

  it('skips extraction when raw.txt already exists from eager upload', async () => {
    // Upload dir exists, original.pdf and raw.txt present; no collision
    mockFs.existsSync.mockImplementation((p: string) => {
      if (p.includes('/samples/') && !p.endsWith('raw.txt')) return false
      return true
    })
    mockFs.readdirSync.mockReturnValue(['original.pdf', 'raw.txt'])

    const server = createQsMcpServer('/tmp/test-stream', 'test-session')
    const handler = getToolHandler(server, 'ProcessSample')

    const result = await handler(
      { slug: 'report', category: 'reports', name: 'test' },
      {},
    )

    // pdfium should NOT have been called — raw.txt already exists
    expect(mockExtractTextFromPdf).not.toHaveBeenCalled()
    // Success message
    expect(result.content[0].text).toContain('raw.txt (extracted text)')
  })

  it('accepts PDF files with .PDF extension (case-insensitive)', async () => {
    mockFs.existsSync.mockImplementation((p: string) => {
      if (p.includes('/samples/') && !p.endsWith('raw.txt')) return false
      return true
    })
    mockFs.readdirSync.mockReturnValue(['original.PDF'])

    const server = createQsMcpServer('/tmp/test-stream', 'test-session')
    const handler = getToolHandler(server, 'ProcessSample')

    const result = await handler(
      { slug: 'report', category: 'reports', name: 'test' },
      {},
    )

    // Validation should pass — it did NOT return the extension error
    expect(result.content[0].text).not.toContain(
      'PDF is the only supported format',
    )
    // It should have moved the directory
    expect(mockFs.renameSync).toHaveBeenCalled()
  })
})

describe('CreateTask', () => {
  it('returns a suggested-to-user result message', async () => {
    const server = createQsMcpServer('/tmp/test-stream', 'test-session')
    const handler = getToolHandler(server, 'CreateTask')

    const result = await handler(
      {
        name: 'q4-report',
        textContext: 'Client wants a summary of deliverables',
        files: ['brief.pdf'],
      },
      {},
    )

    expect(result.content[0].text).toContain('q4-report')
    expect(result.content[0].text).toContain('suggested to user')
  })

  it('returns the same result format regardless of files', async () => {
    const server = createQsMcpServer('/tmp/test-stream', 'test-session')
    const handler = getToolHandler(server, 'CreateTask')

    const result = await handler(
      {
        name: 'test-task',
        textContext: 'Context',
        files: [],
      },
      {},
    )

    expect(result.content[0].text).toContain('test-task')
    expect(result.content[0].text).toContain('suggested to user')
  })
})

describe('EnterLearningMode', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns error when stream does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const server = createQsMcpServer('/tmp/root', 'session-1')
    const handler = getToolHandler(server, 'EnterLearningMode')

    const result = await handler({ streamSlug: 'nonexistent' }, {})

    expect(result.content[0].text).toContain('not found')
    expect(mockSetSessionMode).not.toHaveBeenCalled()
  })

  it('updates session mode and returns abbreviated framing', async () => {
    mockFs.existsSync.mockReturnValue(true)

    const notifyClient = vi.fn()
    const server = createQsMcpServer('/tmp/root', 'session-1', {
      notifyClient,
      chatDir: '/tmp/chat-dir',
    })
    const handler = getToolHandler(server, 'EnterLearningMode')

    const result = await handler({ streamSlug: 'client-reports' }, {})

    // Tool result is a brief mode-framing sentence — orientation/rules come
    // from the learning reminder injected via the PostToolUse hook.
    expect(result.content[0].text).toContain(
      'Entered learning mode for client-reports',
    )
    expect(result.content[0].text).toContain('playbook, specs, and samples')
    expect(mockSetSessionMode).toHaveBeenCalledWith(
      'session-1',
      'learning',
      'client-reports',
    )
    expect(mockSetChatMode).toHaveBeenCalledWith(
      '/tmp/chat-dir',
      'learning',
      'client-reports',
    )
    expect(notifyClient).toHaveBeenCalledWith({
      type: 'mode_changed',
      mode: 'learning',
      streamSlug: 'client-reports',
    })
  })

  it('skips chatDir persistence when chatDir is not provided', async () => {
    mockFs.existsSync.mockReturnValue(true)

    const server = createQsMcpServer('/tmp/root', 'session-1')
    const handler = getToolHandler(server, 'EnterLearningMode')

    await handler({ streamSlug: 'test-stream' }, {})

    expect(mockSetSessionMode).toHaveBeenCalled()
    expect(mockSetChatMode).not.toHaveBeenCalled()
  })
})

describe('ExitLearningMode', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('updates session mode to general and notifies client', async () => {
    const notifyClient = vi.fn()
    const server = createQsMcpServer('/tmp/root', 'session-1', {
      notifyClient,
      chatDir: '/tmp/chat-dir',
    })
    const handler = getToolHandler(server, 'ExitLearningMode')

    const result = await handler({}, {})

    expect(result.content[0].text).toBe('Exited learning mode.')
    expect(mockSetSessionMode).toHaveBeenCalledWith('session-1', 'general')
    expect(mockSetChatMode).toHaveBeenCalledWith('/tmp/chat-dir', 'general')
    expect(notifyClient).toHaveBeenCalledWith({
      type: 'mode_changed',
      mode: 'general',
    })
  })

  it('skips chatDir persistence when chatDir is not provided', async () => {
    const server = createQsMcpServer('/tmp/root', 'session-1')
    const handler = getToolHandler(server, 'ExitLearningMode')

    await handler({}, {})

    expect(mockSetSessionMode).toHaveBeenCalledWith('session-1', 'general')
    expect(mockSetChatMode).not.toHaveBeenCalled()
  })
})
