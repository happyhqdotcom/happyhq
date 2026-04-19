'use client'

import { FileCard } from '@/components/features/chat/file-card'
import { FilePill } from '@/components/features/chat/messages/file-pill'
import type { StagedFile } from '@/stores/chatStore'

import {
  FILENAME_CSV,
  FILENAME_DOCX,
  FILENAME_EML,
  FILENAME_PDF,
  FILENAME_UNKNOWN,
  FILENAME_XLSX,
  FILENAMES_MULTIPLE,
  STAGED_FILE_DOCX,
  STAGED_FILE_EMAIL,
  STAGED_FILE_PDF,
  STAGED_FILES_MULTIPLE,
} from '../_data/files'
import type { PlaygroundComponent } from './types'

// ---------------------------------------------------------------------------
// Staged File Card (composer context)
// ---------------------------------------------------------------------------

const stagedFileCardRegistration: PlaygroundComponent = {
  id: 'attachments/staged',
  name: 'Composer Upload',
  category: 'Attachments',
  variants: {
    pdf: { name: 'PDF', data: [STAGED_FILE_PDF] },
    docx: { name: 'Word', data: [STAGED_FILE_DOCX] },
    email: { name: 'Email', data: [STAGED_FILE_EMAIL] },
    multiple: { name: 'Multiple', data: STAGED_FILES_MULTIPLE },
  },
  render: ({ data, log }) => {
    const files = data as StagedFile[]
    return (
      <div className="flex flex-wrap justify-center gap-2">
        {files.map((staged) => (
          <FileCard
            key={staged.id}
            staged={staged}
            onRemove={(id) => log('onRemove', id)}
          />
        ))}
      </div>
    )
  },
}

// ---------------------------------------------------------------------------
// Message File Pill (sent message context)
// ---------------------------------------------------------------------------

const messageFilePillRegistration: PlaygroundComponent = {
  id: 'attachments/message',
  name: 'Chat Upload',
  category: 'Attachments',
  variants: {
    pdf: { name: 'PDF', data: [FILENAME_PDF] },
    docx: { name: 'Word', data: [FILENAME_DOCX] },
    email: { name: 'Email', data: [FILENAME_EML] },
    excel: { name: 'Excel', data: [FILENAME_XLSX] },
    csv: { name: 'CSV', data: [FILENAME_CSV] },
    unknown: { name: 'Unknown Type', data: [FILENAME_UNKNOWN] },
    multiple: { name: 'Multiple', data: FILENAMES_MULTIPLE },
  },
  render: ({ data }) => {
    const filenames = data as string[]
    return (
      <div className="flex flex-wrap justify-center gap-1.5">
        {filenames.map((filename) => (
          <FilePill key={filename} filename={filename} />
        ))}
      </div>
    )
  },
}

export const attachmentComponents: PlaygroundComponent[] = [
  stagedFileCardRegistration,
  messageFilePillRegistration,
]
