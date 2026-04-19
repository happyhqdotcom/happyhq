#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'

// ANSI escape codes
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const MAGENTA = '\x1b[35m'
const RESET = '\x1b[0m'
const CLEAR_LINE = '\x1b[2K'

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// Iteration info from env vars (set by loop.sh)
const ITERATION = parseInt(process.env.LOOP_ITERATION || '0', 10)
const MAX_ITERATIONS = parseInt(process.env.LOOP_MAX || '0', 10)

// State — per iteration
let spinnerInterval = null
let spinnerFrame = 0
let totalInputTokens = 0
let totalOutputTokens = 0
let cacheReadTokens = 0
let cacheCreationTokens = 0
let activeTasks = new Map() // task_id -> description
let toolCounts = {} // tool_name -> count
let iterationStartTime = Date.now()

// State — cumulative (written to LOOP_STATS_FILE for loop.sh to read)
const STATS_FILE = process.env.LOOP_STATS_FILE || ''

// ── Spinner ──────────────────────────────────────────────

function startSpinner(label) {
  stopSpinner()
  spinnerFrame = 0
  process.stdout.write(`  ${DIM}${SPINNER[0]} ${label}${RESET}`)
  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER.length
    process.stdout.write(`\r${CLEAR_LINE}  ${DIM}${SPINNER[spinnerFrame]} ${label}${RESET}`)
  }, 80)
}

function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval)
    spinnerInterval = null
    process.stdout.write(`\r${CLEAR_LINE}`)
  }
}

// ── Formatting helpers ───────────────────────────────────

function truncate(str, max) {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '…'
}

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min < 60) return `${min}m ${sec}s`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return `${hr}h ${remMin}m`
}

function iterationLabel() {
  if (ITERATION <= 0) return ''
  if (MAX_ITERATIONS > 0) return `${ITERATION}/${MAX_ITERATIONS}`
  return `${ITERATION}`
}

function computeCost(input, output, cacheRead, cacheCreate) {
  return (
    (input * 15) / 1_000_000 +
    (output * 75) / 1_000_000 +
    (cacheRead * 1.5) / 1_000_000 +
    (cacheCreate * 18.75) / 1_000_000
  )
}

// Mutation tools get bold green to stand out from read-only tools
const MUTATION_TOOLS = new Set(['Edit', 'Write', 'Bash'])

function formatToolUse(name, input) {
  // Track tool usage
  toolCounts[name] = (toolCounts[name] || 0) + 1

  const maxWidth = process.stdout.columns || 80
  const label = name.padEnd(7)
  const available = maxWidth - 4 - label.length

  let param = ''
  if (name === 'Read' || name === 'Edit' || name === 'Write') {
    param = input.file_path || ''
  } else if (name === 'Bash') {
    param = input.command || ''
  } else if (name === 'Glob') {
    param = input.pattern || ''
  } else if (name === 'Grep') {
    param = input.pattern || ''
  } else if (name === 'Agent') {
    param = input.description || (input.prompt || '').slice(0, 60)
  } else if (name === 'TodoWrite') {
    const count = input.todos?.length ?? 0
    param = `${count} task${count !== 1 ? 's' : ''}`
  } else {
    const first = Object.values(input || {}).find((v) => typeof v === 'string')
    param = (first || '').slice(0, 60)
  }

  const isMutation = MUTATION_TOOLS.has(name)
  const color = isMutation ? `${GREEN}${BOLD}` : CYAN
  process.stdout.write(`  ${color}${label}${RESET}${truncate(param, available)}\n`)
}

function formatText(text) {
  if (!text || !text.trim()) return
  const lines = text.trim().split('\n')
  const bordered = lines.map((line) => `  ${DIM}│${RESET} ${line}`).join('\n')
  process.stdout.write(`\n${bordered}\n\n`)
}

function formatToolSummary() {
  const entries = Object.entries(toolCounts).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return ''
  return entries.map(([name, count]) => `${count} ${name}`).join(' · ')
}

// ── Event handlers ───────────────────────────────────────

function handleAssistant(data) {
  stopSpinner()
  const content = data.message?.content || []
  const usage = data.message?.usage

  // Accumulate usage
  if (usage) {
    totalInputTokens += usage.input_tokens || 0
    totalOutputTokens += usage.output_tokens || 0
    cacheReadTokens += usage.cache_read_input_tokens || 0
    cacheCreationTokens += usage.cache_creation_input_tokens || 0
  }

  for (const block of content) {
    if (block.type === 'thinking') {
      process.stdout.write(`  ${DIM}⠿ Thinking${RESET}\n`)
    } else if (block.type === 'text') {
      formatText(block.text)
    } else if (block.type === 'tool_use') {
      formatToolUse(block.name, block.input || {})
    }
  }
}

function handleUser(_data) {
  // Tool results — we don't need to show these, the next assistant
  // message will show what it does with them
}

