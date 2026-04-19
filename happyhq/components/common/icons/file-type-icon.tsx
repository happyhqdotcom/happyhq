'use client'

const FILE_TYPES: Record<string, { bg: string; text: string; label: string }> =
  {
    // Documents
    pdf: { bg: '#F9D4D4', text: '#A32D2D', label: 'PDF' },
    doc: { bg: '#CEE3F7', text: '#185FA5', label: 'DOC' },
    docx: { bg: '#CEE3F7', text: '#185FA5', label: 'DOC' },
    txt: { bg: '#E5E3D9', text: '#5F5E5A', label: 'TXT' },
    md: { bg: '#DDDCFD', text: '#534AB7', label: 'MD' },
    rtf: { bg: '#E5E3D9', text: '#5F5E5A', label: 'RTF' },
    // Spreadsheets
    csv: { bg: '#D8EABC', text: '#3B6D11', label: 'CSV' },
    xls: { bg: '#C5EDDE', text: '#0F6E56', label: 'XLS' },
    xlsx: { bg: '#C5EDDE', text: '#0F6E56', label: 'XLS' },
    // Presentations
    ppt: { bg: '#F5DDB5', text: '#854F0B', label: 'PPT' },
    pptx: { bg: '#F5DDB5', text: '#854F0B', label: 'PPT' },
    // Images
    png: { bg: '#E8D5F5', text: '#7C3ABA', label: 'PNG' },
    jpg: { bg: '#E8D5F5', text: '#7C3ABA', label: 'JPG' },
    jpeg: { bg: '#E8D5F5', text: '#7C3ABA', label: 'JPG' },
    gif: { bg: '#E8D5F5', text: '#7C3ABA', label: 'GIF' },
    webp: { bg: '#E8D5F5', text: '#7C3ABA', label: 'WEBP' },
    svg: { bg: '#E8D5F5', text: '#7C3ABA', label: 'SVG' },
    // Data
    json: { bg: '#DDDCFD', text: '#534AB7', label: 'JSON' },
    xml: { bg: '#DDDCFD', text: '#534AB7', label: 'XML' },
    yaml: { bg: '#DDDCFD', text: '#534AB7', label: 'YAML' },
    yml: { bg: '#DDDCFD', text: '#534AB7', label: 'YAML' },
    // Email / web
    eml: { bg: '#F5D8CE', text: '#993C1D', label: '@' },
    www: { bg: '#CEE3F7', text: '#185FA5', label: 'WWW' },
    // Archives
    zip: { bg: '#E5E3D9', text: '#5F5E5A', label: 'ZIP' },
  }

const DEFAULT_TYPE = { bg: '#E5E3D9', text: '#5F5E5A', label: '...' }

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

interface FileTypeIconProps {
  filename: string
  size?: number
  className?: string
}

export function FileTypeIcon({
  filename,
  size = 16,
  className,
}: FileTypeIconProps) {
  const ext = getExtension(filename)
  const type = FILE_TYPES[ext] ?? DEFAULT_TYPE

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded ${className ?? ''}`}
      style={{
        width: size + 2,
        height: size + 2,
        backgroundColor: type.bg,
        fontFamily: 'ui-monospace, monospace',
        fontSize:
          type.label.length > 3 ? '6px' : type.label === '@' ? '9px' : '7px',
        fontWeight: 700,
        color: type.text,
        letterSpacing: '0.2px',
        lineHeight: 1,
      }}
    >
      {type.label}
    </span>
  )
}
