import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import fs from 'fs'
import path from 'path'
import { z } from 'zod/v4'

import { setChatMode } from '@/lib/actions'
import { setSessionMode } from '@/lib/chat/session-mode'
import type { ChatStreamEvent } from '@/lib/chat/types'
import { extractContentFromDocx } from '@/lib/docx/extract-text.server'
import { extractContentFromEml } from '@/lib/eml/extract-text.server'
import { isAllowedInputExtension } from '@/lib/file-types'
import {
  assertSafePathSegment,
  assertSafeSessionId,
  assertSafeStreamName,
  chatPath,
  streamPath,
} from '@/lib/fs/paths'
import { extractTextFromPdf } from '@/lib/pdf/extract-text.server'

/** Short internal name for the MCP server. Appears in prefixed tool names as mcp__q__<tool>. */
export const MCP_SERVER_NAME = 'q'

/** Generate the SDK's full MCP tool name from a short name (e.g. 'CreateTask' → 'mcp__q__CreateTask'). */
export function mcpToolName(name: string): string {
  return `mcp__${MCP_SERVER_NAME}__${name}`
}

/**
 * Create the MCP server with custom tools for Q.
 * @param streamRoot - Absolute path to the stream root directory (for file operations)
 * @param sessionId - Chat session ID (used by ProcessSample to locate uploads)
 * @param opts - Optional callbacks for mode transitions and client notifications
 */
