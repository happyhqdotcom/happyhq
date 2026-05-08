export type ModelKey = 'haiku' | 'sonnet' | 'opus'

export type ThinkingMode = 'adaptive' | 'enabled' | 'disabled'

export type HomeBranding =
  | 'stickers'
  | 'poolside'
  | 'logo'
  | 'q'
  | 'random'
  | 'none'

export type SidebarDefault = 'open' | 'collapsed'

export interface ModelConfig {
  model?: ModelKey
  thinking?: ThinkingMode
}

export interface AppConfig {
  models?: {
    learning?: ModelConfig
    discovery?: ModelConfig
    planning?: ModelConfig
    working?: ModelConfig
  }
  limits?: {
    discoveryBudgetUsd?: number
    planningBudgetUsd?: number
    workingBudgetUsd?: number
    maxIterations?: number
  }
  general?: {
    sidebarDefault?: SidebarDefault
    sendWithEnter?: boolean
  }
  appearance?: {
    homeBranding?: HomeBranding
  }
  git?: {
    authorName?: string
    authorEmail?: string
  }
}

/** AppConfig with all fields guaranteed present (defaults filled in). */
export interface ResolvedConfig {
  models: {
    learning: Required<ModelConfig>
    discovery: Required<ModelConfig>
    planning: Required<ModelConfig>
    working: Required<ModelConfig>
  }
  limits: {
    discoveryBudgetUsd: number
    planningBudgetUsd: number
    workingBudgetUsd: number
    maxIterations: number
  }
  general: {
    sidebarDefault: SidebarDefault
    sendWithEnter: boolean
  }
  appearance: {
    homeBranding: HomeBranding
  }
  git: {
    authorName: string
    authorEmail: string
  }
}
