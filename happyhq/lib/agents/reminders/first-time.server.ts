/**
 * Reminder: First-Time / Empty Workspace
 *
 * Conditions: General mode, no stream has playbook content.
 * Why: Without this, Q has no idea the user is new and may behave as if
 *      streams and tasks already exist.
 *
 * Example:
 *   This is a new workspace with no streams yet. The user is probably new
 *   to Q. Help them understand what Q does: learn how they work, then do the
 *   work for them. Streams hold knowledge (playbook + specs + samples). When
 *   they're ready, enter learning mode.
 */
export function firstTimeContext(): string {
  return `This is a new workspace with no streams yet. The user is probably new to Q. Help them understand what Q does: learn how they work, then do the work for them. Streams hold knowledge (playbook + specs + samples). When they're ready, enter learning mode.`
}
