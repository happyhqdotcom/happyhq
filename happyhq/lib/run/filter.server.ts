import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

import type { ChatStreamEvent } from '@/lib/chat/types'
const encoder = new TextEncoder()

/**
 * Strip the SDK's MCP tool name prefix (e.g. mcp__happyhq-learning__CreateTask → CreateTask).
 * MCP tool names use the format mcp__{serverName}__{toolName}. The actual tool name
 * is the segment after the last `__`. Non-MCP names pass through unchanged.
 */
export function stripMcpPrefix(name: string): string {
  const idx = name.lastIndexOf('__')
  return idx > 0 && name.startsWith('mcp__') ? name.slice(idx + 2) : name
}

/**
 * Convert an SDK message to a wire-format ChatStreamEvent.
 * Returns null for SDK message types that are consumed server-side.
 */
export function filterMessage(msg: SDKMessage): ChatStreamEvent | null {
  switch (msg.type) {
    case 'stream_event':
      return {
        type: 'partial',
        event: msg.event as any,
        parentToolUseId: msg.parent_tool_use_id ?? undefined,
      }

    case 'assistant': {
      // Strip mcp__ prefixes from tool_use blocks so the client can match
      // on short names (CreateStream, CreateTask). Shallow-clone the message
      // and content array to avoid mutating SDK internals.
      const original = msg.message as any
      const content = Array.isArray(original.content)
        ? original.content.map((block: any) => {
            if (block.type === 'tool_use' && block.name) {
              const stripped = stripMcpPrefix(block.name)
              return stripped !== block.name
                ? { ...block, name: stripped }
                : block
            }
            return block
          })
        : original.content
      return {
        type: 'assistant',
        message: { ...original, content },
        parentToolUseId: msg.parent_tool_use_id ?? undefined,
      }
    }

    case 'tool_progress':
      return {
        type: 'tool_progress',
        toolName: stripMcpPrefix(msg.tool_name),
        toolUseId: msg.tool_use_id,
        elapsedSeconds: msg.elapsed_time_seconds,
        parentToolUseId: msg.parent_tool_use_id ?? undefined,
      }

    case 'result': {
      // Forward permission denials so the client can surface them (e.g., toast).
      // Available on both success and error results — a successful run can still
      // have denials that the model worked around.
      const denials = msg.permission_denials?.length
        ? msg.permission_denials.map((d) => ({
            toolName: stripMcpPrefix(d.tool_name),
            toolUseId: d.tool_use_id,
          }))
        : undefined
      return {
        type: 'result',
        subtype: msg.subtype,
        result: msg.subtype === 'success' ? msg.result : undefined,
        errors: msg.subtype !== 'success' ? msg.errors : undefined,
        permissionDenials: denials,
        costUsd: msg.total_cost_usd,
      }
    }

    case 'system': {
      // Forward subagent lifecycle events (task_started, task_progress,
      // task_notification) so the client can show what subagents are doing.
      // Other system subtypes (init, etc.) remain server-only.
      const sys = msg as any
      if (sys.subtype === 'task_started') {
        return {
          type: 'subagent_event',
          subtype: 'started',
          taskId: sys.task_id,
          description: sys.description,
        }
      }
      if (sys.subtype === 'task_progress') {
        return {
          type: 'subagent_event',
          subtype: 'progress',
          taskId: sys.task_id,
          description: sys.description,
          lastToolName: sys.last_tool_name,
        }
      }
      if (sys.subtype === 'task_notification') {
        return {
          type: 'subagent_event',
          subtype: 'completed',
          taskId: sys.task_id,
          status: sys.status,
          summary: sys.summary,
          toolUses: sys.usage?.tool_uses,
          durationMs: sys.usage?.duration_ms,
        }
      }
      return null
    }

    default:
      // Other SDK message types (status, hooks, etc.) are consumed
      // server-side and not forwarded to the client.
      return null
  }
}

/**
 * Encode a ChatStreamEvent as an NDJSON line (UTF-8 bytes).
 */
export function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(JSON.stringify(event) + '\n')
}
