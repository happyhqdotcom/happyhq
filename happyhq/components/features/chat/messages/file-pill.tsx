import { PDFIcon, WordIcon } from '@/components/common/icons'
import { FileSpreadsheet, FileText, Mail } from 'lucide-react'

function getFileInfo(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf')
    return { color: 'bg-[#ad2824]', label: 'PDF', icon: PDFIcon }
  if (ext === 'docx' || ext === 'doc')
    return { color: 'bg-blue-800', label: 'Word', icon: WordIcon }
  if (ext === 'eml') return { color: 'bg-blue-600', label: 'Email', icon: Mail }
  if (['xls', 'xlsx'].includes(ext))
    return { color: 'bg-green-700', label: 'Excel', icon: FileSpreadsheet }
  if (ext === 'csv')
    return {
      color: 'bg-green-700',
      label: 'Spreadsheet',
      icon: FileSpreadsheet,
    }
  return { color: 'bg-zinc-500', label: 'File', icon: FileText }
}

export function FilePill({ filename }: { filename: string }) {
  const { color, label, icon: Icon } = getFileInfo(filename)

  return (
    <div className="flex items-center rounded-xl bg-white px-2.5 py-2 ring-1 ring-zinc-950/5">
      <div
        className={`mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${color}`}
      >
        <Icon size={12} className="text-white" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium text-zinc-900">
          {filename}
        </span>
        <span className="text-[11px] leading-tight text-zinc-400">{label}</span>
      </div>
    </div>
  )
}
