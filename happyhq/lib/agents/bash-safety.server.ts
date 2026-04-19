/**
 * Safe Bash command detection for the learning agent's canUseTool callback.
 *
 * When the agent chains commands (e.g. "cd /path && git commit"), the SDK's
 * allowedTools prefix matching sees "cd" — not "git" — and falls through to
 * canUseTool, which would show a permission prompt. This module lets canUseTool
 * auto-approve commands where every segment is benign.
 *
 * Server-only. Pure function, no side effects.
 */

/** Commands that are safe to auto-approve without user confirmation. */
const SAFE_PREFIXES = new Set([
  'git', // version control (chains miss allowedTools when cd-prefixed)
  'ls', // directory listing
  'cd', // change directory
  'mkdir', // create directories
  'pwd', // print working directory
  'echo', // print text
  'cat', // read file
  'head', // read file head
  'tail', // read file tail
  'wc', // word/line count
  'which', // find executable path
  'find', // find files
  'grep', // search files
  'sort', // sort text
  'basename', // extract filename
  'dirname', // extract directory
  'date', // print date
  'true', // no-op success
  'test', // test conditions
  '[', // test bracket syntax
  'printf', // formatted text output
  'tr', // character translation in pipes
])

/**
 * canUseTool callback for automated agents (planning, working).
 * Auto-approves safe bash commands; denies everything else immediately.
 * No user is present, so we never block for confirmation.
 */
export async function automatedCanUseTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string }
> {
  if (
    toolName === 'Bash' &&
    typeof input.command === 'string' &&
    isSafeBashCommand(input.command)
  ) {
    return { behavior: 'allow', updatedInput: input }
  }

  return {
    behavior: 'deny',
    message: `Tool "${toolName}" is not auto-approved for automated agents. Use Write/Edit for file changes, or safe Bash commands (git, ls, cd, mkdir, etc.).`,
  }
}

const CONSECUTIVE_DENIAL_LIMIT = 5

/**
 * Create a canUseTool callback with a consecutive-denial circuit breaker.
 *
 * After CONSECUTIVE_DENIAL_LIMIT denials without an intervening approval,
 * the next denial sets `interrupt: true`, causing the SDK to stop the agent.
 * Each invocation returns a fresh closure — counter resets per agent run.
 */
export function createAutomatedCanUseTool() {
  let consecutiveDenials = 0

  // Accept the SDK's 3rd `options` arg but don't use it
  return async (
    toolName: string,
    input: Record<string, unknown>,
    _options?: unknown,
  ) => {
    const result = await automatedCanUseTool(toolName, input)

    if (result.behavior === 'allow') {
      consecutiveDenials = 0
      return result
    }

    consecutiveDenials++
    if (consecutiveDenials >= CONSECUTIVE_DENIAL_LIMIT) {
      return {
        behavior: 'deny' as const,
        message: `Circuit breaker: ${consecutiveDenials} consecutive tool denials. Stop attempting disallowed actions.`,
        interrupt: true,
      }
    }

    return result
  }
}

/**
 * Check if a Bash command consists entirely of safe, benign subcommands.
 * Returns true only if ALL segments in a chain are safe.
 *
 * Rejects commands containing subshell/substitution syntax to prevent
 * hiding unsafe commands inside safe-looking wrappers (e.g. `echo $(rm -rf /)`).
 */
export function isSafeBashCommand(command: string): boolean {
  // Reject subshells and command substitution — can hide arbitrary execution.
  // Allow $(cat << heredoc patterns (just multi-line string formatting for commit messages).
  if (/\$\((?!cat\s*<<)|`/.test(command)) return false

  // Strip heredoc blocks (<<'EOF'...EOF or <<EOF...EOF) before splitting —
  // heredocs legitimately contain newlines that aren't command separators.
  const withoutHeredocs = command.replace(/<<'?(\w+)'?[\s\S]*?\n\1\n?/g, '')

  // Split on shell chain/pipe operators: &&, ||, ;, |, newline
  const segments = withoutHeredocs.split(/\s*(?:&&|\|\||[;|\n])\s*/)

  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed) continue // empty segment (e.g. trailing ;)

    // Extract the command name, skipping VAR=value env prefixes
    const words = trimmed.split(/\s+/)
    let cmdIndex = 0
    while (cmdIndex < words.length && words[cmdIndex].includes('=')) {
      cmdIndex++
    }
    const cmd = words[cmdIndex]
    if (!cmd) continue

    if (!SAFE_PREFIXES.has(cmd)) {
      return false
    }
  }

  return true
}
