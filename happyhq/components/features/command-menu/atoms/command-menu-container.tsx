// Command Menu Container
// Glass morphism container centered on screen

'use client'

import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'
import { ReactNode, useEffect, useRef } from 'react'

interface CommandMenuContainerProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}

export function CommandMenuContainer({
  isOpen,
  onClose,
  children,
}: CommandMenuContainerProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - also serves as centering container */}
          <motion.div
            className="fixed inset-0 z-50 grid grid-rows-[1fr_auto_2fr] bg-black/5 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Top spacer (1fr) */}
            <div />

            {/* Menu Container */}
            <motion.div
              ref={ref}
              className={cn(
                // Size
                'mx-auto w-full max-w-xl',
                // Glass morphism
                'bg-white backdrop-blur-md',
                // Border and shadow
                'rounded-2xl ring-1 ring-zinc-950/2',
                'shadow-xl',
                // Overflow
                'overflow-hidden',
              )}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: { type: 'spring', stiffness: 400, damping: 30 },
              }}
              exit={{
                opacity: 0,
                scale: 0.95,
                transition: { duration: 0.15 },
              }}
            >
              {children}
            </motion.div>

            {/* Bottom spacer (2fr) */}
            <div />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
