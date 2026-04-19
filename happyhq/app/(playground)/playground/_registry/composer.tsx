'use client'

import { useState } from 'react'

import { Composer } from '@/components/features/chat/composer'
import type { StagedFile } from '@/stores/chatStore'

import { STAGED_FILES_MULTIPLE } from '../_data/files'
import type { PlaygroundComponent } from './types'

// --- Wrapper component for controlled state ---

interface ComposerVariantData {
  initialText: string
  initialFiles: StagedFile[]
}

function ComposerWrapper({
  data,
  controls,
  log,
}: {
  data: ComposerVariantData
  controls: Record<string, unknown>
  log: (event: string, ...args: unknown[]) => void
}) {
  const compact = controls.compact as boolean
  const [value, setValue] = useState(data.initialText)
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>(
    data.initialFiles,
  )

  return (
    <Composer
      onSubmit={(message, files) => {
        log(
          'onSubmit',
          message,
          files?.map((f) => f.name),
        )
      }}
      value={value}
      onValueChange={setValue}
      stagedFiles={compact ? undefined : stagedFiles}
      onStagedFilesChange={compact ? undefined : setStagedFiles}
      disabled={controls.disabled as boolean}
      placeholder={
        compact ? 'Quick question...' : 'Ask about apple pie recipes...'
      }
      compact={compact}
    />
  )
}

// --- Registration ---

const composerRegistration: PlaygroundComponent = {
  id: 'composer',
  name: 'Composer',
  category: 'Composer',
  canvasWidth: 'lg',
  variants: {
    empty: {
      name: 'Empty',
      data: { initialText: '', initialFiles: [] },
    },
    'with-text': {
      name: 'With Text',
      data: {
        initialText:
          'I want to make an apple pie for Thanksgiving. Can you help me find a recipe that uses Honeycrisp apples and an all-butter crust?',
        initialFiles: [],
      },
    },
    'with-files': {
      name: 'With Files',
      data: {
        initialText: '',
        initialFiles: STAGED_FILES_MULTIPLE,
      },
    },
    disabled: {
      name: 'Disabled',
      data: {
        initialText: 'Processing your apple pie recipe request...',
        initialFiles: [],
      },
    },
  },
  controls: {
    compact: {
      type: 'toggle',
      label: 'Compact',
      default: false,
    },
    disabled: {
      type: 'toggle',
      label: 'Disabled',
      default: false,
    },
  },
  render: ({ data, controls, log }) => (
    <ComposerWrapper
      data={data as ComposerVariantData}
      controls={controls}
      log={log}
    />
  ),
}

export const composerComponents: PlaygroundComponent[] = [composerRegistration]
