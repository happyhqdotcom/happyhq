/**
 * Single source of truth for file types accepted across upload surfaces:
 * task file pickers, chat composer, sample intake, and the agent's intake tool.
 *
 * Eager extraction in `lib/actions/ingestion.ts` only knows how to read these
 * three formats — adding others requires extending the extraction pipeline first.
 */
export const ALLOWED_INPUT_EXTENSIONS = ['.pdf', '.eml', '.docx'] as const

export type AllowedInputExtension = (typeof ALLOWED_INPUT_EXTENSIONS)[number]

/** Value for `<input accept="...">`. */
export const ALLOWED_INPUT_ACCEPT = ALLOWED_INPUT_EXTENSIONS.join(',')

export function isAllowedInputExtension(ext: string): boolean {
  return (ALLOWED_INPUT_EXTENSIONS as readonly string[]).includes(
    ext.toLowerCase(),
  )
}

export function isAllowedInputFilename(filename: string): boolean {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return false
  return isAllowedInputExtension(filename.slice(dot))
}
