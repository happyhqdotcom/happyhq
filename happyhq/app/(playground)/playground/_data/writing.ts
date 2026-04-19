import type { SubagentActivity, WritingPreview } from '@/lib/chat/types'

// ---------------------------------------------------------------------------
// WritingPreview fixtures — apple pie themed
// ---------------------------------------------------------------------------

export const WRITING_WITH_TEXT: WritingPreview = {
  parentToolUseId: 'writing-text-1',
  text: `# Apple Pie — All-Butter Double Crust

## Overview
Classic American apple pie with a flaky all-butter crust, Honeycrisp-Granny Smith filling, and a maceration technique that concentrates flavor and prevents soggy bottoms.

## Crust

### Ingredients
- 2½ cups all-purpose flour
- 1 cup (2 sticks) unsalted butter, frozen 30 min
- 1 tsp salt
- 1 tbsp sugar
- 6–8 tbsp ice water

### Method
1. Whisk flour, salt, and sugar
2. Grate frozen butter on box grater directly into flour
3. Toss gently — pea-sized pieces are fine, streaks are better
4. Add ice water 1 tbsp at a time, folding with spatula
5. Stop when dough just holds together (don't overwork)
6. Split into 2 discs, wrap in plastic
7. Refrigerate minimum 1 hour, overnight preferred`,
  isActive: false,
}

export const WRITING_WITH_SUBAGENT_TOOLS: WritingPreview = {
  parentToolUseId: 'writing-subagent-1',
  text: '',
  isActive: false,
  subagentToolProgress: [
    { toolName: 'Read', toolUseId: 'sub-read-1', elapsedSeconds: 0.6 },
    { toolName: 'Read', toolUseId: 'sub-read-2', elapsedSeconds: 0.4 },
    { toolName: 'Grep', toolUseId: 'sub-grep-1', elapsedSeconds: 0.8 },
  ],
}

export const WRITING_WITH_FILE_PREVIEW: WritingPreview = {
  parentToolUseId: 'writing-file-1',
  text: '',
  isActive: false,
  filePreview: {
    filePath: 'specs/apple-pie.md',
    content: `# Apple Pie — All-Butter Double Crust

## Overview
Classic American apple pie with a flaky all-butter crust, Honeycrisp-Granny Smith filling, and a maceration technique that concentrates flavor and prevents soggy bottoms.

## Crust

### Ingredients
- 2½ cups all-purpose flour
- 1 cup (2 sticks) unsalted butter, frozen 30 min
- 1 tsp salt
- 1 tbsp sugar
- 6–8 tbsp ice water

### Method
1. Whisk flour, salt, and sugar
2. Grate frozen butter on box grater directly into flour
3. Toss gently — pea-sized pieces are fine, streaks are better
4. Add ice water 1 tbsp at a time, folding with spatula
5. Stop when dough just holds together (don't overwork)
6. Split into 2 discs, wrap in plastic
7. Refrigerate minimum 1 hour, overnight preferred

## Filling

### Ingredients
- 3 lbs apples (2:1 Honeycrisp to Granny Smith)
- ¾ cup granulated sugar
- 1 tbsp bourbon
- 2 tsp cinnamon, ¼ tsp nutmeg`,
  },
}

export const WRITING_ACTIVE_STREAMING: WritingPreview = {
  parentToolUseId: 'writing-streaming-1',
  text: '',
  isActive: true,
}

// ---------------------------------------------------------------------------
// SubagentActivity fixtures — apple pie themed
// ---------------------------------------------------------------------------

export const SINGLE_SUBAGENT_ACTIVE: SubagentActivity[] = [
  {
    taskId: 'sa-1',
    description: 'Drafting',
    progress: 'Reading apple-pie.md',
    isComplete: false,
  },
]

export const SINGLE_SUBAGENT_COMPLETE: SubagentActivity[] = [
  {
    taskId: 'sa-1',
    description: 'Drafting',
    isComplete: true,
    summary: 'done',
    toolUses: 5,
    durationMs: 12300,
  },
]

export const PARALLEL_SUBAGENTS: SubagentActivity[] = [
  {
    taskId: 'sa-1',
    description: 'Explore',
    isComplete: true,
    summary: 'done',
    toolUses: 3,
    durationMs: 4200,
  },
  {
    taskId: 'sa-2',
    description: 'Explore',
    progress: 'Scanning samples/',
    isComplete: false,
  },
  {
    taskId: 'sa-3',
    description: 'Drafting',
    progress: 'Writing playbook',
    isComplete: false,
  },
]
