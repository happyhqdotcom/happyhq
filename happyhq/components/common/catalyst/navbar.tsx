// components/common/catalyst/navbar.tsx
'use client'

import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import { LayoutGroup, motion } from 'framer-motion'
import React, { forwardRef, useId } from 'react'
import { TouchTarget } from './button'
import { Link } from './link'

export function Navbar({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav
      {...props}
      className={clsx(className, 'flex flex-1 items-center gap-4')}
    />
  )
}

export function NavbarDivider({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      aria-hidden="true"
      {...props}
      className={clsx(className, 'h-6 w-px bg-zinc-950/10 dark:bg-white/10')}
    />
  )
}

export function NavbarSection({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  const id = useId()

  return (
    <LayoutGroup id={id}>
      <div
        {...props}
        className={clsx(
          className,
          '[-ms-overflow-style: none] no-scrollbar flex items-center gap-3 overflow-x-auto overflow-y-hidden py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      />
    </LayoutGroup>
  )
}

export function NavbarSpacer({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      aria-hidden="true"
      {...props}
      className={clsx(className, '-ml-4 flex-1')}
    />
  )
}

export const NavbarItem = forwardRef(function NavbarItem(
  {
    current,
    primary,
    className,
    children,
    ...props
  }: {
    current?: boolean
    primary?: boolean
    className?: string
    children: React.ReactNode
  } & (
    | Omit<Headless.ButtonProps, 'as' | 'className'>
    | Omit<React.ComponentPropsWithoutRef<typeof Link>, 'className'>
  ),
  ref: React.ForwardedRef<HTMLAnchorElement | HTMLButtonElement>,
) {
  const classes = clsx(
    // Base
    'relative my-1 flex min-h-7 min-w-0 shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-base/6 font-medium text-zinc-950 focus:outline-none sm:text-sm/5',
    // Leading icon/icon-only
    '*:data-[slot=icon]:size-6 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:fill-zinc-500 sm:*:data-[slot=icon]:size-5',
    // Trailing icon (down chevron or similar)
    '*:not-nth-2:last:data-[slot=icon]:ml-auto *:not-nth-2:last:data-[slot=icon]:size-5 sm:*:not-nth-2:last:data-[slot=icon]:size-4',
    // Avatar
    '*:data-[slot=avatar]:-m-0.5 *:data-[slot=avatar]:size-7 *:data-[slot=avatar]:[--avatar-radius:var(--radius)] *:data-[slot=avatar]:[--ring-opacity:10%] sm:*:data-[slot=avatar]:size-6',
    // Hover
    'data-hover:bg-zinc-950/5 data-hover:*:data-[slot=icon]:fill-zinc-950',
    // Active
    'data-active:bg-zinc-950/5 data-active:ring data-active:ring-black/10 data-active:ring-inset data-active:*:data-[slot=icon]:fill-zinc-950',
    // Dark mode
    'dark:text-white dark:*:data-[slot=icon]:fill-zinc-400',
    'dark:data-hover:bg-white/10 dark:data-hover:*:data-[slot=icon]:fill-white',
    'dark:data-active:bg-white/10 dark:data-active:*:data-[slot=icon]:fill-white',
    // Primary
    'data-primary:bg-black/10 data-primary:ring data-primary:ring-black/5 data-primary:ring-inset data-primary:hover:bg-black/5',
  )

  return (
    <span className={clsx(className, 'relative')}>
      {current && (
        <motion.span
          layoutId="item"
          className="absolute inset-x-2 -bottom-1 h-1 rounded-t-2xl bg-black/15"
        />
      )}
      {'href' in props ? (
        <Link
          {...props}
          className={classes}
          data-current={current ? 'true' : undefined}
          data-primary={primary ? '' : undefined}
          ref={ref as React.ForwardedRef<HTMLAnchorElement>}
        >
          <TouchTarget>{children}</TouchTarget>
        </Link>
      ) : (
        <Headless.Button
          {...props}
          className={clsx('cursor-default', classes)}
          data-current={current ? 'true' : undefined}
          data-primary={primary ? '' : undefined}
          ref={ref}
        >
          <TouchTarget>{children}</TouchTarget>
        </Headless.Button>
      )}
    </span>
  )
})

export function NavbarLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return <span {...props} className={clsx(className, 'truncate')} />
}
