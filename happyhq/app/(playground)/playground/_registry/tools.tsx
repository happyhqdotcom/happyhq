'use client'

import { ToolProgressIndicator } from '@/components/features/chat/messages/tool-progress-indicator'
import type { ToolCall, ToolProgressStep } from '@/lib/chat/types'

import type { PlaygroundComponent } from './types'

// ---------------------------------------------------------------------------
// Per-tool fixture data — one step + one call per tool type
// ---------------------------------------------------------------------------

function toolData(
  step: ToolProgressStep,
  call: ToolCall,
): { steps: ToolProgressStep[]; toolCalls: ToolCall[] } {
  return { steps: [step], toolCalls: [call] }
}

const READ = toolData(
  { toolName: 'Read', toolUseId: 'read-1', elapsedSeconds: 0.4 },
  { id: 'read-1', name: 'Read', input: { file_path: '/specs/apple-pie.md' } },
)

const WRITE = toolData(
  { toolName: 'Write', toolUseId: 'write-1', elapsedSeconds: 0.8 },
  {
    id: 'write-1',
    name: 'Write',
    input: {
      file_path: '/specs/apple-pie-variations.md',
      content: `# Apple Pie — Variations

## Dutch Apple (Crumb Top)
Replace the top crust with a streusel topping:
- 1 cup flour, ½ cup brown sugar, ½ cup cold butter
- Pinch of cinnamon and salt
- Press together into clumps, scatter over filling
- Bake at 375°F for 45–50 min (no blind bake needed)

## Salted Caramel Apple
Add to the standard filling:
- ¼ cup homemade caramel sauce, drizzled between apple layers
- ½ tsp flaky sea salt on top crust before baking
- Reduce sugar in filling to ½ cup (caramel adds sweetness)`,
    },
  },
)

const EDIT = toolData(
  { toolName: 'Edit', toolUseId: 'edit-1', elapsedSeconds: 1.3 },
  { id: 'edit-1', name: 'Edit', input: { file_path: '/specs/apple-pie.md' } },
)

const GREP = toolData(
  { toolName: 'Grep', toolUseId: 'grep-1', elapsedSeconds: 0.6 },
  { id: 'grep-1', name: 'Grep', input: { pattern: 'blind bake' } },
)

const GLOB = toolData(
  { toolName: 'Glob', toolUseId: 'glob-1', elapsedSeconds: 0.3 },
  { id: 'glob-1', name: 'Glob', input: { pattern: 'recipes/**/*.md' } },
)

const BASH = toolData(
  { toolName: 'Bash(git diff:*)', toolUseId: 'bash-1', elapsedSeconds: 0.5 },
  {
    id: 'bash-1',
    name: 'Bash',
    input: { command: 'git diff specs/', description: 'Check spec changes' },
  },
)

const WEB_SEARCH = toolData(
  { toolName: 'WebSearch', toolUseId: 'ws-1', elapsedSeconds: 1.8 },
  {
    id: 'ws-1',
    name: 'WebSearch',
    input: { query: 'best apple pie crust technique' },
  },
)

const WEB_FETCH = toolData(
  { toolName: 'WebFetch', toolUseId: 'wf-1', elapsedSeconds: 2.1 },
  {
    id: 'wf-1',
    name: 'WebFetch',
    input: { url: 'https://seriouseats.com/apple-pie-recipe' },
  },
)

const TODO_WRITE = toolData(
  { toolName: 'TodoWrite', toolUseId: 'todo-1', elapsedSeconds: 0.2 },
  {
    id: 'todo-1',
    name: 'TodoWrite',
    input: {
      todos: [
        {
          content: 'Read recipe documents',
          status: 'completed',
          activeForm: 'Reading recipe documents',
        },
        {
          content: 'Identify crust and filling preferences',
          status: 'completed',
          activeForm: 'Identifying crust and filling preferences',
        },
        {
          content: 'Write main apple pie spec',
          status: 'in_progress',
          activeForm: 'Writing main apple pie spec',
        },
        {
          content: 'Write variations spec',
          status: 'pending',
          activeForm: 'Writing variations spec',
        },
        {
          content: 'Add troubleshooting notes',
          status: 'pending',
          activeForm: 'Adding troubleshooting notes',
        },
      ],
    },
  },
)

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

interface ToolsVariantData {
  steps: ToolProgressStep[]
  toolCalls: ToolCall[]
}

const toolsRegistration: PlaygroundComponent = {
  id: 'tools',
  name: 'Tools',
  category: 'Tools',
  canvasWidth: 'md',
  variants: {
    read: { name: 'Read', data: READ },
    write: { name: 'Write', data: WRITE },
    edit: { name: 'Edit', data: EDIT },
    grep: { name: 'Grep', data: GREP },
    glob: { name: 'Glob', data: GLOB },
    bash: { name: 'Bash', data: BASH },
    'web-search': { name: 'Web Search', data: WEB_SEARCH },
    'web-fetch': { name: 'Web Fetch', data: WEB_FETCH },
    'todo-write': { name: 'Todo Write', data: TODO_WRITE },
  },
  controls: {
    isStreaming: {
      type: 'toggle',
      label: 'Streaming',
      default: false,
    },
  },
  render: ({ data, controls }) => {
    const { steps, toolCalls } = data as ToolsVariantData
    return (
      <ToolProgressIndicator
        steps={steps}
        toolCalls={toolCalls}
        isStreaming={controls.isStreaming as boolean}
      />
    )
  },
}

export const toolComponents: PlaygroundComponent[] = [toolsRegistration]
