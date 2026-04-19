'use client'

import { Loader2 } from 'lucide-react'
import { memo, useMemo } from 'react'

interface CsvWindowContentProps {
  csv: string
  loading?: boolean
}

/** Parse a CSV string into a header row and data rows. Handles quoted fields. */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split('\n')
  if (lines.length === 0) return { headers: [], rows: [] }

  const parseLine = (line: string): string[] => {
    const fields: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else if (ch === '"') {
          inQuotes = false
        } else {
          current += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ',') {
          fields.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
    }
    fields.push(current.trim())
    return fields
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)

  return { headers, rows }
}

export const CsvWindowContent = memo(function CsvWindowContent({
  csv,
  loading,
}: CsvWindowContentProps) {
  const { headers, rows } = useMemo(() => parseCsv(csv || ''), [csv])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-black/30" />
      </div>
    )
  }

  if (!csv || headers.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <p className="text-sm font-medium text-zinc-400">No content yet</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto overscroll-none">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-zinc-200 bg-zinc-50">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-medium whitespace-nowrap text-zinc-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-zinc-100 hover:bg-zinc-50/50"
            >
              {headers.map((_, ci) => (
                <td
                  key={ci}
                  className="max-w-[280px] truncate px-3 py-1.5 text-zinc-700"
                  title={row[ci] ?? ''}
                >
                  {row[ci] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
