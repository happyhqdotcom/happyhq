import type { ComponentType } from 'react'

export interface FrontmatterRendererProps {
  fields: Record<string, string>
}

export type FrontmatterRenderer = ComponentType<FrontmatterRendererProps>
