export const PLAYBOOK_WINDOW_ID = 'playbook-md'
export const PLAN_WINDOW_ID = 'plan-md'
export const SPECS_WINDOW_ID = 'dir-specs'
export const SAMPLES_WINDOW_ID = 'dir-samples'
export const ACTIVITY_DEBUG_WINDOW_ID = 'debug-activity'
export const GIT_LOG_WINDOW_ID = 'debug-git-log'
export const MOCK_RUN_WINDOW_ID = 'debug-mock-run'

/** Transparent grid overlay — just the lines, no solid background. */
export const CANVAS_GRID_OVERLAY = {
  backgroundImage: `
    linear-gradient(to right, rgb(0 0 0 / 0.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(0 0 0 / 0.06) 1px, transparent 1px),
    linear-gradient(to right, rgb(0 0 0 / 0.03) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(0 0 0 / 0.03) 1px, transparent 1px)
  `,
  backgroundSize: '64px 64px, 64px 64px, 16px 16px, 16px 16px',
  backgroundPosition: '-1px -1px',
} as const
