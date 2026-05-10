import { attachmentComponents } from './attachments'
import { composerComponents } from './composer'
import { conversationComponents } from './conversation'
import { interactionComponents } from './interaction'
import { markdownComponents } from './markdown'
import { messageComponents } from './messages'
import { primitivesComponents } from './primitives'
import { subagentComponents } from './subagent'
import { thinkingComponents } from './thinking'
import { toolComponents } from './tools'
import type { PlaygroundComponent } from './types'
import { windowComponents } from './windows'

export const PLAYGROUND_COMPONENTS: PlaygroundComponent[] = [
  ...messageComponents,
  ...thinkingComponents,
  ...toolComponents,
  ...subagentComponents,
  ...interactionComponents,
  ...composerComponents,
  ...attachmentComponents,
  ...primitivesComponents,
  ...markdownComponents,
  ...conversationComponents,
  ...windowComponents,
]

export function findComponent(id: string): PlaygroundComponent | undefined {
  return PLAYGROUND_COMPONENTS.find((c) => c.id === id)
}
