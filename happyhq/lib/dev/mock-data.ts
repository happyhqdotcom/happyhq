/**
 * Mock data fixtures for the dev run simulator.
 * Each phase provides a TaskContent snapshot that can be injected into SWR cache
 * to simulate the task panel's various states without a real agent run.
 */

import type { ActivityStep } from '@/components/features/desktop/hooks/use-run-activity'
import type { RunInfo, TaskContent, TaskFrontmatter } from '@/lib/fs/types'

// ── Run info per phase ──────────────────────────────────────────────────

const NOW = new Date().toISOString()

const PLANNING_RUN: RunInfo = {
  status: 'planning',
  startedAt: NOW,
  lastIterationAt: NOW,
  phases: [],
}

const PLAN_READY_RUN: RunInfo = {
  status: 'plan_ready',
  startedAt: NOW,
  lastIterationAt: NOW,
  costUsd: 0.03,
  phases: [
    {
      phase: 'planning',
      sessionId: 'mock-planning-session',
      costUsd: 0.03,
      durationMs: 12000,
    },
  ],
}

const RUNNING_RUN: RunInfo = {
  status: 'working',
  startedAt: NOW,
  lastIterationAt: NOW,
  costUsd: 0.08,
  phases: [
    {
      phase: 'planning',
      sessionId: 'mock-planning-session',
      costUsd: 0.03,
      durationMs: 12000,
    },
    {
      phase: 'working',
      iteration: 1,
      sessionId: 'mock-working-session-1',
      costUsd: 0.05,
      durationMs: 18000,
    },
  ],
}

const COMPLETED_RUN: RunInfo = {
  status: 'completed',
  startedAt: NOW,
  lastIterationAt: NOW,
  costUsd: 0.12,
  phases: [
    {
      phase: 'planning',
      sessionId: 'mock-planning-session',
      costUsd: 0.03,
      durationMs: 12000,
    },
    {
      phase: 'working',
      iteration: 1,
      sessionId: 'mock-working-session-1',
      costUsd: 0.09,
      durationMs: 25000,
    },
  ],
}

const STOPPED_RUN: RunInfo = {
  ...COMPLETED_RUN,
  status: 'stopped',
  stoppedDuring: 'working',
  stopReason: 'user',
}

const STOPPED_PLANNING_RUN: RunInfo = {
  status: 'stopped',
  stoppedDuring: 'planning',
  stopReason: 'user',
  startedAt: NOW,
  lastIterationAt: NOW,
  costUsd: 0.02,
  phases: [
    {
      phase: 'planning',
      sessionId: 'mock-planning-session',
      costUsd: 0.02,
      durationMs: 8000,
    },
  ],
}

const BUDGET_STOPPED_WORKING_RUN: RunInfo = {
  ...COMPLETED_RUN,
  status: 'stopped',
  stoppedDuring: 'working',
  stopReason: 'budget',
}

const BUDGET_STOPPED_PLANNING_RUN: RunInfo = {
  status: 'stopped',
  stoppedDuring: 'planning',
  stopReason: 'budget',
  startedAt: NOW,
  lastIterationAt: NOW,
  costUsd: 0.02,
  phases: [
    {
      phase: 'planning',
      sessionId: 'mock-planning-session',
      costUsd: 0.02,
      durationMs: 8000,
    },
  ],
}

// ── Mock plan content ───────────────────────────────────────────────────

const MOCK_PLAN = `## Plan

1. Research the current implementation
2. Identify key areas for improvement
3. Implement the changes
4. Write tests
5. Update documentation`

// ── TaskContent per phase ───────────────────────────────────────────────

export type MockPhase =
  | 'idle'
  | 'planning'
  | 'plan_ready'
  | 'working'
  | 'completed'
  | 'stopped'
  | 'budget_stopped'

export type MockStoppedDuring = 'planning' | 'working'

