// Web Sources Page
// List of web actions to select from

'use client'

import { Command as CommandPrimitive } from 'cmdk'
import { Bookmark, Camera, FileText, Search, Video } from 'lucide-react'
import { CommandMenuItem } from '../atoms'
import { Page } from '../types'

interface WebSourcesPageProps {
  onPushPage: (page: Page) => void
}

export function WebSourcesPage({ onPushPage }: WebSourcesPageProps) {
  return (
    <CommandPrimitive.List className="h-full px-1 py-1">
      <CommandPrimitive.Empty className="py-6 text-center text-sm text-zinc-500">
        No results found.
      </CommandPrimitive.Empty>

      <CommandMenuItem
        id="save-link"
        label="Save link"
        icon={Bookmark}
        action="Paste a URL"
        iconColor="blue"
        keywords={['save', 'link', 'bookmark', 'url', 'quick']}
        onSelect={() =>
          onPushPage({
            type: 'url-input',
            source: 'save-link',
            label: 'Save link',
          })
        }
      />
      <CommandMenuItem
        id="read-page"
        label="Read page"
        icon={FileText}
        action="Paste a URL"
        iconColor="blue"
        keywords={['read', 'article', 'page', 'summarize', 'extract']}
        onSelect={() =>
          onPushPage({
            type: 'url-input',
            source: 'read-page',
            label: 'Read page',
          })
        }
      />
      <CommandMenuItem
        id="watch-video"
        label="Watch video"
        icon={Video}
        action="Paste a URL"
        iconColor="blue"
        keywords={['watch', 'video', 'transcribe', 'vimeo', 'mp4']}
        onSelect={() =>
          onPushPage({
            type: 'url-input',
            source: 'watch-video',
            label: 'Watch video',
          })
        }
      />
      <CommandMenuItem
        id="screenshot-page"
        label="Screenshot page"
        icon={Camera}
        action="Paste a URL"
        iconColor="blue"
        keywords={['screenshot', 'capture', 'snapshot', 'page', 'archive']}
        onSelect={() =>
          onPushPage({
            type: 'url-input',
            source: 'screenshot-page',
            label: 'Screenshot page',
          })
        }
      />
      <CommandMenuItem
        id="research-topic"
        label="Research topic"
        icon={Search}
        action="Enter a topic"
        iconColor="blue"
        keywords={['research', 'topic', 'search', 'find', 'sources', 'learn']}
        onSelect={() =>
          onPushPage({
            type: 'url-input',
            source: 'research-topic',
            label: 'Research topic',
          })
        }
      />
    </CommandPrimitive.List>
  )
}
