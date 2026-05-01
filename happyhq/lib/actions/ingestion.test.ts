import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock constants — must be before importing the module under test
vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const MOCK_ROOT = '/mock/home/HappyHQ'

const {
  mockRename,
  mockWriteFile,
  mockReadFile,
  mockMkdir,
  mockExistsSync,
  mockExtractTextFromPdf,
  mockExtractContentFromEml,
} = vi.hoisted(() => ({
  mockRename: vi.fn(),
  mockWriteFile: vi.fn(),
  mockReadFile: vi.fn(),
  mockMkdir: vi.fn(),
  mockExistsSync: vi.fn(() => false),
  mockExtractTextFromPdf: vi.fn(() =>
    Promise.resolve('extracted text content'),
  ),
  mockExtractContentFromEml: vi.fn(() =>
    Promise.resolve({
      metadata: {
        subject: '',
        from: '',
        to: '',
        body: '',
        attachments: [] as string[],
      },
      attachments: [] as Array<{ filename: string; content: Buffer }>,
    }),
  ),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    rename: mockRename,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  },
  readFile: mockReadFile,
  rename: mockRename,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}))

// realpathSync is used by safePath() for symlink-resolution; non-existent
// mock paths fall through canonicalize() before realpathSync is invoked,
// but the symbol must still be exported by the mock.
vi.mock('node:fs', () => {
  const realpathSync = Object.assign((p: string) => p, {
    native: (p: string) => p,
  })
  return {
    default: { existsSync: mockExistsSync, realpathSync },
    existsSync: mockExistsSync,
    realpathSync,
  }
})

vi.mock('@/lib/pdf/extract-text.server', () => ({
  extractTextFromPdf: mockExtractTextFromPdf,
}))

vi.mock('@/lib/eml/extract-text.server', () => ({
  extractContentFromEml: mockExtractContentFromEml,
}))

const { mockCommitGitState } = vi.hoisted(() => ({
  mockCommitGitState: vi.fn(),
}))

vi.mock('@/lib/git/sync.server', () => ({
  commitGitState: mockCommitGitState,
}))

// Billing mocks — used by uploadFile limit checks
const {
  mockIsBillingEnabled,
  mockVerifyToken,
  mockIsEmailAllowed,
  mockCanUploadSample,
} = vi.hoisted(() => ({
  mockIsBillingEnabled: vi.fn(() => false),
  mockVerifyToken: vi.fn(
    async (): Promise<{ id: string; email: string } | null> => null,
  ),
  mockIsEmailAllowed: vi.fn(() => true),
  mockCanUploadSample: vi.fn(
    async (): Promise<{ allowed: boolean; reason?: string }> => ({
      allowed: true,
    }),
  ),
}))

vi.mock('@/ee/lib/billing/config', () => ({
  isBillingEnabled: mockIsBillingEnabled,
}))

vi.mock('@/lib/accounts/auth.server', () => ({
  verifyToken: mockVerifyToken,
}))

vi.mock('@/lib/accounts/config', () => ({
  isEmailAllowed: mockIsEmailAllowed,
}))

vi.mock('@/ee/lib/billing/limits.server', () => ({
  canUploadSample: mockCanUploadSample,
}))

const MOCK_TOKEN = 'test-refresh-token'

import { ingestTaskInput, setupTaskFromChat, uploadFile } from './ingestion'

afterEach(() => {
  vi.restoreAllMocks()
})

// --- uploadFile ---

