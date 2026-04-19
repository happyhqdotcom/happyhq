/** Structured email metadata written to email.json for the UI viewer. */
export interface EmailMetadata {
  subject: string
  from: string
  to: string
  cc?: string
  date?: string
  body: string
  attachments: string[]
  links?: Array<{ url: string; text: string }>
}