const MOCK_FRONTMATTER: TaskFrontmatter = {
  title: 'Refactor auth module',
  createdAt: NOW,
  stream: 'mock-stream',
}

const MOCK_DESCRIPTION = `Refactor the authentication module to use JWT tokens instead of session-based auth. The current session store is backed by Redis and has been causing intermittent failures during peak traffic — sessions expire silently, users get logged out mid-workflow, and the ops team is tired of restarting the Redis cluster every few days.

The new implementation should use short-lived JWTs (15 min access token) with a longer-lived refresh token stored in an httpOnly cookie. We need to support token rotation on every refresh to prevent replay attacks. The access token payload should include user ID, workspace ID, and a permissions bitfield — keep it lean so we stay under the 8KB cookie limit.

Key areas to touch:
- Replace the session middleware in api/middleware/auth.ts with a JWT verification step
- Add a /api/auth/refresh endpoint that issues new token pairs
- Update the login flow to return tokens instead of setting a session cookie
- Migrate the permission checks in lib/auth/permissions.ts to read from the JWT payload instead of hitting the database on every request
- Add token revocation support via a short-lived blacklist (Redis is fine here, ironically)
- Update all API route handlers that currently call req.session.user to use the new req.auth context

Edge cases to handle:
- Clock skew between servers (add a 30s leeway on expiration checks)
- Concurrent requests during token refresh (queue refresh calls, return the same promise)
- Graceful migration for existing sessions (dual-read for 2 weeks, then hard cutover)
- Mobile app tokens need longer refresh windows (30 days vs 7 days for web)

Testing requirements:
- Unit tests for token generation, verification, and rotation
- Integration tests for the full login → refresh → logout flow
- Load test the refresh endpoint to make sure it handles thundering herd gracefully
- Security review: verify tokens can't be forged, replayed, or used after revocation`

const MOCK_INPUTS = [
  {
    name: 'auth-spec',
    title: 'Auth Requirements',
    originalPath: 'mock-stream/tasks/mock-task/inputs/auth-spec/original.pdf',
    originalName: 'original.pdf',
    rawPath: 'mock-stream/tasks/mock-task/inputs/auth-spec/raw.txt',
    sourceUrl: null,
    favicon: null,
    modifiedAt: NOW,
  },
]

const MOCK_OUTPUTS = [
  {
    name: 'auth-module.ts',
    path: 'mock-stream/tasks/mock-task/outputs/auth-module.ts',
    type: 'file' as const,
    title: null,
    modifiedAt: NOW,
  },
  {
    name: 'auth-module.test.ts',
    path: 'mock-stream/tasks/mock-task/outputs/auth-module.test.ts',
    type: 'file' as const,
    title: null,
    modifiedAt: NOW,
  },
]

const MOCK_WORKING = [
  {
    name: 'research-notes.md',
    path: 'mock-stream/tasks/mock-task/working/research-notes.md',
    type: 'file' as const,
    title: null,
    modifiedAt: NOW,
  },
]

