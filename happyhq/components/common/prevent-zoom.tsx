'use client'

import { useEffect } from 'react'

export function PreventZoom() {
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      if (e.ctrlKey) {
        e.preventDefault()
      }
    }

    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [])

  return null
}
