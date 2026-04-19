'use client'

import { ConnectedActivityDebugContent } from '../../island/activity-debug-panel'
import type { WindowComponentProps } from '../types'
import { useFrameProps } from '../use-frame-props'
import { WindowFrame } from '../window-frame'

export function ActivityDebugWindow({ id, canvasRef }: WindowComponentProps) {
  const result = useFrameProps(id, canvasRef)
  if (!result) return null

  const { frameProps, window: w } = result

  return (
    <WindowFrame title={w.title} {...frameProps}>
      <ConnectedActivityDebugContent />
    </WindowFrame>
  )
}
