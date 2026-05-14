'use client'

import { displayTitle } from '@/lib/format'
import type { TaskItem } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { taskItemsKey } from '@/lib/swr-keys'
import { useCommandMenuStore } from '@/stores/commandMenuStore'
import {
  getRecentUrl,
  type RecentItem,
  useRecentsStore,
} from '@/stores/recentsStore'
import { useStreams } from '@/stores/streamsStore'
import { FolderOpen, Hash, ListTodo, Plus, Waves } from 'lucide-react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'

export function QuickOpen() {
  const router = useRouter()
  const { data: tasks = [] } = useSWR<TaskItem[]>(taskItemsKey(), fetcher)
  const openQuickOpen = useCommandMenuStore((s) => s.openQuickOpen)
  const recents = useRecentsStore((s) => s.recents)

  // ── Derived: needs attention ──────────────────────────────────────────
  const attentionTasks = tasks.filter(
    (t) =>
      !t.frontmatter.completedAt &&
      (t.run?.status === 'plan_ready' ||
        t.run?.status === 'completed' ||
        t.frontmatter.pending),
  )

  return (
    <div className="flex w-full max-w-md flex-col gap-6 px-4">
      {/* ── Action buttons ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <ActionButton
          icon={<FolderOpen className="size-[18px]" />}
          label="Quick Open"
          onClick={openQuickOpen}
        />
        <ActionButton
          icon={<Hash className="size-[18px]" />}
          label="New Stream"
          onClick={() =>
            window.dispatchEvent(new Event('happyhq:open-create-stream'))
          }
        />
        <ActionButton
          icon={
            <span className="flex size-[18px] items-center justify-center rounded-full bg-black/10">
              <Plus className="size-3.5 text-black/50" strokeWidth={2.5} />
            </span>
          }
          label="New Task"
          onClick={() => router.push('/task/new')}
        />
      </div>

      {/* ── Needs Attention ────────────────────────────────────────── */}
      {attentionTasks.length > 0 && (
        <div className="flex flex-col">
          <SectionHeader label="Needs Attention" />
          <div className="flex flex-col">
            {attentionTasks.map((task) => (
              <TaskRow key={task.slug} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* ── Recents ────────────────────────────────────────────────── */}
      {recents.length > 0 && (
        <div className="flex flex-col">
          <SectionHeader label="Recents" />
          <div className="flex flex-col">
            {recents.slice(0, 6).map((item) => (
              <RecentRow key={`${item.type}-${item.slug}`} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg bg-black/4 px-4 py-3 transition-colors hover:bg-black/[0.07]"
    >
      <span className="text-black/35">{icon}</span>
      <span className="text-xs font-medium text-black/45">{label}</span>
    </button>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h3 className="px-3 pb-1.5 text-xs font-medium tracking-wider text-black/30 uppercase">
      {label}
    </h3>
  )
}

function RecentRow({ item }: { item: RecentItem }) {
  const router = useRouter()
  const streams = useStreams()

  const streamTitle = item.streamSlug
    ? (streams.find((s) => s.name === item.streamSlug)?.title ?? null)
    : null

  return (
    <button
      onClick={() => router.push(getRecentUrl(item))}
      className="flex h-7 items-center gap-1.5 rounded px-3 text-left transition-colors hover:bg-black/4"
    >
      {item.type === 'stream' ? (
        <Waves className="size-3.5 shrink-0 text-black/25" />
      ) : (
        <ListTodo className="size-3.5 shrink-0 text-black/25" />
      )}
      <span className="truncate text-xs font-medium text-black/60">
        {item.title}
      </span>
      <div className="flex-1" />
      {item.type === 'task' && item.streamSlug && (
        <span className="shrink-0 text-xs text-black/20">
          {displayTitle(streamTitle, item.streamSlug)}
        </span>
      )}
      {item.type === 'stream' && (
        <span className="shrink-0 text-xs text-black/20">Stream</span>
      )}
    </button>
  )
}

function TaskRow({ task }: { task: TaskItem }) {
  const router = useRouter()
  const streams = useStreams()
  const streamSlug = task.frontmatter.stream ?? null
  const streamTitle = streamSlug
    ? (streams.find((s) => s.name === streamSlug)?.title ?? null)
    : null

  function handleClick() {
    if (streamSlug) {
      router.push(
        `/${encodeURIComponent(streamSlug)}/${encodeURIComponent(task.slug)}`,
      )
    } else {
      router.push(`/task/${encodeURIComponent(task.slug)}`)
    }
  }

  return (
    <button
      onClick={handleClick}
      className="flex h-7 items-center gap-1.5 rounded px-3 text-left transition-colors hover:bg-black/4"
    >
      <span className="truncate text-xs font-medium text-black/60">
        {displayTitle(task.frontmatter.title, task.slug)}
      </span>
      <div className="flex-1" />
      {streamSlug && (
        <span className="shrink-0 text-xs text-black/20">
          {displayTitle(streamTitle, streamSlug)}
        </span>
      )}
    </button>
  )
}
