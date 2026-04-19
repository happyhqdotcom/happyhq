export interface DebugBundle {
  version: 1
  exportedAt: string // ISO 8601
  appVersion: string
  streamName: string | null
  chat: {
    sessionId: string
    name: string | null
    createdAt: string | null // ISO 8601, null if dir doesn't exist
  }
  rawJournal: string | null // Raw JSONL string, not parsed
  playbook: string | null
  specs: DebugBundleSpec[] // Empty array if no specs dir
  environment: {
    platform: string
    nodeVersion: string
    arch: string
  }
}

export interface DebugBundleSpec {
  name: string // e.g., "observability.md"
  content: string
}
