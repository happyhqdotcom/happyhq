import type { ToolCall, ToolProgressStep } from '@/lib/chat/types'

// ---------------------------------------------------------------------------
// Few steps — simple Glob + Read (2 steps)
// ---------------------------------------------------------------------------

export const TOOL_STEPS_FEW: ToolProgressStep[] = [
  { toolName: 'Glob', toolUseId: 'few-1', elapsedSeconds: 0.3 },
  { toolName: 'Read', toolUseId: 'few-2', elapsedSeconds: 1.2 },
]

export const TOOL_CALLS_FEW: ToolCall[] = [
  {
    id: 'few-1',
    name: 'Glob',
    input: { pattern: 'recipes/**/*.md' },
  },
  {
    id: 'few-2',
    name: 'Read',
    input: { file_path: '/recipes/apple-pie.md' },
  },
]

// ---------------------------------------------------------------------------
// Many steps — 6 steps processing recipe documents
// ---------------------------------------------------------------------------

export const TOOL_STEPS_MANY: ToolProgressStep[] = [
  { toolName: 'Glob', toolUseId: 'many-1', elapsedSeconds: 0.3 },
  { toolName: 'Read', toolUseId: 'many-2', elapsedSeconds: 1.2 },
  { toolName: 'Read', toolUseId: 'many-3', elapsedSeconds: 0.9 },
  { toolName: 'Grep', toolUseId: 'many-4', elapsedSeconds: 0.6 },
  { toolName: 'ProcessSample', toolUseId: 'many-5', elapsedSeconds: 3.4 },
  { toolName: 'ProcessSample', toolUseId: 'many-6', elapsedSeconds: 2.8 },
]

export const TOOL_CALLS_MANY: ToolCall[] = [
  {
    id: 'many-1',
    name: 'Glob',
    input: { pattern: 'samples/**/*.pdf' },
  },
  {
    id: 'many-2',
    name: 'Read',
    input: { file_path: '/samples/grandmas-apple-pie-original.pdf' },
  },
  {
    id: 'many-3',
    name: 'Read',
    input: { file_path: '/samples/my-apple-pie-notes.docx' },
  },
  {
    id: 'many-4',
    name: 'Grep',
    input: { pattern: 'blind bake' },
  },
  {
    id: 'many-5',
    name: 'ProcessSample',
    input: { slug: 'grandmas-apple-pie-original' },
  },
  {
    id: 'many-6',
    name: 'ProcessSample',
    input: { slug: 'my-apple-pie-notes' },
  },
]

// ---------------------------------------------------------------------------
// With rich renderers — Edit, Bash, Write, TodoWrite (has rich tool displays)
// ---------------------------------------------------------------------------

export const TOOL_STEPS_WITH_RICH: ToolProgressStep[] = [
  { toolName: 'Edit', toolUseId: 'rich-1', elapsedSeconds: 1.3 },
  { toolName: 'Bash(git diff:*)', toolUseId: 'rich-2', elapsedSeconds: 0.5 },
  { toolName: 'Write', toolUseId: 'rich-3', elapsedSeconds: 0.8 },
  { toolName: 'TodoWrite', toolUseId: 'rich-4', elapsedSeconds: 0.2 },
]

export const TOOL_CALLS_WITH_RICH: ToolCall[] = [
  {
    id: 'rich-1',
    name: 'Edit',
    input: { file_path: '/specs/apple-pie.md' },
  },
  {
    id: 'rich-2',
    name: 'Bash',
    input: {
      command: 'git diff specs/',
      description: 'Check spec changes',
    },
  },
  {
    id: 'rich-3',
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
- Reduce sugar in filling to ½ cup (caramel adds sweetness)

## Mini Hand Pies
- Use standard crust recipe, roll thinner (⅛ inch)
- Cut 5-inch rounds, fill with 2 tbsp filling each
- Fold, crimp with fork, egg wash
- Bake 400°F for 18–22 min`,
    },
  },
  {
    id: 'rich-4',
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
          status: 'completed',
          activeForm: 'Writing main apple pie spec',
        },
        {
          content: 'Write variations spec',
          status: 'in_progress',
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
]
