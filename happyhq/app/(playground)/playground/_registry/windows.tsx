'use client'

import {
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react'

import { MarkdownWindowContent } from '@/components/features/desktop/windows/markdown/content'
import { FrontmatterBlockCurrent } from '@/components/features/desktop/windows/markdown/frontmatter/current'
import { FrontmatterBlockNotion } from '@/components/features/desktop/windows/markdown/frontmatter/notion'
import type { FrontmatterRendererProps } from '@/components/features/desktop/windows/markdown/frontmatter/types'
import { WindowFrame } from '@/components/features/desktop/windows/window-frame'

import type { PlaygroundComponent } from './types'

interface FrontmatterSpec {
  fields: Array<[string, string]>
  dateFields: Array<[string, number]>
  body: string
}

const TASK_SPEC: FrontmatterSpec = {
  fields: [
    ['streamSlug', 'client-onboarding'],
    ['taskSlug', 'draft-welcome-email'],
    ['status', 'completed'],
    ['mode', 'working'],
  ],
  dateFields: [
    ['createdAt', 180],
    ['completedAt', 15],
  ],
  body: `# Draft welcome email

The agent drafted a welcome email and saved a few variations for review.
`,
}

const WEB_SOURCE_SPEC: FrontmatterSpec = {
  fields: [
    ['url', 'https://www.example.com/articles/the-coming-shift-in-ai-coding'],
    ['title', 'The coming shift in AI coding'],
  ],
  dateFields: [['fetched', 95]],
  body: `> Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
> incididunt ut labore et dolore magna aliqua.

The full article body would render here. The frontmatter at the top is what we're
tuning — source link, fetched time, and the article title.
`,
}

const PENDING_RUN_SPEC: FrontmatterSpec = {
  fields: [
    ['streamSlug', 'research-q3'],
    ['taskSlug', 'summarise-competitor-pricing'],
    ['status', 'planning'],
    ['pending', 'true'],
  ],
  dateFields: [['createdAt', 4]],
  body: `# Plan in progress

The planning agent is still drafting steps for this task.
`,
}

const LONG_SPEC: FrontmatterSpec = {
  fields: [
    ['streamSlug', 'deep-research'],
    ['taskSlug', 'market-sizing-tam-sam-som'],
    ['status', 'completed'],
    ['mode', 'working'],
    ['priority', 'high'],
    ['owner', 'alex'],
    ['attachments', '3'],
    ['sourceCount', '17'],
    ['language', 'en'],
  ],
  dateFields: [
    ['createdAt', 60 * 26],
    ['startedAt', 60 * 24],
    ['completedAt', 60 * 4],
    ['updatedAt', 20],
  ],
  body: `# Long frontmatter

This sample exercises unknown keys (\`priority\`, \`owner\`, \`attachments\`,
\`sourceCount\`, \`language\`) so we can see how each variation handles
fallback rendering and label tidying.
`,
}

const RENDERERS: Record<string, ComponentType<FrontmatterRendererProps>> = {
  current: FrontmatterBlockCurrent,
  notion: FrontmatterBlockNotion,
}

const DEFAULT_RENDERER_KEY = 'notion'

function buildMarkdown(spec: FrontmatterSpec, now: number): string {
  const lines: string[] = ['---']
  for (const [key, value] of spec.fields) lines.push(`${key}: ${value}`)
  for (const [key, minutesAgo] of spec.dateFields) {
    const iso = new Date(now - minutesAgo * 60 * 1000).toISOString()
    lines.push(`${key}: ${iso}`)
  }
  lines.push('---', '', spec.body)
  return lines.join('\n')
}

// Cached once on first client read so useSyncExternalStore sees a stable
// snapshot — calling Date.now() fresh each render would re-trigger renders
// forever ("Maximum update depth exceeded").
let cachedNow: number | null = null
const readClientNow = (): number | null => {
  if (cachedNow === null) cachedNow = Date.now()
  return cachedNow
}
const subscribeNoop = () => () => {}
const readServerNow = (): number | null => null

// Returns Date.now() on the client (after hydration), null during SSR and the
// first hydration render so the playground sample dates don't trigger a
// hydration mismatch.
function useClientNow(): number | null {
  return useSyncExternalStore(subscribeNoop, readClientNow, readServerNow)
}

function PreviewWindow({
  spec,
  renderer,
}: {
  spec: FrontmatterSpec
  renderer: ComponentType<FrontmatterRendererProps>
}) {
  const constraintsRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 640, height: 520 })
  const [isMaximized, setIsMaximized] = useState(false)
  const [isOpen, setIsOpen] = useState(true)
  const now = useClientNow()
  const markdown = now === null ? '' : buildMarkdown(spec, now)

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mx-auto text-xs text-zinc-400 underline"
      >
        Window closed — reopen
      </button>
    )
  }

  return (
    <div
      ref={constraintsRef}
      className="relative mx-auto"
      style={{ width: size.width, height: size.height }}
    >
      <WindowFrame
        title="welcome-email.md"
        position={position}
        size={size}
        zIndex={1}
        dragConstraintsRef={constraintsRef}
        onClose={() => setIsOpen(false)}
        onFocus={() => {}}
        onDragEnd={setPosition}
        onResize={setSize}
        isMaximized={isMaximized}
        onToggleMaximize={() => setIsMaximized((m) => !m)}
        onRestoreFromMaximize={() => setIsMaximized(false)}
      >
        <MarkdownWindowContent
          markdown={markdown}
          loading={now === null}
          frontmatterRenderer={renderer}
        />
      </WindowFrame>
    </div>
  )
}

const markdownWindowEntry: PlaygroundComponent = {
  id: 'windows/markdown',
  name: 'Markdown Window',
  category: 'Windows',
  canvasWidth: 'lg',
  variants: {
    task: { name: 'Task metadata', data: TASK_SPEC },
    'web-source': { name: 'Web source', data: WEB_SOURCE_SPEC },
    'pending-run': { name: 'Pending run', data: PENDING_RUN_SPEC },
    long: { name: 'Long / unknown keys', data: LONG_SPEC },
  },
  controls: {
    frontmatter: {
      type: 'select',
      label: 'Frontmatter style',
      default: DEFAULT_RENDERER_KEY,
      options: [
        { label: 'Notion (new)', value: 'notion' },
        { label: 'Current (before)', value: 'current' },
      ],
    },
  },
  render: ({ data, controls }) => {
    const key = (controls.frontmatter as string) ?? DEFAULT_RENDERER_KEY
    const renderer = RENDERERS[key] ?? RENDERERS[DEFAULT_RENDERER_KEY]
    return <PreviewWindow spec={data as FrontmatterSpec} renderer={renderer} />
  },
}

export const windowComponents: PlaygroundComponent[] = [markdownWindowEntry]
