import { useEffect, useRef, useState } from 'react'

/**
 * Returns true briefly when `lastUpdatedAt` changes (after mount),
 * driving a CSS transition pulse on a host element.
 *
 * During rapid updates the flag stays true — it only clears 100ms
 * after the last change, letting a `duration-700` transition fade back.
 */
export function useUpdatePulse(lastUpdatedAt: number | undefined): boolean {
  const [highlighted, setHighlighted] = useState(false)
  const mountedValueRef = useRef(lastUpdatedAt)

  useEffect(() => {
    // Skip the initial value present at mount
    if (lastUpdatedAt == null || lastUpdatedAt === mountedValueRef.current)
      return

    setHighlighted(true)
    const timer = setTimeout(() => setHighlighted(false), 100)
    return () => clearTimeout(timer)
  }, [lastUpdatedAt])

  return highlighted
}