describe('uploadFile', () => {
  function makeFormData(name: string, content: string): FormData {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(content)
    // jsdom's File/Blob lack arrayBuffer(), so mock FormData with a
    // file-like object that has the methods uploadFile actually uses
    const fileMock = {
      name,
      arrayBuffer: async () => bytes.buffer,
    }
    return {
      get: (key: string) => (key === 'file' ? fileMock : null),
    } as unknown as FormData
  }

  it('creates a directory-per-upload at root and returns the slug', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const fd = makeFormData('report.pdf', 'pdf-content')
    const result = await uploadFile('session-123', fd)

    expect(result).toBe('report')
    // All chats live at root — uploads go to HAPPYHQ_ROOT/.chats/{sessionId}/uploads/
    expect(mockWriteFile).toHaveBeenCalledWith(
      path.join(
        MOCK_ROOT,
        '.chats',
        'session-123',
        'uploads',
        'report',
        'original.pdf',
      ),
      expect.any(Buffer),
    )
  })

  it('derives kebab-case slug from filename', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const fd = makeFormData('Acme Report Q4.pdf', 'content')
    const result = await uploadFile('sess-1', fd)

    expect(result).toBe('acme-report-q4')
  })

  it('preserves the original file extension in original.{ext}', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const fd = makeFormData('data.PDF', 'content')
    const result = await uploadFile('sess-1', fd)

    expect(result).toBe('data')
    expect(mockWriteFile).toHaveBeenCalledWith(
      path.join(
        MOCK_ROOT,
        '.chats',
        'sess-1',
        'uploads',
        'data',
        'original.PDF',
      ),
      expect.any(Buffer),
    )
  })

  it('resolves slug collisions with -2, -3 suffix', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    // First slug exists, second also exists, third is free
    mockExistsSync
      .mockReturnValueOnce(true) // "report" exists
      .mockReturnValueOnce(true) // "report-2" exists
      .mockReturnValueOnce(false) // "report-3" is free

    const fd = makeFormData('report.pdf', 'content')
    const result = await uploadFile('sess-1', fd)

    expect(result).toBe('report-3')
  })

  it('falls back to "upload" slug for filenames with no alphanumeric characters', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const fd = makeFormData('---!!!.pdf', 'content')
    const result = await uploadFile('sess-1', fd)

    expect(result).toBe('upload')
  })

  it('throws when no file is provided in FormData', async () => {
    const fd = new FormData()
    await expect(uploadFile('sess-1', fd)).rejects.toThrow('No file provided')
  })

  it('runs pdfium and writes raw.txt for PDF uploads', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue(Buffer.from('pdf-content'))
    mockExtractTextFromPdf.mockResolvedValue('extracted pdf text')

    const fd = makeFormData('report.pdf', 'pdf-content')
    const result = await uploadFile('sess-1', fd)

    expect(result).toBe('report')

    // pdfium called with a buffer
    expect(mockExtractTextFromPdf).toHaveBeenCalled()

    // raw.txt written alongside original.pdf (all uploads at root)
    const rawTxtPath = path.join(
      MOCK_ROOT,
      '.chats',
      'sess-1',
      'uploads',
      'report',
      'raw.txt',
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      rawTxtPath,
      'extracted pdf text',
      'utf-8',
    )
  })

  it('parses .eml and writes email.json for email uploads', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    const metadata = {
      subject: 'Deal',
      from: 'a@b.com',
      to: 'c@d.com',
      body: 'Hello',
      attachments: ['brochure.pdf'],
    }
    mockExtractContentFromEml.mockResolvedValue({
      metadata,
      attachments: [{ filename: 'brochure.pdf', content: Buffer.from('pdf') }],
    })

    const fd = makeFormData('deal-forward.eml', 'eml-content')
    const result = await uploadFile('sess-1', fd)

    expect(result).toBe('deal-forward')
    expect(mockExtractContentFromEml).toHaveBeenCalled()

    const uploadDir = path.join(
      MOCK_ROOT,
      '.chats',
      'sess-1',
      'uploads',
      'deal-forward',
    )
    // email.json written (no raw.txt)
    expect(mockWriteFile).toHaveBeenCalledWith(
      path.join(uploadDir, 'email.json'),
      JSON.stringify(metadata),
      'utf-8',
    )
    expect(mockWriteFile).not.toHaveBeenCalledWith(
      path.join(uploadDir, 'raw.txt'),
      expect.anything(),
      expect.anything(),
    )
    // extracted attachment written
    expect(mockWriteFile).toHaveBeenCalledWith(
      path.join(uploadDir, 'brochure.pdf'),
      Buffer.from('pdf'),
    )
  })

  it('succeeds even if eml extraction fails', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockExtractContentFromEml.mockRejectedValue(new Error('mailparser failed'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fd = makeFormData('broken.eml', 'bad-content')
    const result = await uploadFile('sess-1', fd)

    expect(result).toBe('broken')
    expect(warnSpy).toHaveBeenCalledWith(
      '[uploadFile] Eager eml extraction failed:',
      'mailparser failed',
    )
    warnSpy.mockRestore()
  })

  it('rejects unsupported file types before writing to disk', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const fd = makeFormData('clip.mp4', 'mp4-bytes')
    await expect(uploadFile('sess-1', fd)).rejects.toThrow(
      'Unsupported file type "clip.mp4"',
    )

    expect(mockWriteFile).not.toHaveBeenCalled()
    expect(mockExtractTextFromPdf).not.toHaveBeenCalled()
    expect(mockExtractContentFromEml).not.toHaveBeenCalled()
  })

  it('succeeds even if pdfium extraction fails', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue(Buffer.from('pdf-content'))
    mockExtractTextFromPdf.mockRejectedValue(new Error('pdfium init failed'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fd = makeFormData('report.pdf', 'pdf-content')
    const result = await uploadFile('sess-1', fd)

    // Upload still succeeds and returns the slug
    expect(result).toBe('report')
    expect(warnSpy).toHaveBeenCalledWith(
      '[uploadFile] Eager pdfium extraction failed:',
      'pdfium init failed',
    )
    warnSpy.mockRestore()
  })

  it('throws when slug collisions exceed upper bound', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    // Every slug check returns true (directory exists)
    mockExistsSync.mockReturnValue(true)

    const fd = makeFormData('report.pdf', 'content')
    await expect(uploadFile('sess-1', fd)).rejects.toThrow(
      'Too many uploads with slug "report"',
    )
  })

  it('throws when billing limit blocks sample upload', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockVerifyToken.mockResolvedValue({
      id: 'user-456',
      email: 'test@example.com',
    })
    mockCanUploadSample.mockResolvedValue({
      allowed: false,
      reason: 'Free plan allows 3 samples per stream. Upgrade to add more.',
    })

    const fd = makeFormData('report.pdf', 'content')
    await expect(
      uploadFile('sess-1', fd, MOCK_TOKEN, 'my-stream'),
    ).rejects.toThrow(
      'Free plan allows 3 samples per stream. Upgrade to add more.',
    )
    // File should not be written
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('uploads when billing allows it', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockIsBillingEnabled.mockReturnValue(true)
    mockVerifyToken.mockResolvedValue({
      id: 'user-456',
      email: 'test@example.com',
    })
    mockCanUploadSample.mockResolvedValue({ allowed: true })

    const fd = makeFormData('report.pdf', 'content')
    const result = await uploadFile('sess-1', fd, MOCK_TOKEN, 'my-stream')

    expect(result).toBe('report')
    expect(mockCanUploadSample).toHaveBeenCalledWith('user-456', 'my-stream')
  })

  it('skips upload billing check when billing is disabled', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockIsBillingEnabled.mockReturnValue(false)

    const fd = makeFormData('report.pdf', 'content')
    await uploadFile('sess-1', fd)

    expect(mockCanUploadSample).not.toHaveBeenCalled()
  })

  it('throws when billing is enabled but no token is provided for upload', async () => {
    mockIsBillingEnabled.mockReturnValue(true)

    const fd = makeFormData('report.pdf', 'content')
    await expect(uploadFile('sess-1', fd)).rejects.toThrow(
      'Sign in required to upload files.',
    )
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('throws when billing is enabled but token is invalid for upload', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockVerifyToken.mockResolvedValue(null)

    const fd = makeFormData('report.pdf', 'content')
    await expect(
      uploadFile('sess-1', fd, 'bad-token', 'stream'),
    ).rejects.toThrow('Sign in required to upload files.')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('rejects a malformed session id (path traversal attempt) before any filesystem call', async () => {
    const fd = makeFormData('a.pdf', 'pdf')
    await expect(uploadFile('../../etc', fd)).rejects.toThrow(
      'Invalid session id',
    )
    expect(mockMkdir).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('records the original filename in chat.json under uploads[slug] so reloaded chat history can render the right file pill type', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue('{"name":"My chat","mode":"general"}')

    const fd = makeFormData('Q4 Report.pdf', 'pdf')
    const slug = await uploadFile('sess-1', fd)

    expect(slug).toBe('q4-report')
    const chatJsonPath = path.join(MOCK_ROOT, '.chats', 'sess-1', 'chat.json')
    const writtenChatJson = mockWriteFile.mock.calls.find(
      (c) => c[0] === chatJsonPath,
    )
    expect(writtenChatJson).toBeDefined()
    const persisted = JSON.parse(writtenChatJson![1] as string)
    expect(persisted).toEqual({
      name: 'My chat',
      mode: 'general',
      uploads: { 'q4-report': 'Q4 Report.pdf' },
    })
  })

  it('merges into an existing uploads map rather than overwriting prior entries', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue(
      '{"name":"Chat","uploads":{"old-doc":"old.docx"}}',
    )

    const fd = makeFormData('new.pdf', 'pdf')
    await uploadFile('sess-1', fd)

    const chatJsonPath = path.join(MOCK_ROOT, '.chats', 'sess-1', 'chat.json')
    const writtenChatJson = mockWriteFile.mock.calls.find(
      (c) => c[0] === chatJsonPath,
    )
    const persisted = JSON.parse(writtenChatJson![1] as string)
    expect(persisted.uploads).toEqual({
      'old-doc': 'old.docx',
      new: 'new.pdf',
    })
  })
})

// --- setupTaskFromChat ---

describe('setupTaskFromChat', () => {
  it('writes context.md at root task path', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await setupTaskFromChat('my-task-01abc', 'sess-1', 'Analyze Q4 data.', [])

    const taskDir = path.join(MOCK_ROOT, 'tasks', 'my-task-01abc')
    expect(mockWriteFile).toHaveBeenCalledWith(
      path.join(taskDir, 'inputs', 'context.md'),
      'Analyze Q4 data.',
      'utf-8',
    )
  })

  it('moves upload directories from root .chats/ to task inputs', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockRename.mockResolvedValue(undefined)
    mockExistsSync.mockReturnValue(true)

    await setupTaskFromChat('my-task-01abc', 'sess-1', 'Ctx', [
      'acme-report',
      'budget-data',
    ])

    // Uploads come from root .chats/ (not stream-scoped)
    const uploadsDir = path.join(MOCK_ROOT, '.chats', 'sess-1', 'uploads')
    const inputsDir = path.join(MOCK_ROOT, 'tasks', 'my-task-01abc', 'inputs')

    expect(mockRename).toHaveBeenCalledWith(
      path.join(uploadsDir, 'acme-report'),
      path.join(inputsDir, 'acme-report'),
    )
    expect(mockRename).toHaveBeenCalledWith(
      path.join(uploadsDir, 'budget-data'),
      path.join(inputsDir, 'budget-data'),
    )
  })

  it('skips missing upload directories instead of throwing', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockRename.mockResolvedValue(undefined)
    mockExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(false)

    await setupTaskFromChat('my-task-01abc', 'sess-1', 'Ctx', [
      'exists',
      'gone',
    ])

    expect(mockRename).toHaveBeenCalledTimes(1)
    expect(mockWriteFile).toHaveBeenCalled()
  })

  it('commits with [tasks/slug] Chat inputs message', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await setupTaskFromChat('my-task-01abc', 'sess-1', 'Ctx', [])

    expect(mockCommitGitState).toHaveBeenCalledWith(
      '[tasks/my-task-01abc] Chat inputs',
    )
  })
})

