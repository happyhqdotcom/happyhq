import { AskUserConfirmation } from '@/components/features/chat/interaction/ask-user-confirmation'
import { QuestionOptions } from '@/components/features/chat/interaction/question-options'
import { StartTaskCard } from '@/components/features/chat/interaction/start-task-card'
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

const startTaskRegistration: PlaygroundComponent = {
  id: 'interaction/start-task',
  name: 'Start Task Card',
  category: 'Interaction',
  variants: {
    default: {
      name: 'Default',
      data: {
        name: 'thanksgiving-apple-pies',
        title: 'Bake three apple pie variants for Thanksgiving',
      },
    },
  },
  controls: {
    started: {
      type: 'toggle',
      label: 'Started',
      default: false,
    },
    showTitle: {
      type: 'toggle',
      label: 'Show Title',
      default: true,
    },
  },
  render: ({ data, controls, log }) => {
    const { name, title } = data as { name: string; title: string }
    return (
      <StartTaskCard
        name={name}
        title={(controls.showTitle as boolean) ? title : null}
        started={controls.started as boolean}
        onStart={async () => {
          log('onStart', name)
          // Simulate async delay so the "Starting…" state is visible
          await new Promise((resolve) => setTimeout(resolve, 1500))
        }}
      />
    )
  },
}

export const interactionComponents: PlaygroundComponent[] = [
  confirmationRegistration,
  questionOptionsRegistration,
  startTaskRegistration,
]
