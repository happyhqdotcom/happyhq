// URL Input Page
// Input for URLs (save link, read page, watch video) and topics (research)

'use client'

import type { UnfurlResult } from '@/lib/actions/unfurl'
import { unfurlUrl } from '@/lib/actions/unfurl'
import {
  Bookmark,
  ClipboardPaste,
  FileText,
  Keyboard,
  Link2,
  Loader2,
  Search,
  Video,
} from 'lucide-react'
import Image from 'next/image'
import { useEffect, useState, useTransition } from 'react'

// Action state exposed to parent for header button
export type UrlInputAction =
  | { type: 'disabled' } // No valid input
  | { type: 'preview'; onAction: () => void } // Ready to preview URL
  | { type: 'loading' } // Currently fetching preview
  | { type: 'submit'; onAction: () => void } // Ready to submit

interface UrlInputPageProps {
  source: string
  search: string
  onSubmit: (url: string, unfurl: UnfurlResult | null) => void
  onActionChange?: (action: UrlInputAction) => void
}

interface SourceConfig {
  icon: typeof Link2
  title: string
  description: string
  examples: string[]
}

const SOURCE_CONFIGS: Record<string, SourceConfig> = {
  'save-link': {
    icon: Bookmark,
    title: 'Save a link',
    description:
      "Bookmark a URL to your collection. We'll save the link and basic metadata for quick reference.",
    examples: [
      'Articles to read later',
      'Reference documentation',
      'Bookmarks',
    ],
  },
  'read-page': {
    icon: FileText,
    title: 'Read a page',
    description:
      'Extract and save the main content from a webpage. Works best with articles, blog posts, and documentation.',
    examples: ['News articles', 'Blog posts', 'Documentation pages'],
  },
  'watch-video': {
    icon: Video,
    title: 'Watch a video',
    description:
      "Extract content from a video URL. We'll pull metadata and transcripts when available.",
    examples: ['Vimeo videos', 'MP4 links', 'Video content'],
  },
  'research-topic': {
    icon: Search,
    title: 'Research a topic',
    description:
      "Search the web and compile sources on a topic. We'll find relevant articles and summarize key findings.",
    examples: ['Industry trends', 'Technical concepts', 'Competitive research'],
  },
}

/**
 * Check if a string looks like a URL
 */
