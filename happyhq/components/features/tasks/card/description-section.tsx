'use client'

import { ReadOnlyDescription } from '@/components/features/tasks/atoms/readonly-description'
import { writeTaskDescription } from '@/lib/actions'
import { useTaskStore } from '@/stores/taskStore'
import { useEffect, useRef, useState } from 'react'
import { useTaskContentData, useTaskMutate } from '../hooks/use-task-swr'

export function DescriptionSection() {
  const taskSlug = useTaskStore((s) => s.taskSlug)
  return <EditableDescription key={taskSlug} />
}

function EditableDescription() {
  const content = useTaskContentData()
  const hasRun = !!content?.run?.status
  const taskSlug = useTaskStore((s) => s.taskSlug)
  const refresh = useTaskMutate()
  const [isEditing, setIsEditing] = useState(false)

  // Initialize from server data exactly once. The parent remounts this
  // component on taskSlug change (key={taskSlug}), so syncing again after
  // init only ever races user input — a debounced save triggers an SWR
  // refetch, the older snapshot wins, and the controlled value snaps back
  // mid-keystroke (cursor jumps, dropped chars).
  const [description, setDescription] = useState(content?.description ?? '')
  const [initialized, setInitialized] = useState(content != null)

  if (!initialized && content != null) {
    setDescription(content.description ?? '')
    setInitialized(true)
  }

  const descTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Flush pending save on unmount
  useEffect(() => {
    return () => clearTimeout(descTimerRef.current)
  }, [])

  // Place caret at end on the transition into edit mode only.
  // Doing this in the ref callback re-ran on every render and snapped the
  // caret to the end on every keystroke (#265).
  useEffect(() => {
    if (!isEditing) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
  }, [isEditing])

  const handleChange = (value: string) => {
    setDescription(value)
    clearTimeout(descTimerRef.current)
    descTimerRef.current = setTimeout(async () => {
      await writeTaskDescription(taskSlug!, value)
      refresh?.()
    }, 500)
  }

  if (hasRun && description && !isEditing) {
    return (
      <div className="mt-[0.5px] px-4 py-2">
        <div
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return
            setIsEditing(true)
          }}
          className="cursor-text"
        >
          <ReadOnlyDescription description={description} />
        </div>
      </div>
    )
  }

  return (
    <div className="mt-[0.5px] px-4 py-2">
      <textarea
        ref={textareaRef}
        value={description}
        onChange={(e) => {
          if (!isEditing) setIsEditing(true)
          handleChange(e.target.value)
        }}
        onBlur={() => setIsEditing(false)}
        placeholder="Add context..."
        rows={3}
        className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-400"
        style={{
          color: '#424242',
          fontFamily: "'Avenir Next', system-ui, sans-serif",
          lineHeight: 1.65,
        }}
      />
    </div>
  )
}