// --- ingestTaskInput ---

describe('ingestTaskInput', () => {
  function makeFormData(name: string, content: string): FormData {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(content)
    const fileMock = {
      name,
      arrayBuffer: async () => bytes.buffer,
    }
    return {
      get: (key: string) => (key === 'file' ? fileMock : null),
    } as unknown as FormData
  }

  it('rejects unsupported file types so drag-and-drop cannot bypass the picker accept list', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const fd = makeFormData('clip.mp4', 'mp4-bytes')
    await expect(ingestTaskInput('my-task', fd)).rejects.toThrow(
      'Unsupported file type "clip.mp4"',
    )

    expect(mockWriteFile).not.toHaveBeenCalled()
    expect(mockCommitGitState).not.toHaveBeenCalled()
  })

  it('accepts the canonical allowed types regardless of extension casing', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockExtractTextFromPdf.mockResolvedValue('text')

    const fd = makeFormData('Report.PDF', 'pdf-bytes')
    const result = await ingestTaskInput('my-task', fd)

    expect(result.slug).toBe('report')
    expect(mockWriteFile).toHaveBeenCalledWith(
      path.join(
        MOCK_ROOT,
        'tasks',
        'my-task',
        'inputs',
        'report',
        'original.PDF',
      ),
      expect.any(Buffer),
    )
  })
})
