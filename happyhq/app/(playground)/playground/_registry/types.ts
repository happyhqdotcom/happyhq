import type { ReactNode } from 'react'

export type Category =
  | 'Messages'
  | 'Thinking'
  | 'Tools'
  | 'Interaction'
  | 'Composer'
  | 'Attachments'
  | 'Primitives'
  | 'Markdown'
  | 'Conversation'
  | 'Windows'

export interface PlaygroundVariant {
  name: string
  data: unknown
}

export interface PlaygroundControl {
  type: 'toggle' | 'slider' | 'select'
  label: string
  default: unknown
  min?: number
  max?: number
  step?: number
  options?: { label: string; value: unknown }[]
}

export interface PlaygroundComponent {
  id: string
  name: string
  category: Category
  canvasWidth?: 'sm' | 'md' | 'lg' | 'xl'
  variants: Record<string, PlaygroundVariant>
  controls?: Record<string, PlaygroundControl>
  render: (props: {
    data: unknown
    controls: Record<string, unknown>
    log: (event: string, ...args: unknown[]) => void
  }) => ReactNode
}

export interface PlaygroundEvent {
  timestamp: number
  name: string
  args: unknown[]
}
