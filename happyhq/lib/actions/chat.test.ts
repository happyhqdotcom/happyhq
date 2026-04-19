import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock constants — must be before importing the module under test
vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const MOCK_ROOT = '/mock/home/HappyHQ'

const { mockReadFile, mockRm, mockWriteFile, mockMkdir } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockRm: vi.fn(),
  mockWriteFile: vi.fn(),
  mockMkdir: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    rm: mockRm,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  },
  readFile: mockReadFile,
  rm: mockRm,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}))

import {
  createChatSession,
  deleteChat,
  markTaskStarted,
  setChatName,
} from './chat'

afterEach(() => {
  vi.restoreAllMocks()
})

// --- createChatSession ---

describe('createChatSession', () => {
  it('creates root .chats/{sessionId}/ with uploads/ subdir, writes chat.json with streamSlug', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await createChatSession('session-abc', 'my-stream')

    // All chats live at root
    const chatDir = path.join(MOCK_ROOT, '.chats', 'session-abc')
    expect(mockMkdir).toHaveBeenCalledWith(chatDir, { recursive: true })
    expect(mockMkdir).toHaveBeenCalledWith(path.join(chatDir, 'uploads'), {
      recursive: true,
    })
    // streamSlug is written into chat.json for stream affiliation
    expect(mockWriteFile).toHaveBeenCalledWith(
      path.join(chatDir, 'chat.json'),
      '{"name":null,"mode":"general","streamSlug":"my-stream"}',
      'utf-8',
    )
  })

  it('omits streamSlug from chat.json when streamName is null', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await createChatSession('session-abc', null)

    const chatDir = path.join(MOCK_ROOT, '.chats', 'session-abc')
    expect(mockWriteFile).toHaveBeenCalledWith(
      path.join(chatDir, 'chat.json'),
      '{"name":null,"mode":"general"}',
      'utf-8',
    )
  })

  it('creates the directory before writing the metadata file', async () => {
    const callOrder: string[] = []
    mockMkdir.mockImplementation(async () => {
      callOrder.push('mkdir')
    })
    mockWriteFile.mockImplementation(async () => {
      callOrder.push('writeFile')
    })

    await createChatSession('session-1', 'stream')

    // ensureDirectory is called for the chat dir, then writeTextFile calls
    // ensureDirectory again for the parent before writing. The key guarantee:
    // all mkdir calls happen before the writeFile call.
    const lastMkdir = callOrder.lastIndexOf('mkdir')
    const firstWrite = callOrder.indexOf('writeFile')
    expect(lastMkdir).toBeLessThan(firstWrite)
  })
})

// --- deleteChat ---

describe('deleteChat', () => {
  it('removes the chat directory at root recursively', async () => {
    mockRm.mockResolvedValue(undefined)

    await deleteChat('session-abc')

    // All chats live at root — streamName is ignored for path
    expect(mockRm).toHaveBeenCalledWith(
      path.join(MOCK_ROOT, '.chats', 'session-abc'),
      { recursive: true, force: true },
    )
  })

  it('succeeds silently when the directory does not exist (force: true)', async () => {
    mockRm.mockResolvedValue(undefined)

    // Should not throw — rm with { force: true } handles missing dirs
    await expect(deleteChat('nonexistent')).resolves.not.toThrow()
  })
})

// --- setChatName ---

describe('setChatName', () => {
  it('persists the name to chat.json at root', async () => {
    mockReadFile.mockResolvedValue('{"name":null}')
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await setChatName('session-abc', 'Weekly report setup')

    // All chats live at root
    const chatJsonPath = path.join(
      MOCK_ROOT,
      '.chats',
      'session-abc',
      'chat.json',
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      chatJsonPath,
      '{"name":"Weekly report setup"}',
      'utf-8',
    )
  })

  it('preserves existing fields in chat.json when updating name', async () => {
    mockReadFile.mockResolvedValue('{"name":null,"customField":"keep-me"}')
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await setChatName('session-abc', 'New name')

    const written = mockWriteFile.mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.name).toBe('New name')
    expect(parsed.customField).toBe('keep-me')
  })

  it('handles malformed existing chat.json gracefully', async () => {
    mockReadFile.mockResolvedValue('not valid json')
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await setChatName('session-abc', 'Recovered name')

    const written = mockWriteFile.mock.calls[0][1] as string
    expect(JSON.parse(written)).toEqual({ name: 'Recovered name' })
  })

  it('handles missing chat.json gracefully', async () => {
    // readTextFile returns null for ENOENT
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException
    enoent.code = 'ENOENT'
    mockReadFile.mockRejectedValue(enoent)
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await setChatName('session-abc', 'Fresh name')

    const written = mockWriteFile.mock.calls[0][1] as string
    expect(JSON.parse(written)).toEqual({ name: 'Fresh name' })
  })
})

// --- markTaskStarted ---

describe('markTaskStarted', () => {
  it('adds task name to startedTasks array in chat.json at root', async () => {
    mockReadFile.mockResolvedValue('{"name":"My Chat"}')
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await markTaskStarted('session-abc', 'weekly-report')

    // All chats live at root
    const chatJsonPath = path.join(
      MOCK_ROOT,
      '.chats',
      'session-abc',
      'chat.json',
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      chatJsonPath,
      JSON.stringify({ name: 'My Chat', startedTasks: ['weekly-report'] }),
      'utf-8',
    )
  })

  it('is idempotent — does not add duplicate task names', async () => {
    mockReadFile.mockResolvedValue(
      '{"name":"Chat","startedTasks":["weekly-report"]}',
    )
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await markTaskStarted('session-abc', 'weekly-report')

    const written = mockWriteFile.mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.startedTasks).toEqual(['weekly-report'])
  })

  it('appends to existing startedTasks array', async () => {
    mockReadFile.mockResolvedValue('{"name":"Chat","startedTasks":["task-a"]}')
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await markTaskStarted('session-abc', 'task-b')

    const written = mockWriteFile.mock.calls[0][1] as string
    const parsed = JSON.parse(written)
    expect(parsed.startedTasks).toEqual(['task-a', 'task-b'])
  })

  it('handles missing chat.json gracefully', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException
    enoent.code = 'ENOENT'
    mockReadFile.mockRejectedValue(enoent)
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    await markTaskStarted('session-abc', 'new-task')

    const written = mockWriteFile.mock.calls[0][1] as string
    expect(JSON.parse(written)).toEqual({ startedTasks: ['new-task'] })
  })
})
