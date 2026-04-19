// Command Menu Types

// Page types for multi-page navigation (cmdk pattern)
export type Page =
  | { type: 'url-input'; source: string; label: string }
  | { type: 'web-sources' }
  | { type: 'streams' }
  | { type: 'tasks' }

// Command selection types - discriminated union for type-safe selection handling
export type CommandSelection = { type: 'file' } | { type: 'url'; url: string }
