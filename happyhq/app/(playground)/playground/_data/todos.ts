import type { ToolCall } from '@/lib/chat/types'

/**
 * All tasks completed — represents a finished todo list.
 */
export const TODO_ALL_COMPLETED: ToolCall = {
  id: 'todo-all-completed',
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
        status: 'completed',
        activeForm: 'Writing variations spec',
      },
      {
        content: 'Add troubleshooting notes',
        status: 'completed',
        activeForm: 'Adding troubleshooting notes',
      },
    ],
  },
}

/**
 * Mix of completed, in-progress, and pending — extracted from kitchen-sink ks-7.
 */
export const TODO_IN_PROGRESS: ToolCall = {
  id: 'todo-in-progress',
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
}

/**
 * 10 items to test scroll behavior and longer lists.
 */
export const TODO_MANY_ITEMS: ToolCall = {
  id: 'todo-many-items',
  name: 'TodoWrite',
  input: {
    todos: [
      {
        content: 'Source heirloom apple varieties',
        status: 'completed',
        activeForm: 'Sourcing heirloom apple varieties',
      },
      {
        content: 'Compare butter vs lard for crust',
        status: 'completed',
        activeForm: 'Comparing butter vs lard for crust',
      },
      {
        content: 'Test blind bake temperatures',
        status: 'completed',
        activeForm: 'Testing blind bake temperatures',
      },
      {
        content: 'Measure spice ratios',
        status: 'completed',
        activeForm: 'Measuring spice ratios',
      },
      {
        content: 'Evaluate thickener options',
        status: 'completed',
        activeForm: 'Evaluating thickener options',
      },
      {
        content: 'Draft lattice weaving guide',
        status: 'in_progress',
        activeForm: 'Drafting lattice weaving guide',
      },
      {
        content: 'Write egg wash variations',
        status: 'pending',
        activeForm: 'Writing egg wash variations',
      },
      {
        content: 'Document cooling and storage times',
        status: 'pending',
        activeForm: 'Documenting cooling and storage times',
      },
      {
        content: 'Add serving suggestions and pairings',
        status: 'pending',
        activeForm: 'Adding serving suggestions and pairings',
      },
      {
        content: 'Compile final troubleshooting FAQ',
        status: 'pending',
        activeForm: 'Compiling final troubleshooting FAQ',
      },
    ],
  },
}
