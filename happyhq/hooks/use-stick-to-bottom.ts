'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const BOTTOM_THRESHOLD = 50

interface UseStickToBottomReturn {
  scrollRef: React.RefCallback<HTMLDivElement>
  contentRef: React.RefCallback<HTMLDivElement>
  isAtBottom: boolean
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

export function useStickToBottom(): UseStickToBottomReturn {
  // Store actual DOM elements in state so effects re-run when they mount/unmount
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAtBottomRef = useRef(true)

  // Stable callback refs — React calls these when the DOM node mounts/unmounts
  const scrollRef = useCallback(
    (el: HTMLDivElement | null) => setScrollEl(el),
    [],
  )
  // contentRef is exposed for callers that attach it to their content div, but
  // the hook itself observes scrollEl rather than the content node.
  const contentRef = useCallback((_el: HTMLDivElement | null) => {}, [])

  // Imperative scroll — for chat switches, initial load, or a future button
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (!scrollEl) return
      if (scrollEl.scrollTo) {
        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior })
      } else {
        scrollEl.scrollTop = scrollEl.scrollHeight
      }
      isAtBottomRef.current = true
      setIsAtBottom(true)
    },
    [scrollEl],
  )

  // Track whether the user is near the bottom via scroll events
  useEffect(() => {
    if (!scrollEl) return

    function handleScroll() {
      const atBottom =
        scrollEl!.scrollHeight - scrollEl!.scrollTop - scrollEl!.clientHeight <
        BOTTOM_THRESHOLD
      if (atBottom !== isAtBottomRef.current) {
        isAtBottomRef.current = atBottom
        setIsAtBottom(atBottom)
      }
    }

    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [scrollEl])

  // Auto-scroll on any DOM mutation within the scroll container.
  // MutationObserver catches everything ResizeObserver misses: streaming
  // text, async markdown rendering, emoji loads, component swaps
  // (e.g. Composer → QuestionOptions).
  useEffect(() => {
    if (!scrollEl) return

    const observer = new MutationObserver(() => {
      if (!isAtBottomRef.current) return
      scrollEl.scrollTop = scrollEl.scrollHeight
    })

    observer.observe(scrollEl, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    return () => observer.disconnect()
  }, [scrollEl])

  return { scrollRef, contentRef, isAtBottom, scrollToBottom }
}
