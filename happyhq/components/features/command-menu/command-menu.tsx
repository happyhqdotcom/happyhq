// Command Menu
// Variant-based compositions of the command menu shell.
// Palette: New Task, New Stream, Streams (browse), Tasks (browse) + search across all
//          + Add from web (when a task is open)
// Quick Open: Streams (browse), Tasks (browse) + search across all

'use client'

import type { UnfurlResult } from '@/lib/actions/unfurl'
import { addWebInput } from '@/lib/actions/web-input'
import { invalidateStream } from '@/lib/swr-helpers'
import {
  useCommandMenuPage,
  useCommandMenuStore,
} from '@/stores/commandMenuStore'
import { Command as CommandPrimitive } from 'cmdk'
import { Globe, Hash, ListTodo, Plus, Waves } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useOpenPanel } from '../desktop/hooks/use-open-panel'
import {
  CommandMenuGroup,
  CommandMenuHeaderAction,
  CommandMenuItem,
} from './atoms'
import { CommandMenuShell } from './command-menu-shell'
import { StreamsGroup, TasksGroup } from './groups'
import { UrlInputPage, WebSourcesPage } from './pages'
import type { UrlInputAction } from './pages/url-input-page'

export function CommandMenu() {
  const variant = useCommandMenuStore((s) => s.variant)

  if (!variant) return null

  return variant === 'palette' ? <PaletteContent /> : <QuickOpenContent />
}

// ── Palette ────────────────────────────────────────────────────────────

function PaletteContent() {
  const page = useCommandMenuPage()
  const search = useCommandMenuStore((s) => s.search)
  const close = useCommandMenuStore((s) => s.close)
  const pushPage = useCommandMenuStore((s) => s.pushPage)

  // Task context — web inputs attach to the open task
  const openPanel = useOpenPanel()
  const taskSlug = openPanel.type === 'task' ? openPanel.taskSlug : undefined
  const streamSlug =
    openPanel.type === 'task' || openPanel.type === 'stream'
      ? openPanel.streamSlug
      : undefined

  // URL input action state for header button
  const [urlInputAction, setUrlInputAction] = useState<UrlInputAction>({
    type: 'disabled',
  })

  useEffect(() => {
    if (page?.type !== 'url-input') {
      // Reset locally-owned action state when UrlInputPage unmounts so the
      // next session starts from 'disabled' instead of stale data.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrlInputAction({ type: 'disabled' })
    }
  }, [page])

  // Handle URL submission — persist as web input on the current task
  const handleUrlSubmit = useCallback(
    (url: string, unfurl: UnfurlResult | null) => {
      if (page?.type === 'url-input' && page.source === 'research-topic') {
        toast('Research topics coming soon')
        close()
        return
      }

      if (!taskSlug) {
        toast.error('Open a task first to add web inputs')
        close()
        return
      }

      close()
      toast.promise(
        addWebInput(taskSlug, url, unfurl ?? undefined).then((result) => {
          if (result.error) throw new Error(result.error)
          if (streamSlug) invalidateStream(streamSlug)
          return result
        }),
        {
          loading: 'Saving link...',
          success: 'Link added to task inputs',
          error: (err) => err.message || 'Failed to add link',
        },
      )
    },
    [taskSlug, streamSlug, page, close],
  )

  // Handle Enter on url-input page
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (
        e.key === 'Enter' &&
        page?.type === 'url-input' &&
        (urlInputAction.type === 'preview' || urlInputAction.type === 'submit')
      ) {
        e.preventDefault()
        urlInputAction.onAction()
      }
    },
    [page, urlInputAction],
  )

  const headerAction =
    page?.type === 'url-input' ? (
      <CommandMenuHeaderAction action={urlInputAction} />
    ) : undefined

  return (
    <CommandMenuShell headerAction={headerAction} onKeyDown={handleKeyDown}>
      {/* Root view */}
      <CommandPrimitive.List className={page ? 'hidden' : 'px-1 py-1'}>
        <CommandPrimitive.Empty className="py-6 text-center text-sm text-zinc-500">
          No results found.
        </CommandPrimitive.Empty>
        <NewGroup />
        <BrowseGroup />
        {/* Add from web — only when a task is open */}
        {taskSlug && (
          <CommandMenuGroup heading="Add">
            <CommandMenuItem
              id="add-from-web"
              label="Add from the web"
              icon={Globe}
              action="Browse"
              iconColor="blue"
              keywords={['web', 'url', 'bookmark', 'article', 'link']}
              onSelect={() => pushPage({ type: 'web-sources' })}
            />
          </CommandMenuGroup>
        )}
        {/* Searchable: streams and tasks surface when typing */}
        {search && <StreamsGroup />}
        {search && <TasksGroup />}
      </CommandPrimitive.List>

      {/* Pages */}
      {page?.type === 'streams' && <StreamsPageView />}
      {page?.type === 'tasks' && <TasksPageView />}
      {page?.type === 'web-sources' && <WebSourcesPage onPushPage={pushPage} />}
      {page?.type === 'url-input' && (
        <UrlInputPage
          source={page.source}
          search={search}
          onSubmit={handleUrlSubmit}
          onActionChange={setUrlInputAction}
        />
      )}
    </CommandMenuShell>
  )
}

