/**
 * Reminder: Upload Awareness
 *
 * Conditions: User message contains `[Files uploaded: ...]`, any mode.
 * Why: Without this, Q reads the raw binary instead of the extracted form
 *      and may auto-process uploads as samples without asking.
 *
 * Example:
 *   The user uploaded files. They're at .chats/abc-123/uploads/. Each upload
 *   is a directory with the original plus an extracted form (PDF→raw.txt,
 *   EML→email.json, DOCX→content.md). Read the extracted form first.
 *   Don't auto-process uploads as samples. Read, understand intent, confirm
 *   with the user.
 */
export function uploadAwareness(sessionId: string): string {
  return [
    `The user uploaded files. They're at .chats/${sessionId}/uploads/. Each upload is a directory with the original plus an extracted form (PDF→raw.txt, EML→email.json, DOCX→content.md). Read the extracted form first.`,
    `Don't auto-process uploads as samples. Read, understand intent, confirm with the user.`,
  ].join('\n')
}

/** Detect upload annotation in user message. */
export function hasUploads(message: string): boolean {
  return message.includes('[Files uploaded: ')
}
