'use client'

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
  MD_CODE_BLOCKS,
  MD_EDGE_CASES,
  MD_HEADINGS,
  MD_INLINE,
  MD_KITCHEN_SINK,
  MD_LISTS,
  MD_TABLES,
} from '../_data/markdown'
import type { PlaygroundComponent } from './types'

const markdownRegistration: PlaygroundComponent = {
  id: 'markdown/stress-test',
  name: 'Markdown Rendering',
  category: 'Markdown',
  canvasWidth: 'md',
  variants: {
    headings: { name: 'Headings', data: MD_HEADINGS },
    inline: { name: 'Inline Formatting', data: MD_INLINE },
    'code-blocks': { name: 'Code Blocks', data: MD_CODE_BLOCKS },
    tables: { name: 'Tables', data: MD_TABLES },
    lists: { name: 'Lists', data: MD_LISTS },
    'edge-cases': { name: 'Edge Cases', data: MD_EDGE_CASES },
    'kitchen-sink': { name: 'Kitchen Sink', data: MD_KITCHEN_SINK },
  },
  render: ({ data }) => (
    <div className="prose prose-slate prose-p:my-2 prose-p:leading-[1.65] max-w-none text-[15px]">
      <Markdown remarkPlugins={[remarkGfm]}>{data as string}</Markdown>
    </div>
  ),
}

export const markdownComponents: PlaygroundComponent[] = [markdownRegistration]
