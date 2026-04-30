'use client'

import {
  useActiveTask,
  useTaskContent,
  useTaskStatus,
} from '@/components/features/desktop/hooks/use-desktop-data'
import { useDesktopStore } from '@/stores/desktopStore'
import { Circle } from 'lucide-react'
import Image from 'next/image'

export function TaskSetupChecklist() {
  const taskStatus = useTaskStatus()
  const taskContent = useTaskContent()
  const activeTask = useActiveTask()
  const setFocusTarget = useDesktopStore((s) => s.setTaskFocusTarget)

  // Don't render if task has already been started
  if (taskStatus !== null) return null

  const hasTitle = !!(activeTask?.frontmatter.title ?? '').trim()
  const visibleInputs =
    taskContent?.inputs?.filter((i) => i.name !== 'context') ?? []
  const hasContext =
    !!(taskContent?.description ?? '').trim() || visibleInputs.length > 0
  const hasStream = !!activeTask?.frontmatter.stream

  const steps = [
    {
      label: 'Name your task',
      checked: hasTitle,
      target: 'title' as const,
    },
    {
      label: 'Add some context',
      checked: hasContext,
      target: 'description' as const,
    },
    {
      label: 'Assign to a stream',
      checked: hasStream,
      target: 'sidebar' as const,
    },
  ]

  return (
    <div
      className="flex flex-col items-start gap-3.5 rounded-2xl px-8 py-7"
      style={{
        backgroundColor: 'color-mix(in oklch, var(--background) 95%, black)',
        boxShadow:
          '0 0 50px 25px color-mix(in oklch, var(--background) 95%, black)',
      }}
    >
      <Image
        src="/brand/q.svg"
        alt="Q"
        width={28}
        height={28}
        className="mb-1 self-center"
      />
      {steps.map((step) => (
        <button
          key={step.target}
          type="button"
          onClick={() => setFocusTarget(step.target)}
          className="group flex items-center gap-3"
        >
          {step.checked ? (
            <svg
              className="h-[18px] w-[18px] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                fill="rgb(0 0 0 / 0.25)"
                stroke="rgb(0 0 0 / 0.25)"
                strokeWidth="2"
              />
              <path
                d="m9 12 2 2 4-4"
                stroke="color-mix(in oklch, var(--background) 95%, black)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <Circle className="h-[18px] w-[18px] text-black/25" />
          )}
          <span
            className={`text-[15px] transition-colors ${
              step.checked
                ? 'text-black/25 line-through decoration-black/20 decoration-2'
                : 'font-medium text-black/60 group-hover:text-black/80'
            }`}
          >
            {step.label}
          </span>
        </button>
      ))}
    </div>
  )
}