// ── Quick Open ─────────────────────────────────────────────────────────

function QuickOpenContent() {
  const page = useCommandMenuPage()
  const search = useCommandMenuStore((s) => s.search)

  return (
    <CommandMenuShell>
      {/* Root view */}
      <CommandPrimitive.List className={page ? 'hidden' : 'px-1 py-1'}>
        <CommandPrimitive.Empty className="py-6 text-center text-sm text-zinc-500">
          No results found.
        </CommandPrimitive.Empty>
        <BrowseGroup />
        {search && <StreamsGroup />}
        {search && <TasksGroup />}
      </CommandPrimitive.List>

      {/* Pages */}
      {page?.type === 'streams' && <StreamsPageView />}
      {page?.type === 'tasks' && <TasksPageView />}
    </CommandMenuShell>
  )
}

// ── Groups ─────────────────────────────────────────────────────────────

function NewGroup() {
  const close = useCommandMenuStore((s) => s.close)
  const router = useRouter()

  return (
    <CommandMenuGroup heading="New">
      <CommandMenuItem
        id="new-task"
        label="New task"
        icon={Plus}
        action="Create"
        iconColor="blue"
        keywords={['new', 'task', 'create', 'add']}
        onSelect={() => {
          router.push('/task/new')
          close()
        }}
      />
      <CommandMenuItem
        id="new-stream"
        label="New stream"
        icon={Hash}
        action="Create"
        iconColor="blue"
        keywords={['new', 'stream', 'create', 'workspace']}
        onSelect={() => {
          window.dispatchEvent(new Event('happyhq:open-create-stream'))
          close()
        }}
      />
    </CommandMenuGroup>
  )
}

function BrowseGroup() {
  const pushPage = useCommandMenuStore((s) => s.pushPage)

  return (
    <CommandMenuGroup heading="Browse">
      <CommandMenuItem
        id="browse-streams"
        label="Streams"
        icon={Waves}
        action="Browse"
        iconColor="ghost"
        keywords={['stream', 'switch', 'open', 'workspace']}
        onSelect={() => pushPage({ type: 'streams' })}
      />
      <CommandMenuItem
        id="browse-tasks"
        label="Tasks"
        icon={ListTodo}
        action="Browse"
        iconColor="ghost"
        keywords={['task', 'todo', 'list', 'work']}
        onSelect={() => pushPage({ type: 'tasks' })}
      />
    </CommandMenuGroup>
  )
}

// ── Page views (full list when drilled in) ─────────────────────────────

function StreamsPageView() {
  return (
    <CommandPrimitive.List className="px-1 py-1">
      <CommandPrimitive.Empty className="py-6 text-center text-sm text-zinc-500">
        No streams found.
      </CommandPrimitive.Empty>
      <StreamsGroup />
    </CommandPrimitive.List>
  )
}

function TasksPageView() {
  return (
    <CommandPrimitive.List className="px-1 py-1">
      <CommandPrimitive.Empty className="py-6 text-center text-sm text-zinc-500">
        No tasks found.
      </CommandPrimitive.Empty>
      <TasksGroup />
    </CommandPrimitive.List>
  )
}