function handleSystem(data) {
  const { subtype } = data

  if (subtype === 'init') {
    const iter = iterationLabel()
    const iterStr = iter ? ` · iteration ${iter}` : ''
    process.stdout.write(`  ${DIM}model: ${data.model} · v${data.claude_code_version}${iterStr}${RESET}\n\n`)
    return
  }

  if (subtype === 'task_started') {
    stopSpinner()
    activeTasks.set(data.task_id, data.description || 'agent')
    process.stdout.write(`  ${MAGENTA}Agent${RESET}  ${data.description || 'working'}${DIM} started${RESET}\n`)
    startSpinner(`${activeTasks.size} agent${activeTasks.size !== 1 ? 's' : ''} working…`)
    return
  }

  if (subtype === 'task_progress') {
    const desc = data.description || data.last_tool_name || ''
    if (desc) {
      stopSpinner()
      const taskDesc = activeTasks.get(data.task_id) || 'agent'
      process.stdout.write(`  ${DIM}  ↳ ${taskDesc}: ${desc}${RESET}\n`)
      startSpinner(`${activeTasks.size} agent${activeTasks.size !== 1 ? 's' : ''} working…`)
    }
    return
  }

  if (subtype === 'task_notification') {
    activeTasks.delete(data.task_id)
    stopSpinner()
    const status = data.status === 'completed' ? `${GREEN}✓${RESET}` : `${YELLOW}⚠${RESET}`
    const usage = data.usage || {}
    const tools = usage.tool_uses || 0
    const dur = usage.duration_ms ? `${(usage.duration_ms / 1000).toFixed(1)}s` : ''
    process.stdout.write(`  ${status} ${MAGENTA}Agent${RESET}  ${data.summary || 'done'}${DIM} · ${tools} tools · ${dur}${RESET}\n`)
    if (activeTasks.size > 0) {
      startSpinner(`${activeTasks.size} agent${activeTasks.size !== 1 ? 's' : ''} working…`)
    }
    return
  }
}

function handleRateLimit(data) {
  const info = data.rate_limit_info || {}
  if (info.status !== 'allowed') {
    stopSpinner()
    const resetsAt = info.resetsAt ? new Date(info.resetsAt * 1000).toLocaleTimeString() : '?'
    process.stdout.write(`  ${YELLOW}⏳ Rate limited — resets at ${resetsAt}${RESET}\n`)
  }
}

function handleResult(data) {
  stopSpinner()

  const elapsed = Date.now() - iterationStartTime
  const usage = data.usage || {}
  const input = usage.input_tokens || totalInputTokens
  const output = usage.output_tokens || totalOutputTokens
  const cacheRead = usage.cache_read_input_tokens || cacheReadTokens
  const cacheCreate = usage.cache_creation_input_tokens || cacheCreationTokens

  const fmt = (n) => n.toLocaleString()

  // Elapsed time
  let parts = [formatDuration(elapsed)]

  // Token counts
  parts.push(`${fmt(input)} in`, `${fmt(output)} out`)
  if (cacheRead > 0) parts.push(`${fmt(cacheRead)} cached`)
  if (cacheCreate > 0) parts.push(`${fmt(cacheCreate)} cache-write`)

  // Cost
  const cost = computeCost(input, output, cacheRead, cacheCreate)
  if (cost > 0) parts.push(`~$${cost.toFixed(2)}`)

  process.stdout.write(`\n  ${GREEN}${BOLD}✓${RESET}${GREEN} Done · ${parts.join(' · ')}${RESET}\n`)

  // Tool summary
  const toolSummary = formatToolSummary()
  if (toolSummary) {
    process.stdout.write(`  ${DIM}Tools: ${toolSummary}${RESET}\n`)
  }

  process.stdout.write('\n')

  // Write cumulative stats to file for loop.sh to read
  if (STATS_FILE) {
    const stats = JSON.stringify({ input, output, cacheRead, cacheCreate, cost, elapsed })
    writeFileSync(STATS_FILE, stats)
  }

  // Reset for next iteration
  totalInputTokens = 0
  totalOutputTokens = 0
  cacheReadTokens = 0
  cacheCreationTokens = 0
  toolCounts = {}
  iterationStartTime = Date.now()
}

// ── Main ─────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin })

rl.on('line', (line) => {
  const trimmed = line.trim()
  if (!trimmed) return

  let data
  try {
    data = JSON.parse(trimmed)
  } catch {
    // Not JSON — pass through (e.g., stderr mixed in)
    process.stdout.write(`${DIM}${trimmed}${RESET}\n`)
    return
  }

  switch (data.type) {
    case 'assistant':
      handleAssistant(data)
      break
    case 'user':
      handleUser(data)
      break
    case 'system':
      handleSystem(data)
      break
    case 'rate_limit_event':
      handleRateLimit(data)
      break
    case 'result':
      handleResult(data)
      break
    // Ignore unknown types
  }
})

rl.on('close', () => {
  stopSpinner()
})

process.on('SIGINT', () => {
  stopSpinner()
  process.exit(0)
})

process.on('SIGTERM', () => {
  stopSpinner()
  process.exit(0)
})
