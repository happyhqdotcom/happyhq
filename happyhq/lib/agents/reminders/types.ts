export interface ReminderContext {
  mode: 'general' | 'learning'
  streamSlug: string | null
  sessionId: string
  taskSlug?: string
  message: string
}
