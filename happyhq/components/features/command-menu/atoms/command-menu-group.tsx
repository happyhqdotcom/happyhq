// Command Menu Group
// Section header with heading

'use client'

import { Command as CommandPrimitive } from 'cmdk'
import { ReactNode } from 'react'

interface CommandMenuGroupProps {
  heading: string
  children: ReactNode
}

export function CommandMenuGroup({ heading, children }: CommandMenuGroupProps) {
  return (
    <CommandPrimitive.Group>
      <div className="flex items-center px-3 py-1.5 select-none">
        <span className="text-xs font-medium text-zinc-500">{heading}</span>
      </div>
      {children}
    </CommandPrimitive.Group>
  )
}
