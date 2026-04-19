/**
 * Reminder: New Stream
 *
 * Conditions: Learning mode, stream has no playbook, no specs, no samples.
 * Why: Without this, Q tries to read files that don't exist (the learning
 *      layer mentions artifact types, Q goes looking) and jumps to creating
 *      artifacts before understanding the work.
 *
 * Mutually exclusive with: Stream Manifest.
 *
 * Example:
 *   ## Stream: apple-pies
 *   This is a new stream with no content yet. Your job is to understand how
 *   the user does this work — so you can do it for them, exactly how they
 *   would. Ask thoughtful questions first.
 */
export function newStreamReminder(streamSlug: string): string {
  return `## Stream: ${streamSlug}\nThis is a new stream with no content yet. Your job is to understand how the user does this work — so you can do it for them, exactly how they would. Ask thoughtful questions first.`
}
