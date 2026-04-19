/**
 * Ring buffer that captures stderr output from a Claude Code subprocess.
 * Pass `write` as the `options.stderr` callback. On error, read back
 * the last N lines via `getTail()` for logging/diagnostics.
 */
export class StderrBuffer {
  private lines: string[] = []
  private partial = '' // incomplete line from last chunk
  private maxLines: number

  constructor(maxLines = 50) {
    this.maxLines = maxLines
  }

  /** The callback to pass as `options.stderr`. */
  write = (data: string): void => {
    const text = this.partial + data
    const parts = text.split('\n')
    // Last element is either empty (data ended with \n) or a partial line
    this.partial = parts.pop() ?? ''
    for (const line of parts) {
      if (line.length === 0) continue
      this.lines.push(line)
      if (this.lines.length > this.maxLines) {
        this.lines.shift()
      }
    }
  }

  /** Return all captured lines. */
  getLines(): string[] {
    return this.lines
  }

  /** Return the last N lines as a single string. */
  getTail(n = 5): string {
    return this.lines.slice(-n).join('\n')
  }
}
