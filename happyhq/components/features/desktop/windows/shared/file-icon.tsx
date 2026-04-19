import { PDFIcon } from '@/components/common/icons/pdf'
import { WordIcon } from '@/components/common/icons/word'
import { AtSign, FileText, ImageIcon } from 'lucide-react'

export function getFileType(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'pdf' as const
  if (ext === 'eml') return 'email' as const
  if (ext === 'docx') return 'docx' as const
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext ?? ''))
    return 'image' as const
  return 'file' as const
}

const FILE_TYPE_STYLES = {
  pdf: { bg: 'bg-red-500/10', color: 'text-red-600' },
  email: { bg: 'bg-blue-500/10', color: 'text-blue-600' },
  docx: { bg: 'bg-blue-800/10', color: 'text-blue-800' },
  image: { bg: 'bg-purple-500/10', color: 'text-purple-500' },
  file: { bg: 'bg-zinc-400/10', color: 'text-zinc-400' },
} as const

export function FileIcon({ filename }: { filename: string }) {
  const type = getFileType(filename)
  const style = FILE_TYPE_STYLES[type]
  return (
    <div
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${style.bg}`}
    >
      {type === 'pdf' ? (
        <PDFIcon size={12} className={style.color} />
      ) : type === 'email' ? (
        <AtSign className={`h-3 w-3 ${style.color}`} />
      ) : type === 'docx' ? (
        <WordIcon size={12} className={style.color} />
      ) : type === 'image' ? (
        <ImageIcon className={`h-3 w-3 ${style.color}`} />
      ) : (
        <FileText className={`h-3 w-3 ${style.color}`} />
      )}
    </div>
  )
}