function isValidUrl(str: string): boolean {
  if (!str.trim()) return false
  try {
    const urlStr = str.match(/^https?:\/\//) ? str : `https://${str}`
    const url = new URL(urlStr)
    return url.hostname.includes('.')
  } catch {
    return false
  }
}

/**
 * Extract domain from URL for display
 */
function getDomain(url: string): string {
  try {
    const urlStr = url.match(/^https?:\/\//) ? url : `https://${url}`
    return new URL(urlStr).hostname
  } catch {
    return ''
  }
}

export function UrlInputPage({
  source,
  search,
  onSubmit,
  onActionChange,
}: UrlInputPageProps) {
  const isTopicInput = source === 'research-topic'
  const hasInput = search.trim().length > 0
  const isValid = isTopicInput ? hasInput : isValidUrl(search)

  const [unfurlData, setUnfurlData] = useState<UnfurlResult | null>(null)
  const [unfurlError, setUnfurlError] = useState(false)
  const [hasPreviewed, setHasPreviewed] = useState(false)
  const [isPending, startTransition] = useTransition()

  const config = SOURCE_CONFIGS[source] || SOURCE_CONFIGS['save-link']
  const Icon = config.icon

  // Reset preview state when search changes
  useEffect(() => {
    setUnfurlData(null)
    setUnfurlError(false)
    setHasPreviewed(false)
  }, [search])

  // Fetch unfurl data
  const fetchPreview = () => {
    if (!isTopicInput && isValid && !hasPreviewed) {
      const url = search.trim()
      setHasPreviewed(true)

      startTransition(async () => {
        const result = await unfurlUrl(url)
        if (result.success) {
          setUnfurlData(result)
        } else {
          setUnfurlError(true)
        }
      })
    }
  }

  // Submit the current value with unfurl data
  const handleSubmit = () => {
    if (isValid) {
      onSubmit(search, unfurlData)
    }
  }

  // Notify parent of action state changes
  useEffect(() => {
    if (!onActionChange) return

    // For topics: just submit when valid
    if (isTopicInput) {
      if (!isValid) {
        onActionChange({ type: 'disabled' })
      } else {
        onActionChange({ type: 'submit', onAction: handleSubmit })
      }
      return
    }

    // For URLs: preview → loading → submit flow
    if (!isValid) {
      onActionChange({ type: 'disabled' })
    } else if (!hasPreviewed) {
      onActionChange({ type: 'preview', onAction: fetchPreview })
    } else if (isPending) {
      onActionChange({ type: 'loading' })
    } else {
      onActionChange({ type: 'submit', onAction: handleSubmit })
    }
  }, [isTopicInput, isValid, hasPreviewed, isPending, search])

  // Topic input view
  if (isTopicInput) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        {hasInput ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-blue-100">
              <Search className="size-6 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-zinc-900">
              Research: {search}
            </p>
          </div>
        ) : (
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-blue-100">
              <Search className="size-6 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-zinc-900">{config.title}</p>
            <p className="mt-2 text-sm text-zinc-500">{config.description}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {config.examples.map((example) => (
                <span
                  key={example}
                  className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600"
                >
                  {example}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Determine card state
  const isEmpty = !hasInput
  const isReady = hasInput && isValid && !hasPreviewed
  const isLoading = hasPreviewed && isPending && !unfurlData && !unfurlError
  const isLoaded = hasPreviewed && unfurlData
  const isError = hasPreviewed && unfurlError && !isPending
  const isInvalid = hasInput && !isValid

  // Empty/Ready/Invalid: show centered message
  if (isEmpty || isReady || isInvalid) {
    return (
      <div className="grid h-full grid-rows-[4fr_auto_5fr]">
        <div />
        <div className="text-center text-sm text-zinc-500/80 select-none">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1">
                Paste
                <ClipboardPaste className="size-3.5 rotate-6 text-violet-400" />
              </span>
              <span>or</span>
              <span className="inline-flex items-center gap-1.5">
                type
                <Keyboard className="size-3.5 -rotate-6 text-blue-400" />
                <span>above</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-400">
              <span>and press</span>
              <span className="inline-flex items-center justify-center rounded-sm border border-zinc-300/80 bg-linear-to-b from-white to-zinc-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-600 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_1px_0_0_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.9)]">
                enter
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Loading/Loaded/Error: show unfurl card
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Unfurl preview card */}
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {/* Image area */}
          <div
            className={`relative aspect-2/1 w-full overflow-hidden ${
              isLoaded && unfurlData?.image ? 'bg-zinc-100' : 'bg-zinc-100/50'
            }`}
          >
            {isLoaded && unfurlData?.image && (
              <Image
                src={unfurlData.image}
                alt=""
                fill
                unoptimized
                sizes="320px"
                className="object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            )}

            {(isLoading || isError || (isLoaded && !unfurlData?.image)) && (
              <div className="flex h-full items-center justify-center">
                {isLoading ? (
                  <Loader2 className="size-5 animate-spin text-zinc-300" />
                ) : (
                  <Icon className="size-8 text-zinc-300" />
                )}
              </div>
            )}
          </div>

          {/* Content area */}
          <div className="space-y-1 p-3">
            {isLoading && (
              <>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 size-4 shrink-0 animate-pulse rounded bg-zinc-300" />
                  <div className="h-5 w-40 animate-pulse rounded bg-zinc-300" />
                </div>
                <div className="h-4 w-full animate-pulse rounded bg-zinc-200" />
                <div className="h-4 w-24 animate-pulse rounded bg-zinc-200" />
              </>
            )}

            {isLoaded && (
              <>
                <div className="flex items-start gap-2">
                  {unfurlData.favicon && (
                    <Image
                      src={unfurlData.favicon}
                      alt=""
                      width={16}
                      height={16}
                      unoptimized
                      className="mt-0.5 size-4 shrink-0 rounded"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                  <p className="line-clamp-2 text-sm font-medium text-zinc-900">
                    {unfurlData.title || getDomain(search)}
                  </p>
                </div>
                {unfurlData.description && (
                  <p className="line-clamp-2 text-xs text-zinc-500">
                    {unfurlData.description}
                  </p>
                )}
                <p className="text-xs text-zinc-400">{getDomain(search)}</p>
              </>
            )}

            {isError && (
              <>
                <p className="text-sm font-medium text-zinc-900">
                  {getDomain(search)}
                </p>
                <p className="text-xs text-zinc-400">
                  Couldn&apos;t load preview
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
