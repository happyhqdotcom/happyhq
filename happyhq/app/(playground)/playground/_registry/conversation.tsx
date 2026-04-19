import { StartTaskCard } from '@/components/features/chat/interaction/start-task-card'
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
        renderCreateTask={(tc: ToolCall) => (
          <StartTaskCard
            name={(tc.input as { name?: string })?.name ?? 'untitled'}
            title={
              (tc.input as { textContext?: string })?.textContext ?? undefined
            }
            onStart={() => {
              log('start-task', tc.input)
            }}
          />
        )}
      />
    )
  },
}

export const conversationComponents: PlaygroundComponent[] = [fullConversation]
