'use client'

import { useState } from 'react'

import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/common/catalyst/listbox'
import {
  SidebarHeading,
  SidebarSection,
} from '@/components/common/catalyst/sidebar'
import { toastError } from '@/components/common/ui/sonner'
import {
  CloseButton,
  SettingsButton,
  Shell,
  Sidebar,
} from '@/components/features/desktop/panels/atoms'
import { createTask } from '@/lib/actions'
import { displayTitle, generateTaskSlug } from '@/lib/format'
import { taskItemsKey } from '@/lib/swr-keys'
import { useStreams } from '@/stores/streamsStore'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'

export function DraftTaskPanel() {
  const router = useRouter()
  const streams = useStreams()
  const { mutate } = useSWRConfig()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedStream, setSelectedStream] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  async function commitTask() {
    const trimmed = title.trim()
    if (!trimmed || isCreating) return
    setIsCreating(true)
    try {
      const slug = generateTaskSlug(trimmed)
      await createTask(
        slug,
        trimmed,
        selectedStream ?? undefined,
        description || undefined,
      )
      mutate(taskItemsKey())
      if (selectedStream) {
        router.replace(
          `/${encodeURIComponent(selectedStream)}/${encodeURIComponent(slug)}`,
        )
      } else {
        router.replace(`/task/${encodeURIComponent(slug)}`)
      }
    } catch {
      toastError('Failed to create task')
      setIsCreating(false)
    }
  }

  return (
    <Shell>
      <div className="flex min-h-0 flex-1">
        {/* Left — title + description */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none">
            {/* Title row */}
            <div className="flex items-center gap-2 px-5 pt-4 pb-3">
              {/* Empty checkbox placeholder for alignment */}
              <span className="block size-5 shrink-0 rounded-full border border-zinc-300" />
              <input
                autoFocus
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitTask()
                  }
                }}
                onBlur={() => commitTask()}
                placeholder="What needs to be done?"
                disabled={isCreating}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400 disabled:opacity-50"
                style={{
                  fontFamily: "'Avenir Next', system-ui, sans-serif",
                  fontSize: '19.5px',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.5,
                  color: '#333333',
                }}
              />
              <SettingsButton onToggle={() => setSidebarOpen(!sidebarOpen)} />
              <CloseButton />
            </div>

            {/* Description */}
            <div className="px-5">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add context..."
                rows={8}
                disabled={isCreating}
                className="w-full resize-none border-0 bg-transparent p-0 text-sm outline-none placeholder:text-zinc-400 disabled:opacity-50"
                style={{
                  color: '#424242',
                  fontFamily: "'Avenir Next', system-ui, sans-serif",
                  lineHeight: 1.65,
                }}
              />
            </div>
          </div>
        </div>

        {/* Right — sidebar */}
        <Sidebar open={sidebarOpen} className="pt-4 pb-2">
          {streams.length > 0 && (
            <SidebarSection>
              <SidebarHeading className="!mb-0 px-3">
                Assigned To
              </SidebarHeading>
              <Listbox
                value={selectedStream}
                onChange={setSelectedStream}
                disabled={isCreating}
                placeholder="Select a stream"
                ghost
              >
                <ListboxOption value={null} compact>
                  <ListboxLabel>None</ListboxLabel>
                </ListboxOption>
                {streams.map((s) => (
                  <ListboxOption key={s.name} value={s.name} compact>
                    <ListboxLabel>{displayTitle(s.title, s.name)}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </SidebarSection>
          )}
        </Sidebar>
      </div>
    </Shell>
  )
}
