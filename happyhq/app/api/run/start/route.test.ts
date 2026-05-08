import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockReadTaskContent,
  mockStartRun,
  mockIsBillingEnabled,
  mockVerifyToken,
  mockIsEmailAllowed,
  mockCanStartTask,
} = vi.hoisted(() => ({
  mockReadTaskContent: vi.fn(),
  mockStartRun: vi.fn(),
  mockIsBillingEnabled: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockIsEmailAllowed: vi.fn(() => true),
  mockCanStartTask: vi.fn(),
}))

vi.mock('@/lib/fs/read.server', () => ({
  readTaskContent: mockReadTaskContent,
}))

vi.mock('@/lib/run/loop.server', () => ({
  startRun: mockStartRun,
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
  canStartTask: mockCanStartTask,
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>, token?: string) {
  return new Request('http://localhost/api/run/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  })
}

const validPlanningBody = { stream: 's1', task: 't1', mode: 'planning' }
const validWorkingBody = { stream: 's1', task: 't1', mode: 'working' }
const validDiscoveryBody = { stream: 's1', task: 't1', mode: 'discovery' }

describe('POST /api/run/start', () => {
  beforeEach(() => {
    // Default: billing disabled
    mockIsBillingEnabled.mockReturnValue(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for invalid JSON', async () => {
    const request = new Request('http://localhost/api/run/start', {
      method: 'POST',
      body: 'not json',
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 when task is missing', async () => {
    const response = await POST(makeRequest({ stream: 's1', mode: 'planning' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing or invalid fields' })
  })

  it('returns 400 when stream is missing', async () => {
    const response = await POST(makeRequest({ task: 't1', mode: 'planning' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      error: 'Task must be assigned to a stream before running',
    })
  })

  it('returns 400 when mode is invalid', async () => {
    const response = await POST(
      makeRequest({ stream: 's1', task: 't1', mode: 'invalid' }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing or invalid fields' })
  })

  it('returns 404 when task does not exist', async () => {
    mockReadTaskContent.mockResolvedValue(null)

    const response = await POST(makeRequest(validPlanningBody))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Task not found' })
  })

  it('returns planning status for planning mode', async () => {
    mockReadTaskContent.mockResolvedValue({ plan: null, run: null })
    mockStartRun.mockResolvedValue(undefined)

    const response = await POST(makeRequest(validPlanningBody))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'planning' })
  })

  it('returns running status for working mode', async () => {
    mockReadTaskContent.mockResolvedValue({ plan: null, run: null })
    mockStartRun.mockResolvedValue(undefined)

    const response = await POST(makeRequest(validWorkingBody))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'working' })
  })

  it('returns discovering status for discovery mode', async () => {
    mockReadTaskContent.mockResolvedValue({ plan: null, run: null })
    mockStartRun.mockResolvedValue(undefined)

    const response = await POST(makeRequest(validDiscoveryBody))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'discovering' })
    expect(mockStartRun).toHaveBeenCalledWith(
      's1',
      't1',
      'discovery',
      undefined,
      undefined,
    )
  })

  it('returns 409 when a run is already active', async () => {
    mockReadTaskContent.mockResolvedValue({ plan: null, run: null })
    mockStartRun.mockRejectedValue(new Error('Run already active'))

    const response = await POST(makeRequest(validPlanningBody))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({ error: 'Run already active' })
  })

  describe('billing limit enforcement', () => {
    it('returns 403 when runtime is exhausted', async () => {
      mockReadTaskContent.mockResolvedValue({ plan: null, run: null })
      mockIsBillingEnabled.mockReturnValue(true)
      mockVerifyToken.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      })
      mockCanStartTask.mockResolvedValue({
        allowed: false,
        reason: 'usage_exhausted',
      })

      const response = await POST(makeRequest(validWorkingBody, 'test-token'))
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body).toEqual({ error: 'Runtime limit reached', upgrade: true })
      expect(mockStartRun).not.toHaveBeenCalled()
    })

    it('includes low_balance warning when runtime is low', async () => {
      mockReadTaskContent.mockResolvedValue({ plan: null, run: null })
      mockStartRun.mockResolvedValue(undefined)
      mockIsBillingEnabled.mockReturnValue(true)
      mockVerifyToken.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      })
      mockCanStartTask.mockResolvedValue({
        allowed: true,
        warning: 'low_balance',
        remainingMinutes: 3,
      })

      const response = await POST(makeRequest(validWorkingBody, 'test-token'))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({
        status: 'working',
        warning: 'low_balance',
        remainingMinutes: 3,
      })
      expect(mockStartRun).toHaveBeenCalled()
    })

    it('starts normally when usage is within limits', async () => {
      mockReadTaskContent.mockResolvedValue({ plan: null, run: null })
      mockStartRun.mockResolvedValue(undefined)
      mockIsBillingEnabled.mockReturnValue(true)
      mockVerifyToken.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      })
      mockCanStartTask.mockResolvedValue({
        allowed: true,
        remainingMinutes: 45,
      })

      const response = await POST(makeRequest(validWorkingBody, 'test-token'))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ status: 'working' })
    })

    it('skips limit check when no token is provided', async () => {
      mockReadTaskContent.mockResolvedValue({ plan: null, run: null })
      mockStartRun.mockResolvedValue(undefined)
      mockIsBillingEnabled.mockReturnValue(true)

      const response = await POST(makeRequest(validWorkingBody))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ status: 'working' })
      expect(mockCanStartTask).not.toHaveBeenCalled()
    })

    it('proceeds without limit check when billing is disabled', async () => {
      mockReadTaskContent.mockResolvedValue({ plan: null, run: null })
      mockStartRun.mockResolvedValue(undefined)
      mockIsBillingEnabled.mockReturnValue(false)

      const response = await POST(makeRequest(validWorkingBody))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ status: 'working' })
      expect(mockCanStartTask).not.toHaveBeenCalled()
      expect(mockVerifyToken).not.toHaveBeenCalled()
    })
  })
})
