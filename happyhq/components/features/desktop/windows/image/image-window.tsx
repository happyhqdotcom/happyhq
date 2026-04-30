'use client'

import { useWindowStore } from '@/stores/windowStore'
import { Loader2 } from 'lucide-react'
import NextImage from 'next/image'
import { useEffect, useState } from 'react'
import type { WindowComponentProps } from '../types'
import { useFrameProps } from '../use-frame-props'
import { WindowFileActions } from '../window-file-actions'
import { WindowFrame } from '../window-frame'

const TITLE_BAR_HEIGHT = 36
const PADDING = 32 // p-4 = 16px * 2
const CHROME = { w: PADDING, h: TITLE_BAR_HEIGHT + PADDING }
const MAX_WIDTH = 800
const MAX_HEIGHT = 700
const MIN_WIDTH = 200
const MIN_HEIGHT = 160

export function ImageWindow({ id, canvasRef }: WindowComponentProps) {
  const result = useFrameProps(id, canvasRef)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [error, setError] = useState(false)

  const w = result?.window
  const filePath = w?.contentType === 'image' ? w.meta.filePath : undefined
  const src = filePath
    ? `/api/fs/download?path=${encodeURIComponent(filePath)}`
    : undefined

  // Preload to measure natural dimensions, then resize the window to fit.
  // We preload via the browser Image constructor so next/image can be rendered
  // with explicit width/height (required for non-fill usage).
  useEffect(() => {
    if (!src) return
    const probe = new window.Image()
    probe.onload = () => {
      const { naturalWidth, naturalHeight } = probe
      if (!naturalWidth || !naturalHeight) return
      setNatural({ w: naturalWidth, h: naturalHeight })

      const maxContentW = MAX_WIDTH - CHROME.w
      const maxContentH = MAX_HEIGHT - CHROME.h
      const scale = Math.min(
        1,
        maxContentW / naturalWidth,
        maxContentH / naturalHeight,
      )
      const targetW = Math.max(
        MIN_WIDTH,
        Math.round(naturalWidth * scale) + CHROME.w,
      )
      const targetH = Math.max(
        MIN_HEIGHT,
        Math.round(naturalHeight * scale) + CHROME.h,
      )
      useWindowStore.getState().resizeWindow(id, {
        width: targetW,
        height: targetH,
      })
    }
    probe.onerror = () => setError(true)
    probe.src = src
  }, [src, id])

  if (!result) return null
  const { frameProps } = result
  if (!w || w.contentType !== 'image') return null

  return (
    <WindowFrame
      title={w.title}
      {...frameProps}
      actions={<WindowFileActions filePath={w.meta.filePath} />}
    >
      <div className="flex h-full items-center justify-center overflow-hidden bg-zinc-100 p-4">
        {!natural && !error && (
          <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
        )}
        {error && <p className="text-sm text-zinc-400">Failed to load image</p>}
        {src && natural && (
          <NextImage
            src={src}
            alt={w.title}
            width={natural.w}
            height={natural.h}
            unoptimized
            className="max-h-full max-w-full object-contain"
            style={{ width: 'auto', height: 'auto' }}
            draggable={false}
          />
        )}
      </div>
    </WindowFrame>
  )
}
