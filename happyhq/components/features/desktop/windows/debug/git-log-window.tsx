'use client'

import { GitLogContent } from '../git-log-content'
import type { WindowComponentProps } from '../types'
import { useFrameProps } from '../use-frame-props'
import { WindowFrame } from '../window-frame'

export function GitLogWindow({ id, canvasRef }: WindowComponentProps) {
  const result = useFrameProps(id, canvasRef)
  if (!result) return null

  const { frameProps, window: w } = result

  return (
    <WindowFrame title={w.title} {...frameProps}>
      <GitLogContent />
    </WindowFrame>
  )
}
