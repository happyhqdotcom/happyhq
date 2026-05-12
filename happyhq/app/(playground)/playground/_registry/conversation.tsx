import { TaskBubble } from '@/components/features/chat/interaction/task-bubble'
import { ChatMessageList } from '@/components/features/chat/messages/chat-message-list'
import type { ChatMessage, ToolCall } from '@/lib/chat/types'

import {
  CONVERSATION_LEARNING_SESSION,
  CONVERSATION_QUICK_EXCHANGE,
} from '../_data/conversations'
import type { PlaygroundComponent } from './types'

const fullConversation: PlaygroundComponent = {
  id: 'conversation/full',
  name: 'Full Conversation',
  category: 'Conversation',
  canvasWidth: 'lg',
  variants: {
    'learning-session': {
      name: 'Learning Session',
      data: CONVERSATION_LEARNING_SESSION,
    },
    'quick-exchange': {
      name: 'Quick Exchange',
      data: CONVERSATION_QUICK_EXCHANGE,
    },
  },
  render: ({ data, log }) => {
    const messages = data as ChatMessage[]
    return (
      <ChatMessageList
        messages={messages}
        renderCreateTask={(tc: ToolCall) => {
          const input = tc.input as {
            name?: string
            textContext?: string
          }
          return (
            <TaskBubble
              name={input.name ?? 'untitled'}
              textContext={input.textContext}
              state={
                tc.taskStarted
                  ? 'started'
                  : tc.taskCreated
                    ? 'created'
                    : 'suggested'
              }
              onCreate={() => log('create-task', tc.input)}
              onStart={() => log('start-task', tc.input)}
              onView={() => log('view-task', tc.input)}
            />
          )
        }}
      />
    )
  },
}

export const conversationComponents: PlaygroundComponent[] = [fullConversation]