export function createQsMcpServer(
  streamRoot: string,
  sessionId: string,
  opts?: {
    notifyClient?: (event: ChatStreamEvent) => void
    chatDir?: string
  },
): McpSdkServerConfigWithInstance {
  // sessionId is captured by every tool below for path construction —
  // assert once here so the regex barrier sits between the caller's input
  // and the `path.join(...)` inside the tools (CodeQL taint source).
  assertSafeSessionId(sessionId)
  return createSdkMcpServer({
    name: MCP_SERVER_NAME,
    tools: [
      tool(
        'CreateTask',
        'Create a task. Renders a Start Task card in the chat. Only call after a playbook exists and you have what you need. textContext is the only bridge to planning — it reads cold from disk.',
        {
          name: z
            .string()
            .describe('Task name, kebab-cased (e.g., "q4-report")'),
          textContext: z
            .string()
            .describe(
              'Relevant context gathered during the conversation for this task',
            ),
          files: z
            .array(z.string())
            .default([])
            .describe(
              'Upload directory names to move to task inputs. Pass the directory slug only (e.g., "acme-report"), NOT paths to files inside it.',
            ),
        },
        async ({ name, textContext: _textContext, files: _files }) => {
          // Auto-approved: runs immediately when the agent calls CreateTask.
          // The client renders a task card the user can start at any time.
          return {
            content: [
              {
                type: 'text' as const,
                text: `Task "${name}" suggested to user. A task card is now visible in the chat. The user can start it at any time — continue the conversation naturally.`,
              },
            ],
          }
        },
      ),

      tool(
        'ProcessSample',
        'Process an uploaded file (PDF or EML) into the samples directory. Handles text extraction and filesystem organization. Call this for each file the user drops in chat.',
        {
          slug: z
            .string()
            .describe('Upload directory name (e.g., "acme-report-q4")'),
          category: z
            .string()
            .describe(
              'Sample category — output type only: sows, reports, proposals',
            ),
          name: z
            .string()
            .describe(
              'Sample name in kebab-case (e.g., "bridgeway-tech-audit")',
            ),
          categoryTitle: z
            .string()
            .optional()
            .describe(
              'Human-readable category name when it differs from title-cased slug (e.g., "SOWs" instead of "Sows")',
            ),
        },
        async ({ slug, category, name, categoryTitle }) => {
          // Agent-supplied identifiers flow into path.join below — assert
          // each segment up-front so the regex barrier sits on the source.
          try {
            assertSafePathSegment(slug, 'upload slug')
            assertSafePathSegment(category, 'sample category')
            assertSafePathSegment(name, 'sample name')
          } catch (err) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
            }
          }
          // Uploads live at root chat path, not under stream
          const uploadDir = path.join(chatPath(sessionId), 'uploads', slug)

          // 1. Validate upload directory exists
          if (!fs.existsSync(uploadDir)) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: Upload "${slug}" not found in .chats/${sessionId}/uploads/`,
                },
              ],
            }
          }

          // 2. Find original.* file
          const files = fs.readdirSync(uploadDir)
          const originalFile = files.find((f) => f.startsWith('original.'))
          if (!originalFile) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: No original.* file found in upload "${slug}"`,
                },
              ],
            }
          }

          // 3. Validate file is a supported format
          const ext = path.extname(originalFile).toLowerCase()
          if (!isAllowedInputExtension(ext)) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: Only PDF, EML, and DOCX files are supported for sample intake. "${originalFile}" is a ${ext || 'unknown'} file.`,
                },
              ],
            }
          }

          // 4. Move upload directory to samples/{category}/{name}/ (atomic rename)
          const sampleDir = path.join(streamRoot, 'samples', category, name)
          if (fs.existsSync(sampleDir)) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: A sample named "${name}" already exists in samples/${category}/. Choose a different name or ask the user if this is a replacement.`,
                },
              ],
            }
          }
          const categoryDir = path.join(streamRoot, 'samples', category)
          fs.mkdirSync(categoryDir, { recursive: true })
          // Write category display title if provided and no .meta.json exists yet.
          // The 'wx' flag fails atomically with EEXIST if the file already exists,
          // closing the existsSync/writeFileSync TOCTOU window where a concurrent
          // writer could have created the file between the two calls.
          if (categoryTitle) {
            const metaPath = path.join(categoryDir, '.meta.json')
            try {
              fs.writeFileSync(
                metaPath,
                JSON.stringify({ title: categoryTitle }),
                { encoding: 'utf-8', flag: 'wx' },
              )
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
            }
          }
          try {
            fs.renameSync(uploadDir, sampleDir)
          } catch (err) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: Failed to move upload "${slug}" to samples/${category}/${name}/: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
            }
          }

          const originalPath = path.join(sampleDir, originalFile)

          // 5. Extract agent-readable form if not already present
          //    PDF → raw.txt, EML → email.json, DOCX → content.md
          const hasExtracted =
            fs.existsSync(path.join(sampleDir, 'raw.txt')) ||
            fs.existsSync(path.join(sampleDir, 'email.json')) ||
            fs.existsSync(path.join(sampleDir, 'content.md'))
          if (!hasExtracted) {
            try {
              const buffer = fs.readFileSync(originalPath)
              if (ext === '.pdf') {
                const rawText = await extractTextFromPdf(buffer)
                fs.writeFileSync(
                  path.join(sampleDir, 'raw.txt'),
                  rawText,
                  'utf-8',
                )
              } else if (ext === '.eml') {
                const { metadata, attachments } =
                  await extractContentFromEml(buffer)
                fs.writeFileSync(
                  path.join(sampleDir, 'email.json'),
                  JSON.stringify(metadata),
                  'utf-8',
                )
                for (const att of attachments) {
                  fs.writeFileSync(
                    path.join(sampleDir, att.filename),
                    att.content,
                  )
                }
              } else if (ext === '.docx') {
                const { markdown, images } =
                  await extractContentFromDocx(buffer)
                fs.writeFileSync(
                  path.join(sampleDir, 'content.md'),
                  markdown,
                  'utf-8',
                )
                for (const img of images) {
                  fs.writeFileSync(
                    path.join(sampleDir, img.filename),
                    img.content,
                  )
                }
              }
            } catch (err) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: `Error: Text extraction failed for "${slug}": ${err instanceof Error ? err.message : String(err)}`,
                  },
                ],
              }
            }
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: `Processed "${slug}" → samples/${category}/${name}/\n• ${originalFile} (source file)\n• raw.txt (extracted text)\n\nYou should now write or update samples/${category}/INDEX.md with a description of this sample.`,
              },
            ],
          }
        },
      ),

      tool(
        'EnterLearningMode',
        'Enter learning mode for a specific stream. Call when the user is teaching, correcting, or wants to change how their work gets done.',
        {
          streamSlug: z
            .string()
            .describe('Stream to learn in (directory name)'),
        },
        async ({ streamSlug: slug }) => {
          try {
            assertSafeStreamName(slug)
          } catch (err) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
            }
          }
          const streamDir = streamPath(slug)
          if (!fs.existsSync(streamDir)) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Stream "${slug}" not found.`,
                },
              ],
            }
          }

          setSessionMode(sessionId, 'learning', slug)

          if (opts?.chatDir) {
            setChatMode(opts.chatDir, 'learning', slug).catch(console.error)
          }

          opts?.notifyClient?.({
            type: 'mode_changed',
            mode: 'learning',
            streamSlug: slug,
          })

          return {
            content: [
              {
                type: 'text' as const,
                text: `Entered learning mode for ${slug}. Your job here is to learn how this work gets done — ask great questions, read what's there, and capture what you learn into the playbook, specs, and samples. Call ExitLearningMode when the teaching is complete.`,
              },
            ],
          }
        },
      ),

      tool(
        'ExitLearningMode',
        'Exit learning mode and return to general conversation.',
        {},
        async () => {
          setSessionMode(sessionId, 'general')

          if (opts?.chatDir) {
            setChatMode(opts.chatDir, 'general').catch(console.error)
          }

          opts?.notifyClient?.({
            type: 'mode_changed',
            mode: 'general',
          })

          return {
            content: [
              {
                type: 'text' as const,
                text: 'Exited learning mode.',
              },
            ],
          }
        },
      ),
    ],
  })
}
