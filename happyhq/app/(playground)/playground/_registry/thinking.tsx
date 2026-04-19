import { ThinkingIndicator } from '@/components/features/chat/messages/thinking-indicator'
import type { ThinkingBlock } from '@/lib/chat/types'

import {
  THINKING_LONG_BLOCK,
  THINKING_MULTIPLE_BLOCKS,
  THINKING_SINGLE_BLOCK,
} from '../_data/thinking'
import type { PlaygroundComponent } from './types'

const thinkingIndicatorRegistration: PlaygroundComponent = {
  id: 'thinking/indicator',
  name: 'Thinking Indicator',
  category: 'Thinking',
  variants: {
    'single-block': { name: 'Single Block', data: THINKING_SINGLE_BLOCK },
    'multiple-blocks': {
      name: 'Multiple Blocks',
      data: THINKING_MULTIPLE_BLOCKS,
    },
    'long-block': { name: 'Long Block', data: THINKING_LONG_BLOCK },
  },
  controls: {
    isStreaming: {
      type: 'toggle',
      label: 'Streaming',
      default: false,
    },
  },
  render: ({ data, controls }) => {
    const blocks = data as ThinkingBlock[]
    return (
      <ThinkingIndicator
        blocks={blocks}
        isStreaming={controls.isStreaming as boolean}
      />
    )
  },
}

export const thinkingComponents: PlaygroundComponent[] = [
  thinkingIndicatorRegistration,
]
