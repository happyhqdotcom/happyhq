import type { KeyboardEvent, RefObject } from 'react'

/**
 * Arrow-key navigation between sibling [data-sidebar="menu-button"] elements
 * within a container ref. Stops at boundaries (no wrapping).
 */
export function navigateSiblingButtons(
  e: KeyboardEvent<HTMLButtonElement>,
  containerRef: RefObject<HTMLElement | null>,
) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

  const container = containerRef.current
  if (!container) return

  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      '[data-sidebar="menu-button"]',
    ),
  )
  const idx = buttons.indexOf(e.currentTarget)
  if (idx === -1) return

  const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1
  if (next >= 0 && next < buttons.length) {
    e.preventDefault()
    buttons[next].focus()
  }
}
