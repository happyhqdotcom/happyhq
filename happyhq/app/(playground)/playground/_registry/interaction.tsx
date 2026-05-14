import { AskUserConfirmation } from '@/components/features/chat/interaction/ask-user-confirmation'
import { QuestionOptions } from '@/components/features/chat/interaction/question-options'
import {
  TaskBubble,
  type TaskBubbleState,
} from '@/components/features/chat/interaction/task-bubble'
import type { AskUserQuestionInput } from '@/lib/chat/types'

import {
  CONFIRMATION_BASH,
  CONFIRMATION_GENERIC,
  CONFIRMATION_GREP,
  CONFIRMATION_READ,
  CONFIRMATION_WEB_FETCH,
  CONFIRMATION_WEB_SEARCH,
  CONFIRMATION_WRITE,
} from '../_data/confirmations'
import {
  QUESTIONS_MULTI,
  QUESTIONS_MULTI_SELECT,
  QUESTIONS_SINGLE,
  QUESTIONS_WITH_DESCRIPTIONS,
} from '../_data/questions'
import type { PlaygroundComponent } from './types'

const confirmationRegistration: PlaygroundComponent = {
  id: 'interaction/confirmation',
  name: 'Ask User Approval',
  category: 'Interaction',
  variants: {
    'bash-command': { name: 'Bash Command', data: CONFIRMATION_BASH },
    'read-file': { name: 'Read File', data: CONFIRMATION_READ },
    'write-file': { name: 'Write File', data: CONFIRMATION_WRITE },
    'grep-search': { name: 'Grep Search', data: CONFIRMATION_GREP },
    'web-search': { name: 'Web Search', data: CONFIRMATION_WEB_SEARCH },
    'web-fetch': { name: 'Web Fetch', data: CONFIRMATION_WEB_FETCH },
    'generic-tool': { name: 'Generic Tool', data: CONFIRMATION_GENERIC },
  },
  render: ({ data, log }) => {
    const { toolName, input } = data as {
      toolName: string
      input: Record<string, unknown>
    }
    return (
      <AskUserConfirmation
        toolName={toolName}
        input={input}
        onAllow={() => log('onAllow', toolName)}
        onDeny={() => log('onDeny', toolName)}
      />
    )
  },
}

const questionOptionsRegistration: PlaygroundComponent = {
  id: 'interaction/questions',
  name: 'Ask User Question',
  category: 'Interaction',
  variants: {
    'single-question': { name: 'Single Question', data: QUESTIONS_SINGLE },
    'multi-question': { name: 'Multi Question', data: QUESTIONS_MULTI },
    'multi-select': { name: 'Multi-select', data: QUESTIONS_MULTI_SELECT },
    'with-descriptions': {
      name: 'With Descriptions',
      data: QUESTIONS_WITH_DESCRIPTIONS,
    },
  },
  render: ({ data, log }) => {
    const questions = data as AskUserQuestionInput['questions']
    return (
      <QuestionOptions
        questions={questions}
        onAnswer={(answers) => log('onAnswer', answers)}
        onCancel={() => log('onCancel')}
      />
    )
  },
}

const taskBubbleRegistration: PlaygroundComponent = {
  id: 'interaction/task-bubble',
  name: 'Task Bubble',
  category: 'Interaction',
  variants: {
    suggested: {
      name: 'Suggested',
      data: {
        name: 'thanksgiving-apple-pies',
        title: 'Bake three apple pie variants for Thanksgiving',
        streamSlug: 'pies',
        textContext:
          'User wants to try classic Dutch apple, salted caramel, and a savoury bacon-cheddar variant for Thanksgiving.',
        state: 'suggested',
      },
    },
    created: {
      name: 'Created',
      data: {
        name: 'thanksgiving-apple-pies',
        title: 'Bake three apple pie variants for Thanksgiving',
        streamSlug: 'pies',
        textContext:
          'User wants to try classic Dutch apple, salted caramel, and a savoury bacon-cheddar variant for Thanksgiving.',
        state: 'created',
      },
    },
  },
  controls: {
    started: {
      type: 'toggle',
      label: 'Started',
      default: false,
    },
    showStream: {
      type: 'toggle',
      label: 'Show Stream',
      default: true,
    },
    showContext: {
      type: 'toggle',
      label: 'Show Context',
      default: true,
    },
  },
  render: ({ data, controls, log }) => {
    const d = data as {
      name: string
      title: string
      streamSlug: string | null
      textContext: string | null
      state: TaskBubbleState
    }
    // 'started' control only meaningful on the Created variant — flips footer off.
    const effectiveState: TaskBubbleState =
      d.state === 'created' && (controls.started as boolean)
        ? 'started'
        : d.state
    return (
      <TaskBubble
        name={d.name}
        title={d.title}
        state={effectiveState}
        streamSlug={(controls.showStream as boolean) ? d.streamSlug : null}
        textContext={(controls.showContext as boolean) ? d.textContext : null}
        onCreate={async () => {
          log('onCreate', d.name)
          await new Promise((r) => setTimeout(r, 800))
        }}
        onStart={async () => {
          log('onStart', d.name)
          await new Promise((r) => setTimeout(r, 1200))
        }}
        onView={() => log('onView', d.name)}
      />
    )
  },
}

export const interactionComponents: PlaygroundComponent[] = [
  confirmationRegistration,
  questionOptionsRegistration,
  taskBubbleRegistration,
]
