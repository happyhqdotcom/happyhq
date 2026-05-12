'use client'

import {
  useStreamContent,
  useStreamTitle,
} from '@/components/features/desktop/hooks/use-desktop-data'
import {
  CloseButton,
  SettingsButton,
  Shell,
  Sidebar,
} from '@/components/features/desktop/panels/atoms'
import { displayTitle } from '@/lib/format'
import { useStreamSlug } from '@/stores/desktopStore'
import { PlaybookSection } from '../sections/playbook-section'
import { SamplesSection } from '../sections/samples-section'
import { SpecsSection } from '../sections/specs-section'

interface StreamPanelProps {
  openFileWindow: (entry: {
    name: string
    title?: string
    path: string
    rawPath?: string | null
  }) => void
  openDirectoryWindow: (id: string, title: string) => void
  openOrFocusWindow: (
    id: string,
    title: string,
    filePath: string,
    content: string,
  ) => void
  sidebarOpen: boolean
  onSidebarOpenChange: (open: boolean) => void
}

export function StreamPanel({
  openFileWindow,
  openDirectoryWindow,
  openOrFocusWindow,
  sidebarOpen,
  onSidebarOpenChange,
}: StreamPanelProps) {
  const streamSlug = useStreamSlug()
  const streamTitle = useStreamTitle()
  const streamContent = useStreamContent()

  const playbook = streamContent?.playbook ?? null
  const playbookTitle = streamContent?.playbookTitle ?? null
  const playbookBody = streamContent?.playbookBody ?? null
  const specs = streamContent?.specs ?? []
  const sampleTypes = streamContent?.sampleTypes ?? []
  const samples = streamContent?.samples ?? []

  // Title: frontmatter title > formatted slug
  const title = playbookTitle ?? displayTitle(streamTitle, streamSlug)

  return (
    <Shell>
      <div className="flex min-h-0 flex-1">
        {/* Left — main content */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* Title — styled as prose-q H1 */}
            <div className="flex items-center gap-2 px-4 pt-4 pb-1">
              <h1
                className="min-w-0 flex-1 truncate"
                style={{
                  fontFamily: "'Avenir Next', system-ui, sans-serif",
                  fontSize: '19.5px',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.5,
                  color: '#333333',
                }}
              >
                {title}
              </h1>
              <SettingsButton
                onToggle={() => onSidebarOpenChange(!sidebarOpen)}
              />
              <CloseButton />
            </div>

            <PlaybookSection
              playbookBody={playbookBody}
              onOpen={() =>
                openOrFocusWindow(
                  'playbook',
                  'playbook.md',
                  `${streamSlug}/playbook.md`,
                  playbook ?? '',
                )
              }
            />

            <hr className="border-zinc-100" />
            <SpecsSection
              specs={specs}
              onFileClick={(spec) =>
                openFileWindow({ name: spec.name, path: spec.path })
              }
              onBrowse={() => openDirectoryWindow('dir-specs', 'Specs')}
            />

            {sampleTypes.length > 0 && (
              <>
                <hr className="border-zinc-100" />
                <SamplesSection
                  sampleTypes={sampleTypes}
                  samples={samples}
                  onBrowse={() => openDirectoryWindow('dir-samples', 'Samples')}
                />
              </>
            )}
          </div>
        </div>

        <Sidebar open={sidebarOpen} />
      </div>
    </Shell>
  )
}