export const MOCK_PHASES: Record<MockPhase, TaskContent> = {
  idle: {
    frontmatter: MOCK_FRONTMATTER,
    plan: null,
    description: MOCK_DESCRIPTION,
    run: null,
    inputs: MOCK_INPUTS,
    working: [],
    outputs: [],
  },
  planning: {
    frontmatter: MOCK_FRONTMATTER,
    plan: null,
    description: MOCK_DESCRIPTION,
    run: PLANNING_RUN,
    inputs: MOCK_INPUTS,
    working: [],
    outputs: [],
  },
  plan_ready: {
    frontmatter: MOCK_FRONTMATTER,
    plan: MOCK_PLAN,
    description: MOCK_DESCRIPTION,
    run: PLAN_READY_RUN,
    inputs: MOCK_INPUTS,
    working: [],
    outputs: [],
  },
  working: {
    frontmatter: MOCK_FRONTMATTER,
    plan: MOCK_PLAN,
    description: MOCK_DESCRIPTION,
    run: RUNNING_RUN,
    inputs: MOCK_INPUTS,
    working: MOCK_WORKING,
    outputs: [],
  },
  completed: {
    frontmatter: MOCK_FRONTMATTER,
    plan: MOCK_PLAN,
    description: MOCK_DESCRIPTION,
    run: COMPLETED_RUN,
    inputs: MOCK_INPUTS,
    working: MOCK_WORKING,
    outputs: MOCK_OUTPUTS,
  },
  stopped: {
    frontmatter: MOCK_FRONTMATTER,
    plan: MOCK_PLAN,
    description: MOCK_DESCRIPTION,
    run: STOPPED_RUN,
    inputs: MOCK_INPUTS,
    working: MOCK_WORKING,
    outputs: MOCK_OUTPUTS,
  },
  budget_stopped: {
    frontmatter: MOCK_FRONTMATTER,
    plan: MOCK_PLAN,
    description: MOCK_DESCRIPTION,
    run: BUDGET_STOPPED_WORKING_RUN,
    inputs: MOCK_INPUTS,
    working: MOCK_WORKING,
    outputs: MOCK_OUTPUTS,
  },
}

/** Content varies by which phase was interrupted when budget-stopped. */
export const MOCK_BUDGET_STOPPED_CONTENT: Record<
  MockStoppedDuring,
  TaskContent
> = {
  working: {
    frontmatter: MOCK_FRONTMATTER,
    plan: MOCK_PLAN,
    description: MOCK_DESCRIPTION,
    run: BUDGET_STOPPED_WORKING_RUN,
    inputs: MOCK_INPUTS,
    working: MOCK_WORKING,
    outputs: MOCK_OUTPUTS,
  },
  planning: {
    frontmatter: MOCK_FRONTMATTER,
    plan: null,
    description: MOCK_DESCRIPTION,
    run: BUDGET_STOPPED_PLANNING_RUN,
    inputs: MOCK_INPUTS,
    working: [],
    outputs: [],
  },
}

/** Content varies by which phase was active when stopped. */
export const MOCK_STOPPED_CONTENT: Record<MockStoppedDuring, TaskContent> = {
  working: {
    frontmatter: MOCK_FRONTMATTER,
    plan: MOCK_PLAN,
    description: MOCK_DESCRIPTION,
    run: STOPPED_RUN,
    inputs: MOCK_INPUTS,
    working: MOCK_WORKING,
    outputs: MOCK_OUTPUTS,
  },
  planning: {
    frontmatter: MOCK_FRONTMATTER,
    plan: null,
    description: MOCK_DESCRIPTION,
    run: STOPPED_PLANNING_RUN,
    inputs: MOCK_INPUTS,
    working: [],
    outputs: [],
  },
}

// ── Mock activity steps ─────────────────────────────────────────────────

export const MOCK_PLANNING_STEPS: ActivityStep[] = [
  {
    toolUseId: 'mock-think-1',
    toolName: '__thinking__',
    label: 'Thinking',
    detail: null,
    linesAdded: null,
    elapsedSeconds: 0,
    isActive: false,
  },
  {
    toolUseId: 'mock-read-1',
    toolName: 'Read',
    label: 'Reading',
    detail: 'auth-module.ts',
    linesAdded: null,
    elapsedSeconds: 2,
    isActive: true,
  },
]

export const MOCK_WORKING_STEPS: ActivityStep[] = [
  {
    toolUseId: 'mock-write-1',
    toolName: 'Write',
    label: 'Writing',
    detail: 'auth-module.ts',
    linesAdded: 45,
    elapsedSeconds: 3,
    isActive: true,
  },
]

export const PHASE_ORDER: MockPhase[] = [
  'idle',
  'planning',
  'plan_ready',
  'working',
  'completed',
  'stopped',
  'budget_stopped',
]
